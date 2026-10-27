import { describe, it, expect } from 'vitest';
import { sropAgent, ExtrairOcorrenciaSchema } from './srop-agent.ts';
import { enriquecerExtracao } from '../tools/enriquecer-catalogo.ts';

// Teste de integração: faz uma chamada real ao endpoint vLLM configurado em env.ts.
describe('sropAgent', () => {
  it('extrai e estrutura os crimes de uma narrativa de boletim de ocorrência', async () => {
    const narrativaBO = JSON.stringify({
      numeroBoletim: '202.510.165',
      narrativa:
        'Dia 12/09/2026, às 21h45, na Rua das Acácias, nº 78, ' +
        'o suspeito João da Silva, 34 anos, portando arma branca, ' +
        'abordou a vítima Maria Oliveira, 27, exigindo a entrega ' +
        'de pertences pessoais. A vítima entregou bolsa, celular ' +
        'e carteira, mas o agressor fugiu em direção ao bairro Vila Nova. ' +
        'Testemunhas ouviram gritos e relataram que o suspeito vestia ' +
        'jaqueta preta e calça jeans. Foi registrado o número de série ' +
        'do celular (IMEI 357...); a vítima sofreu choque emocional, ' +
        'sem lesões físicas. A polícia realizou busca nas imediações, ' +
        'mas o suspeito não foi localizado. O boletim foi encaminhado ' +
        'à Delegacia de Homicídios para investigação.',
    });

    const response = await sropAgent.generate(narrativaBO, {
      modelSettings: {
        temperature: 0,
      },
      structuredOutput: {
        schema: ExtrairOcorrenciaSchema,
        errorStrategy: 'strict',
      },
    });

    // `response.object` já é validado pelo schema; o parse garante o tipo em runtime.
    const resultado = ExtrairOcorrenciaSchema.parse(response.object);

    expect(resultado.crimes).toBeInstanceOf(Array);
    expect(resultado.crimes.length).toBeGreaterThan(0);

    const primeiroCrime = resultado.crimes[0];
    expect(primeiroCrime?.natureza).toBeTypeOf('string');
    expect(primeiroCrime?.forma).toBeTypeOf('string');
    expect(primeiroCrime?.trecho_identificador.length).toBeGreaterThan(0);

    // Etapa determinística: casa a classificação (texto livre) com o catálogo.
    const enriquecido = enriquecerExtracao(resultado);
    expect(enriquecido.crimes).toHaveLength(resultado.crimes.length);
    expect(enriquecido.crimes[0]?.natureza.original).toBe(
      primeiroCrime?.natureza,
    );
  }, 30_000); // Timeout estendido devido à chamada de modelo LLM.
});
