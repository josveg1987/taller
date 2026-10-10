import { describe, expect, it } from 'vitest';
import { construirDocumento, fechaCl, pesos, type PresupuestoParaPdf, type TallerParaPdf } from '../src/pdf/pdf.documento';

const taller: TallerParaPdf = { nombre: 'Taller Sur', direccion: 'Av. Pajaritos 1234, Maipú', telefono: '+56 9 1111 2222', datosTransferencia: 'Banco X · Cta 123', logoSvg: null };

const base: PresupuestoParaPdf = {
  numero: 12,
  fecha: '2026-10-10',
  validoHasta: '2026-10-25',
  cliente: { nombre: 'María Pérez', telefono: '+56 9 8765 4321' },
  vehiculo: { patente: 'ABCD12', marca: 'Toyota', modelo: 'Yaris', anio: 2019 },
  lineas: [
    { nombre: 'Capot', posicion: 'no_aplica', operacion: 'reparar', desabollado: 60000, precioTotal: 140000 },
    { nombre: 'Puerta delantera', posicion: 'izquierda', operacion: 'reemplazar', desabollado: 0, precioTotal: 205000 },
    { nombre: 'Pulido de focos', posicion: 'no_aplica', operacion: 'libre', desabollado: 0, precioTotal: 25000 },
  ],
  subtotal: 370000,
  descuento: 10000,
  total: 360000,
  montoInicio: 125000,
  plazoDias: 6,
  observaciones: 'Incluye pulido general',
  condiciones: 'Garantía de 6 meses.',
};

const textoDe = (p: PresupuestoParaPdf, t: TallerParaPdf = taller) => JSON.stringify(construirDocumento(t, p));

describe('formato', () => {
  it('pesos y fechas al estilo chileno', () => {
    expect(pesos(80000)).toBe('$80.000');
    expect(pesos(-10000)).toBe('-$10.000');
    expect(fechaCl('2026-10-25')).toBe('25-10-2026');
  });
});

describe('documento del presupuesto', () => {
  it('trae lo que ve el cliente: taller, numero, trabajos, totales, plazo, condiciones y transferencia', () => {
    const t = textoDe(base);
    for (const esperado of ['Taller Sur', 'Av. Pajaritos 1234', 'N° 12', '10-10-2026', '25-10-2026', 'María Pérez', 'ABCD12', 'Toyota Yaris 2019']) {
      expect(t).toContain(esperado);
    }
    for (const esperado of ['Puerta delantera izquierda', 'Desabollado y pintura', 'Cambio de pieza y pintura', 'Pulido de focos']) {
      expect(t).toContain(esperado);
    }
    for (const esperado of ['$360.000', '-$10.000', '$125.000', '6 días hábiles', 'Incluye pulido general', 'Garantía de 6 meses.', 'Banco X']) {
      expect(t).toContain(esperado);
    }
  });

  it('omite lo que no aplica: descuento, anticipo, plazo, observaciones, condiciones y transferencia', () => {
    const t = textoDe(
      { ...base, descuento: 0, montoInicio: 0, plazoDias: null, observaciones: null, condiciones: '' },
      { ...taller, datosTransferencia: null, direccion: null, telefono: null },
    );
    for (const ausente of ['Descuento', 'Para iniciar el trabajo', 'Plazo estimado', 'Observaciones', 'Condiciones', 'transferencia']) {
      expect(t).not.toContain(ausente);
    }
  });

  it('con logo lo dibuja en vez del nombre en texto grande', () => {
    const logo = '<svg viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg>';
    const con = construirDocumento({ ...taller, logoSvg: logo }, base);
    expect(JSON.stringify(con)).toContain('"svg"');
    expect(JSON.stringify(con)).not.toContain('"text":"Taller Sur","fontSize":20');
    expect(JSON.stringify(construirDocumento(taller, base))).not.toContain('"svg"');
  });

  it('un dia de plazo va en singular', () => {
    expect(textoDe({ ...base, plazoDias: 1 })).toContain('1 día hábil');
  });

  it('nunca incluye la vista interna (costos ni ganancia)', () => {
    const t = textoDe(base).toLowerCase();
    for (const prohibido of ['costo', 'ganancia', 'margen']) expect(t).not.toContain(prohibido);
  });
});
