import catalogo from './catalogo.json' with { type: 'json' };

/**
 * Casamento (match) de valores em texto livre produzidos pelo agente contra o
 * catálogo oficial (`catalogo.json`). Lógica pura, sem dependências do Mastra,
 * para ser testável isoladamente e reutilizável fora da tool.
 */

export type CategoriaCatalogo =
  | 'natureza'
  | 'motivacao'
  | 'meio_empregado'
  | 'tipo_violencia';

export const CATEGORIAS = [
  'natureza',
  'motivacao',
  'meio_empregado',
  'tipo_violencia',
] as const satisfies readonly CategoriaCatalogo[];

export type ItemCatalogo = {
  id: number;
  descricao: string;
  legislacao?: string;
  artigo?: string;
};

export type Correspondencia = ItemCatalogo & {
  /** Similaridade 0..1 (1 = idêntico após normalização). */
  score: number;
};

export type ResultadoTermo = {
  /** Termo original consultado (como veio do agente). */
  termo: string;
  /** Melhor correspondência acima de `minScore`, ou `null` se nenhuma. */
  match: Correspondencia | null;
  /** Candidatos ordenados por score (inclui o `match`), limitados a `limite`. */
  candidatos: Correspondencia[];
};

export type OpcoesCasamento = {
  /** Nº máximo de candidatos retornados por termo. Padrão 3. */
  limite?: number;
  /** Score mínimo para um candidato ser considerado. Padrão 0.45. */
  minScore?: number;
};

// --- Normalização e similaridade ------------------------------------------

/** Maiúsculas, sem acentos, só alfanumérico, espaços colapsados. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '') // remove diacríticos (marcas combinantes)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Conjunto de trigramas de caracteres (com padding de bordas). */
function trigramas(texto: string): Set<string> {
  const alvo = ` ${texto} `;
  const set = new Set<string>();
  for (let i = 0; i < alvo.length - 2; i += 1) {
    set.add(alvo.slice(i, i + 3));
  }
  return set;
}

/** Coeficiente de Sørensen–Dice entre dois conjuntos. */
function dice<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersecao = 0;
  for (const item of a) {
    if (b.has(item)) intersecao += 1;
  }
  return (2 * intersecao) / (a.size + b.size);
}

type ItemIndexado = ItemCatalogo & {
  norm: string;
  tri: Set<string>;
  tokens: Set<string>;
};

/** Registro bruto do catálogo (schema heterogêneo entre categorias/itens). */
type ItemCatalogoBruto = Record<string, unknown>;

function asTexto(valor: unknown): string | undefined {
  return typeof valor === 'string' && valor.trim() !== '' ? valor : undefined;
}

function asNumero(valor: unknown): number | undefined {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : undefined;
}

/**
 * Normaliza um registro bruto para `ItemCatalogo`, tolerando variações de
 * nomes de campo encontradas no catálogo (`descricao`/`nome`, `id`/
 * `idNaturezaOcorrencia`). Retorna `null` para registros sem id ou descrição.
 */
function adaptar(raw: ItemCatalogoBruto): ItemCatalogo | null {
  const descricao = asTexto(raw.descricao) ?? asTexto(raw.nome);
  const id =
    asNumero(raw.id) ??
    asNumero(raw.idNaturezaOcorrencia) ??
    asNumero(raw.idNaturezaOcorrenciaBo);
  if (descricao === undefined || id === undefined) return null;

  const legislacao = asTexto(raw.legislacao);
  const artigo = asTexto(raw.artigo);
  return {
    id,
    descricao,
    ...(legislacao !== undefined ? { legislacao } : {}),
    ...(artigo !== undefined ? { artigo } : {}),
  };
}

/**
 * Similaridade combinada entre o termo consultado e um item do catálogo.
 * Mistura trigramas (robusto a abreviações como "ARMA FOGO S/ AUTORIZ") com
 * sobreposição de tokens, e dá um piso alto quando um texto contém o outro.
 */
function similaridade(
  consultaNorm: string,
  consultaTri: Set<string>,
  consultaTokens: Set<string>,
  item: ItemIndexado,
): number {
  if (!consultaNorm || !item.norm) return 0;
  if (consultaNorm === item.norm) return 1;

  const tri = dice(consultaTri, item.tri);
  const tok = dice(consultaTokens, item.tokens);
  let score = 0.5 * tri + 0.5 * tok;

  if (item.norm.includes(consultaNorm) || consultaNorm.includes(item.norm)) {
    score = Math.max(score, 0.85);
  }
  return score;
}

// --- Índice pré-computado do catálogo --------------------------------------

function indexar(itens: ItemCatalogoBruto[]): ItemIndexado[] {
  const indexados: ItemIndexado[] = [];
  for (const raw of itens) {
    const item = adaptar(raw);
    if (item === null) continue;
    const norm = normalizar(item.descricao);
    indexados.push({
      ...item,
      norm,
      tri: trigramas(norm),
      tokens: new Set(norm.split(' ')),
    });
  }
  return indexados;
}

const CATALOGO = catalogo as Record<CategoriaCatalogo, ItemCatalogoBruto[]>;

const INDICE: Record<CategoriaCatalogo, ItemIndexado[]> = {
  natureza: indexar(CATALOGO.natureza),
  motivacao: indexar(CATALOGO.motivacao),
  meio_empregado: indexar(CATALOGO.meio_empregado),
  tipo_violencia: indexar(CATALOGO.tipo_violencia),
};

// --- API pública ------------------------------------------------------------

/** Monta uma Correspondencia respeitando exactOptionalPropertyTypes. */
function toCorrespondencia(item: ItemIndexado, score: number): Correspondencia {
  return {
    id: item.id,
    descricao: item.descricao,
    score: Math.round(score * 1000) / 1000,
    ...(item.legislacao !== undefined ? { legislacao: item.legislacao } : {}),
    ...(item.artigo !== undefined ? { artigo: item.artigo } : {}),
  };
}

/** Casa um único termo contra uma categoria do catálogo. */
export function casarTermo(
  categoria: CategoriaCatalogo,
  termo: string,
  opcoes: OpcoesCasamento = {},
): ResultadoTermo {
  const limite = opcoes.limite ?? 3;
  const minScore = opcoes.minScore ?? 0.45;

  const consultaNorm = normalizar(termo);
  const consultaTri = trigramas(consultaNorm);
  const consultaTokens = new Set(consultaNorm.split(' '));

  const candidatos = INDICE[categoria]
    .map((item) =>
      toCorrespondencia(
        item,
        similaridade(consultaNorm, consultaTri, consultaTokens, item),
      ),
    )
    .filter((c) => c.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limite);

  return {
    termo,
    match: candidatos[0] ?? null,
    candidatos,
  };
}

/** Casa uma lista de termos de uma mesma categoria. */
export function casarTermos(
  categoria: CategoriaCatalogo,
  termos: readonly string[],
  opcoes: OpcoesCasamento = {},
): ResultadoTermo[] {
  return termos.map((termo) => casarTermo(categoria, termo, opcoes));
}
