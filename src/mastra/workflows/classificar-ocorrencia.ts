import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { sropAgent, ExtrairOcorrenciaSchema } from '../agents/srop-agent.ts';
import {
  enriquecerExtracao,
  ExtracaoEnriquecidaSchema,
} from '../tools/enriquecer-catalogo.ts';

/**
 * Pipeline completo: classifica a narrativa (schema `strict` ENFORCED) e, em
 * seguida, casa os valores com o catálogo por código. Expor isto como workflow
 * — em vez do agente cru — garante saída estável no playground/API, já que o
 * playground chama o agente sem aplicar `structuredOutput`.
 */

const entradaSchema = z.object({
  narrativa: z.string().min(1).describe('Narrativa do boletim de ocorrência'),
});

const classificarStep = createStep({
  id: 'classificar',
  inputSchema: entradaSchema,
  outputSchema: ExtrairOcorrenciaSchema,
  execute: async ({ inputData }) => {
    const resposta = await sropAgent.generate(inputData.narrativa, {
      modelSettings: { temperature: 0 },
      structuredOutput: {
        schema: ExtrairOcorrenciaSchema,
        errorStrategy: 'strict',
      },
    });
    // Revalida em runtime; garante conformidade antes de enriquecer.
    return ExtrairOcorrenciaSchema.parse(resposta.object);
  },
});

const enriquecerStep = createStep({
  id: 'enriquecer-catalogo',
  inputSchema: ExtrairOcorrenciaSchema,
  outputSchema: ExtracaoEnriquecidaSchema,
  execute: async ({ inputData }) => enriquecerExtracao(inputData),
});

export const classificarOcorrenciaWorkflow = createWorkflow({
  id: 'classificar-ocorrencia',
  inputSchema: entradaSchema,
  outputSchema: ExtracaoEnriquecidaSchema,
})
  .then(classificarStep)
  .then(enriquecerStep)
  .commit();
