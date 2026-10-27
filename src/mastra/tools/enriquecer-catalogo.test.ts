import { describe, it, expect } from 'vitest';
import { enriquecerExtracao } from './enriquecer-catalogo.ts';
import type { ExtracaoOcorrencia } from '../agents/srop-agent.ts';

const extracao: ExtracaoOcorrencia = {
  crimes: [
    {
      natureza: 'lesão corporal',
      motivacao: ['OUTRO(S)'],
      meio_empregado: 'arma de fogo',
      tipo_violencia: ['física'],
      forma: 'CONSUMADO',
      trecho_identificador: ['sofreu fratura no braço direito'],
    },
  ],
};

describe('enriquecerExtracao', () => {
  it('preserva forma, motivacao e trecho sem alterar os valores do agente', () => {
    const r = enriquecerExtracao(extracao);
    const crime = r.crimes[0]!;
    expect(crime.forma).toBe('CONSUMADO');
    expect(crime.motivacao[0]?.original).toBe('OUTRO(S)');
    expect(crime.trecho_identificador).toEqual([
      'sofreu fratura no braço direito',
    ]);
  });

  it('resolve cada campo contra o catálogo com id e score confiáveis', () => {
    const r = enriquecerExtracao(extracao);
    const crime = r.crimes[0]!;

    expect(crime.natureza.catalogo?.descricao).toBe('LESÃO CORPORAL');
    expect(crime.meio_empregado.catalogo?.descricao).toBe('ARMA DE FOGO');
    expect(crime.tipo_violencia[0]?.catalogo?.descricao).toBe('FÍSICA');
    expect(crime.tipo_violencia[0]?.catalogo?.score).toBe(1);
  });

  it('mantém a estrutura (arrays continuam arrays)', () => {
    const r = enriquecerExtracao(extracao);
    const crime = r.crimes[0]!;
    expect(Array.isArray(crime.motivacao)).toBe(true);
    expect(Array.isArray(crime.tipo_violencia)).toBe(true);
    expect(Array.isArray(crime.trecho_identificador)).toBe(true);
  });
});
