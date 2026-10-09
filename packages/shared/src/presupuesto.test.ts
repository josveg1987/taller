import { describe, expect, it } from 'vitest';
import { calcularMontoInicio, calcularPresupuesto, type LineaInput } from './presupuesto';

// Caso de ejemplo usado en el diseno: 3 piezas, margen 25%, pintura $80.000.
const ejemplo: LineaInput[] = [
  { operacion: 'reemplazar', pintura: 80000, repuestoCosto: 200000, margenPct: 25 },
  { operacion: 'reemplazar', pintura: 80000, repuestoCosto: 120000, margenPct: 25 },
  { operacion: 'reparar', pintura: 80000, desabollado: 60000, margenPct: 25 },
];

describe('calcularPresupuesto', () => {
  it('calcula el ejemplo de $700.000', () => {
    const r = calcularPresupuesto(ejemplo);
    expect(r.lineas.map((l) => l.precioTotal)).toEqual([330000, 230000, 140000]);
    expect(r.total).toBe(700000);
    expect(r.costoRepuestos).toBe(320000);
    expect(r.precioRepuestos).toBe(400000);
    expect(r.gananciaRepuestos).toBe(80000);
  });

  it('ignora el desabollado al reemplazar y el repuesto al reparar', () => {
    const r = calcularPresupuesto([
      { operacion: 'reemplazar', pintura: 80000, desabollado: 50000, repuestoCosto: 100000, margenPct: 0 },
      { operacion: 'reparar', pintura: 80000, repuestoCosto: 100000, margenPct: 0 },
    ]);
    expect(r.lineas.map((l) => l.precioTotal)).toEqual([180000, 80000]);
  });

  it('aplica descuento sin dejar el total negativo', () => {
    expect(calcularPresupuesto(ejemplo, 50000).total).toBe(650000);
    expect(calcularPresupuesto(ejemplo, 9999999).total).toBe(0);
  });

  it('redondea a pesos enteros', () => {
    const r = calcularPresupuesto([
      { operacion: 'reemplazar', pintura: 0, repuestoCosto: 10001, margenPct: 25 },
    ]);
    expect(r.total).toBe(12501);
  });
});

describe('calcularMontoInicio', () => {
  const p = calcularPresupuesto(ejemplo);
  it('sin anticipo', () => expect(calcularMontoInicio(p, { tipo: 'ninguno' })).toBe(0));
  it('monto de repuestos', () => expect(calcularMontoInicio(p, { tipo: 'repuestos' })).toBe(400000));
  it('porcentaje', () => expect(calcularMontoInicio(p, { tipo: 'porcentaje', valor: 50 })).toBe(350000));
  it('fijo, sin pasarse del total', () => {
    expect(calcularMontoInicio(p, { tipo: 'fijo', valor: 100000 })).toBe(100000);
    expect(calcularMontoInicio(p, { tipo: 'fijo', valor: 999999999 })).toBe(700000);
  });
});
