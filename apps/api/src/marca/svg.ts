import { BadRequestException } from '@nestjs/common';

const MAX_BYTES = 100_000;

/**
 * Valida y limpia un logo SVG subido por el administrador de la app. Se rechaza todo lo que pueda
 * ejecutar codigo o cargar algo externo (scripts, objetos incrustados, imagenes, enlaces, estilos
 * con url, atributos on...). Solo se aceptan SVG de trazos y formas, como los logos de Vega.
 */
export function sanearSvg(entrada: unknown): string {
  if (typeof entrada !== 'string') throw new BadRequestException('El logo debe ser un archivo SVG');
  const svg = entrada.replace(/^﻿/, '').trim();
  if (Buffer.byteLength(svg) > MAX_BYTES) throw new BadRequestException('El logo pesa demasiado (máximo 100 KB)');
  if (!/^(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(svg) || !/<\/svg>\s*$/i.test(svg)) {
    throw new BadRequestException('El archivo no es un SVG válido');
  }
  if (!/<svg[^>]*\sviewBox\s*=/i.test(svg)) throw new BadRequestException('El SVG debe traer viewBox');

  const prohibidos: [RegExp, string][] = [
    [/<\s*script/i, 'scripts'],
    [/<\s*foreignObject/i, 'foreignObject'],
    [/<\s*(image|iframe|embed|object|audio|video|animate|set)\b/i, 'imágenes u objetos incrustados'],
    [/<!DOCTYPE|<!ENTITY/i, 'declaraciones DOCTYPE o ENTITY'],
    [/\son[a-z]+\s*=/i, 'atributos de eventos (on…)'],
    [/javascript:/i, 'enlaces javascript:'],
    [/\b(?:xlink:)?href\s*=\s*["'](?!#)/i, 'enlaces externos'],
    [/url\(\s*["']?\s*(?!#)/i, 'url() externas'],
    [/@import/i, '@import'],
  ];
  for (const [re, nombre] of prohibidos) {
    if (re.test(svg)) throw new BadRequestException(`El SVG no puede contener ${nombre}`);
  }
  return svg;
}
