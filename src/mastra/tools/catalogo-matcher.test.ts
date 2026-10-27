import { describe, it, expect } from 'vitest';
import catalogo from './catalogo.json' with { type: 'json' };
import { casarTermo, casarTermos } from './catalogo-matcher.ts';

describe('casarTermo', () => {
  it('casa termo idêntico com score 1', () => {
    const alvo = catalogo.tipo_violencia[0]!; // ex.: "FÍSICA"
    const r = casarTermo('tipo_violencia', alvo.descricao);
    expect(r.match?.id).toBe(alvo.id);
    expect(r.match?.score).toBe(1);
  });

  it('é robusto a acentos e caixa (normalização)', () => {
    const r = casarTermo('tipo_violencia', '  física ');
    expect(r.match?.descricao).toBe('FÍSICA');
    expect(r.match?.score).toBe(1);
  });

  it('casa descrição aproximada acima do limiar', () => {
    const r = casarTermo('meio_empregado', 'arma de fogo');
    expect(r.match?.descricao).toBe('ARMA DE FOGO');
    expect(r.match?.score).toBeGreaterThanOrEqual(0.85);
  });

  it('retorna match nulo quando nada atinge minScore', () => {
    const r = casarTermo('tipo_violencia', 'xyzqwk inexistente', {
      minScore: 0.9,
    });
    expect(r.match).toBeNull();
    expect(r.candidatos).toHaveLength(0);
  });

  it('respeita o limite de candidatos', () => {
    const r = casarTermo('natureza', 'arma de fogo', {
      limite: 2,
      minScore: 0.1,
    });
    expect(r.candidatos.length).toBeLessThanOrEqual(2);
  });

  it('ordena candidatos por score decrescente', () => {
    const r = casarTermo('natureza', 'poluição', { minScore: 0.1, limite: 5 });
    const scores = r.candidatos.map((c) => c.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });
});

describe('casarTermos', () => {
  it('casa uma lista preservando a ordem de entrada', () => {
    const r = casarTermos('tipo_violencia', ['FÍSICA', 'moral']);
    expect(r.map((x) => x.termo)).toEqual(['FÍSICA', 'moral']);
    expect(r[0]?.match?.descricao).toBe('FÍSICA');
    expect(r[1]?.match?.descricao).toBe('MORAL');
  });
});
