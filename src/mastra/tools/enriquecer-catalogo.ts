import { z } from 'zod';
import {
  casarTermo,
  type CategoriaCatalogo,
  type OpcoesCasamento,
} from './catalogo-matcher.ts';
import type { ExtracaoOcorrencia } from '../agents/srop-agent.ts';

/**
 * Enriquecimento determinístico: recebe a extração em texto livre produzida
 * pelo agente e casa cada campo com o catálogo oficial POR CÓDIGO.
 *
 * Isso é feito fora da geração do LLM de propósito — pedir ao modelo para
 * embutir ids/scores no structured output gera estrutura inconsistente e
 * scores fabricados. Aqui os ids/scores vêm do matcher, de forma confiável.
 */

const CorrespondenciaSchema = z.object({
  id: z.number().int(),
  descricao: z.string(),
  score: z.number().min(0).max(1),
  legislacao: z.string().optional(),
  artigo: z.string().optional(),
});

/** Um campo original (texto do agente) já resolvido contra o catálogo. */
export const CampoResolvidoSchema = z.object({
  /** Valor original, em texto livre, como veio do agente. */
  original: z.string(),
  /** Melhor correspondência no catálogo, ou `null` se nenhuma atingiu o limiar. */
  catalogo: CorrespondenciaSchema.nullable(),
  /** Demais candidatos ordenados por score (para revisão/auditoria). */
  candidatos: z.array(CorrespondenciaSchema),
});

export const CrimeEnriquecidoSchema = z.object({
  natureza: CampoResolvidoSchema,
  motivacao: z.array(CampoResolvidoSchema),
  meio_empregado: CampoResolvidoSchema,
  tipo_violencia: z.array(CampoResolvidoSchema),
  forma: z.enum(['TENTADO', 'CONSUMADO']),
  trecho_identificador: z.array(z.string()),
});

export const ExtracaoEnriquecidaSchema = z.object({
  crimes: z.array(CrimeEnriquecidoSchema),
});

export type CampoResolvido = z.infer<typeof CampoResolvidoSchema>;
export type CrimeEnriquecido = z.infer<typeof CrimeEnriquecidoSchema>;
export type ExtracaoEnriquecida = z.infer<typeof ExtracaoEnriquecidaSchema>;

function resolver(
  categoria: CategoriaCatalogo,
  termo: string,
  opcoes?: OpcoesCasamento,
): CampoResolvido {
  const { match, candidatos } = casarTermo(categoria, termo, opcoes);
  return { original: termo, catalogo: match, candidatos };
}

/** Enriquece a extração inteira casando cada campo com o catálogo. */
export function enriquecerExtracao(
  extracao: ExtracaoOcorrencia,
  opcoes?: OpcoesCasamento,
): ExtracaoEnriquecida {
  return {
    crimes: extracao.crimes.map((crime) => ({
      natureza: resolver('natureza', crime.natureza, opcoes),
      motivacao: crime.motivacao.map((m) => resolver('motivacao', m, opcoes)),
      meio_empregado: resolver('meio_empregado', crime.meio_empregado, opcoes),
      tipo_violencia: crime.tipo_violencia.map((t) =>
        resolver('tipo_violencia', t, opcoes),
      ),
      forma: crime.forma,
      trecho_identificador: crime.trecho_identificador,
    })),
  };
}
