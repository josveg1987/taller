import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { sanearSvg } from '../src/marca/svg';

const BASE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10z" fill="#112233"/></svg>';

describe('sanearSvg', () => {
  it('acepta un SVG de trazos y devuelve el texto limpio', () => {
    expect(sanearSvg(`﻿  ${BASE}\n`)).toBe(BASE);
  });

  it('acepta el logo real de Vega', () => {
    const vega = readFileSync(new URL('../../../vega-logo-pack/vega-logo/logos/svg/horizontal-color-naranja.svg', import.meta.url), 'utf8');
    expect(sanearSvg(vega)).toContain('<svg');
  });

  it('acepta referencias internas (#id) y gradientes', () => {
    const conGradiente = '<svg viewBox="0 0 4 4"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><rect width="4" height="4" fill="url(#g)"/><use href="#r"/></svg>';
    expect(() => sanearSvg(conGradiente)).not.toThrow();
  });

  it.each([
    ['script', BASE.replace('<path', '<script>alert(1)</script><path')],
    ['evento onload', BASE.replace('<svg ', '<svg onload="x()" ')],
    ['foreignObject', BASE.replace('<path', '<foreignObject><div/></foreignObject><path')],
    ['imagen incrustada', BASE.replace('<path', '<image href="data:image/png;base64,AAAA"/><path')],
    ['enlace externo', BASE.replace('<path', '<use xlink:href="https://malo.cl/x.svg#a"/><path')],
    ['javascript:', BASE.replace('<path', '<a href="javascript:alert(1)"><path')],
    ['url externa', BASE.replace('fill="#112233"', 'fill="url(https://malo.cl/a)"')],
    ['entidad', '<!DOCTYPE svg [<!ENTITY x "y">]>' + BASE],
    ['sin viewBox', BASE.replace(' viewBox="0 0 10 10"', '')],
    ['no es svg', '<html></html>'],
    ['no es texto', 123],
    ['demasiado pesado', BASE.replace('</svg>', `<!--${'x'.repeat(100_001)}--></svg>`)],
  ])('rechaza %s', (_nombre, entrada) => {
    expect(() => sanearSvg(entrada)).toThrow();
  });
});
