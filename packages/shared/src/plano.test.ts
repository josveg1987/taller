import { describe, expect, it } from 'vitest';
import { clavePlano, esZona, LISTA_ZONAS, piezasDelPlano, svgPlano, ZONAS } from './plano';

describe('plano del auto', () => {
  it('tiene las 17 piezas del esquema: 6 por lado (x2) y 5 sin lado', () => {
    const piezas = piezasDelPlano();
    expect(piezas).toHaveLength(17);
    expect(LISTA_ZONAS.filter((z) => ZONAS[z].porLado)).toHaveLength(6);
    expect(new Set(piezas.map((p) => p.clave)).size).toBe(17);
  });

  it('cada pieza se ve al menos en una vista, y las de lado en su lateral', () => {
    for (const p of piezasDelPlano()) {
      expect(p.trozos.length, p.clave).toBeGreaterThan(0);
      for (const t of p.trozos) expect(t.s.length, p.clave).toBeGreaterThan(10);
    }
    // Las piezas sin lado salen en los dos laterales (el derecho en espejo: escala negativa).
    const capot = piezasDelPlano().find((p) => p.clave === 'capot')!;
    expect(capot.trozos.filter((t) => t.transform.includes('scale(-')).length).toBe(1);
  });

  it('claves y zonas', () => {
    expect(clavePlano('puerta_delantera', 'izquierda')).toBe('puerta_delantera|izquierda');
    expect(clavePlano('capot', 'derecha')).toBe('capot');
    expect(esZona('techo')).toBe(true);
    expect(esZona('alerón')).toBe(false);
    expect(esZona('toString')).toBe(false);
  });

  it('el SVG colorea con franjas lo que se repara y lleno lo que se cambia', () => {
    const nada = svgPlano(new Map());
    expect(nada).not.toContain('url(#plano-reparar)"');
    const svg = svgPlano(new Map([['capot', 'reparar'], ['espejo|derecha', 'reemplazar']]));
    expect(svg).toContain('fill="url(#plano-reparar)"');
    expect(svg).toContain('fill="#6F95C9"');
    expect(svg.startsWith('<svg')).toBe(true);
    // Sin clases ni variables CSS (pdfmake no las entiende).
    expect(svg).not.toMatch(/class=|var\(--/);
    expect(svgPlano(new Map(), 'frente')).toContain('viewBox="0 454 180 142"');
  });
});
