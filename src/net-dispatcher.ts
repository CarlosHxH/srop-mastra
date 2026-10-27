import dns from 'node:dns';
import net from 'node:net';
import { Agent, setGlobalDispatcher } from 'undici';

/**
 * Mitiga endpoints cujo DNS retorna múltiplos IPs em round-robin onde algum
 * está lento/inacessível (caso do vLLM de staging): o `fetch` do Node escolhe
 * um IP e, se calhar no ruim, estoura o timeout de conexão.
 *
 * Este dispatcher instala um `lookup` customizado que resolve todos os IPv4,
 * faz uma corrida de conexão TCP:443 e devolve o primeiro que responde (com
 * cache curto por host). O SNI/validação de certificado continua usando o
 * hostname, pois só trocamos o IP de destino do socket.
 *
 * Efeito colateral: importar este módulo já aplica o dispatcher global.
 */

const PORTA_PROBE = 443;
const PROBE_TIMEOUT_MS = 4000;
const CONNECT_TIMEOUT_MS = 20_000;
const CACHE_TTL_MS = 60_000;

type EntradaCache = { ip: string; expira: number };
const cache = new Map<string, EntradaCache>();

/** Resolve o primeiro IP que aceitar conexão TCP na porta de probe. */
function corridaDeConexao(ips: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    let pendentes = ips.length;
    let resolvido = false;
    let ultimoErro: Error = new Error('nenhum IP acessível');

    for (const ip of ips) {
      const socket = net.connect({ host: ip, port: PORTA_PROBE });
      const timer = setTimeout(() => {
        socket.destroy();
        falhou(new Error(`timeout TCP em ${ip}`));
      }, PROBE_TIMEOUT_MS);

      socket.once('connect', () => {
        clearTimeout(timer);
        socket.destroy();
        if (!resolvido) {
          resolvido = true;
          resolve(ip);
        }
      });
      socket.once('error', (erro: Error) => {
        clearTimeout(timer);
        falhou(erro);
      });
    }

    function falhou(erro: Error): void {
      ultimoErro = erro;
      pendentes -= 1;
      if (pendentes === 0 && !resolvido) reject(ultimoErro);
    }
  });
}

/** Escolhe (e cacheia) um IPv4 saudável para o hostname. */
async function escolherIp(hostname: string): Promise<string> {
  const agora = Date.now();
  const emCache = cache.get(hostname);
  if (emCache && emCache.expira > agora) return emCache.ip;

  const ips = await dns.promises.resolve4(hostname);
  if (ips.length === 0) throw new Error(`sem registros A para ${hostname}`);

  const ip = ips.length === 1 ? ips[0]! : await corridaDeConexao(ips);
  cache.set(hostname, { ip, expira: agora + CACHE_TTL_MS });
  return ip;
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | dns.LookupAddress[],
  family?: number,
) => void;

const lookup = (
  hostname: string,
  options: dns.LookupAllOptions | dns.LookupOptions,
  callback: LookupCallback,
): void => {
  escolherIp(hostname)
    .then((ip) => {
      if ((options as dns.LookupAllOptions).all) {
        callback(null, [{ address: ip, family: 4 }]);
      } else {
        callback(null, ip, 4);
      }
    })
    .catch(() => {
      // Qualquer falha (IP literal, IPv6, host interno) cai no resolver padrão.
      dns.lookup(hostname, options as dns.LookupOptions, callback as never);
    });
};

setGlobalDispatcher(
  new Agent({ connect: { timeout: CONNECT_TIMEOUT_MS, lookup } }),
);
