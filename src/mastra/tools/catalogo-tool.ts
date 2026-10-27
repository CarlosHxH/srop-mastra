import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  casarTermos,
  type CategoriaCatalogo,
  type ResultadoTermo,
} from './catalogo-matcher.ts';

const CorrespondenciaSchema = z.object({
  id: z.number().int(),
  descricao: z.string(),
  score: z.number().min(0).max(1),
  legislacao: z.string().optional(),
  artigo: z.string().optional(),
});

const ResultadoTermoSchema = z.object({
  termo: z.string(),
  match: CorrespondenciaSchema.nullable(),
  candidatos: z.array(CorrespondenciaSchema),
});

const inputSchema = z.object({
  natureza: z
    .array(z.string())
    .optional()
    .describe('Naturezas em texto livre a casar com o catálogo'),
  motivacao: z
    .array(z.string())
    .optional()
    .describe('Motivações em texto livre a casar com o catálogo'),
  meio_empregado: z
    .array(z.string())
    .optional()
    .describe('Meios empregados em texto livre a casar com o catálogo'),
  tipo_violencia: z
    .array(z.string())
    .optional()
    .describe('Tipos de violência em texto livre a casar com o catálogo'),
  limite: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(3)
    .describe('Nº máximo de candidatos por termo'),
  minScore: z
    .number()
    .min(0)
    .max(1)
    .default(0.45)
    .describe('Score mínimo (0..1) para considerar um candidato'),
});

const outputSchema = z.object({
  natureza: z.array(ResultadoTermoSchema),
  motivacao: z.array(ResultadoTermoSchema),
  meio_empregado: z.array(ResultadoTermoSchema),
  tipo_violencia: z.array(ResultadoTermoSchema),
});

/**
 * Casa os valores classificados pelo agente (texto livre) com as entradas
 * canônicas do catálogo, retornando `id` + descrição oficial + score por termo.
 */
export const casarCatalogoTool = createTool({
  id: 'casar-catalogo',
  description:
    'Casa naturezas, motivações, meios empregados e tipos de violência ' +
    '(em texto livre) com as entradas oficiais do catálogo, retornando o id, ' +
    'a descrição canônica e um score de similaridade para cada termo.',
  inputSchema,
  outputSchema,
  execute: async (input) => {
    const opcoes = { limite: input.limite, minScore: input.minScore };

    const casar = (
      categoria: CategoriaCatalogo,
      termos: string[] | undefined,
    ): ResultadoTermo[] => casarTermos(categoria, termos ?? [], opcoes);

    return {
      natureza: casar('natureza', input.natureza),
      motivacao: casar('motivacao', input.motivacao),
      meio_empregado: casar('meio_empregado', input.meio_empregado),
      tipo_violencia: casar('tipo_violencia', input.tipo_violencia),
    };
  },
});
