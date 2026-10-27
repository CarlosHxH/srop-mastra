import { config } from 'dotenv';
import { z } from 'zod';

config();

const envSchema = z.object({
  VLLM_MODEL: z
    .string()
    .regex(/^[^/]+\/.+$/, 'VLLM_MODEL deve estar no formato "provider/modelo" (ex.: "openai/gpt-oss-120b")')
    .default('custom/openai/gpt-oss-120b'),

  VLLM_BASE_URL: z
    .string()
    .url('VLLM_BASE_URL deve ser uma URL válida')
    .default('https://vllm-stage.al.mt.gov.br/v1')
    .transform((url) => url.replace(/\/+$/, '')),

  VLLM_API_KEY: z
    .string()
    .min(1, 'VLLM_API_KEY não pode ser vazia (use "EMPTY" para vLLM sem auth)')
    .default('EMPTY'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const detalhes = parsed.error.issues.map((issue) => `  - ${issue.path.join('.') || '(raiz)'}: ${issue.message}`).join('\n');
  throw new Error(`Variáveis de ambiente inválidas:\n${detalhes}`);
}

// O regex acima garante o formato `provider/modelo` em runtime.
export const VLLM_MODEL = parsed.data.VLLM_MODEL as `${string}/${string}`;
export const VLLM_BASE_URL = parsed.data.VLLM_BASE_URL;
export const VLLM_API_KEY = parsed.data.VLLM_API_KEY;
