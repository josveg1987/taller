import { describe, expect, it } from 'vitest';
import { logoDeMarca } from '@taller/shared';
import { construirDocumento, fechaCl, formatoRut, marcasDelPlano, pesos, type CuentaParaPdf, type PresupuestoParaPdf, type TallerParaPdf } from '../src/pdf/pdf.documento';

const falabella: CuentaParaPdf = {
  titular: 'Luis Humberto Vega Pozo',
  rut: '12647419-9',
  banco: 'Banco Falabella',
  tipoCuenta: 'corriente',
  numero: '1-980-432549-6',
  email: 'luisvega1912@gmail.com',
};
const mercadoPago: CuentaParaPdf = { ...falabella, banco: 'Mercado Pago', tipoCuenta: 'vista', numero: '1003355333' };

const taller: TallerParaPdf = {
  nombre: 'Taller Sur',
  direccion: 'Av. Pajaritos 1234, Maipú',
  telefono: '+56 9 1111 2222',
  notaPago: 'Envía el comprobante por WhatsApp',
  logoSvg: null,
  cuentas: [falabella, mercadoPago],
  detallePintura: ['Lijado y preparación de la superficie.', 'Aplicación de barniz.'],
  detalleDesabollado: ['Enderezado de la chapa.'],
};

const base: PresupuestoParaPdf = {
  numero: 12,
  fecha: '2026-10-10',
  validoHasta: '2026-10-25',
  cliente: { nombre: 'María Pérez', telefono: '+56 9 8765 4321' },
  vehiculo: { patente: 'ABCD12', marca: 'Toyota', modelo: 'Yaris', anio: 2019 },
  lineas: [
    { nombre: 'Capot', posicion: 'no_aplica', operacion: 'reparar', pintura: 80000, desabollado: 60000, precioTotal: 140000, descripcion: null, zona: 'capot' },
    { nombre: 'Puerta delantera', posicion: 'izquierda', operacion: 'reemplazar', pintura: 80000, desabollado: 0, precioTotal: 205000, descripcion: null, zona: 'puerta_delantera' },
    { nombre: 'Pulido de focos', posicion: 'no_aplica', operacion: 'libre', pintura: 0, desabollado: 0, precioTotal: 25000, descripcion: 'Pulido de los focos para recuperar su transparencia.', zona: null },
  ],
  subtotal: 370000,
  descuento: 10000,
  total: 360000,
  montoInicio: 125000,
  plazoDias: 6,
  observaciones: 'Incluye pulido general',
  condiciones: 'Garantía de 6 meses.',
};

// Incluye el encabezado de la primera pagina, que va en el fondo de pagina (una funcion).
const textoDe = (p: PresupuestoParaPdf, t: TallerParaPdf = taller) => {
  const doc = construirDocumento(t, p);
  const fondo = (doc.background as (pagina: number, tamano: unknown) => unknown)(1, {});
  return JSON.stringify(fondo) + JSON.stringify(doc);
};

describe('formato', () => {
  it('pesos, fechas y RUT al estilo chileno', () => {
    expect(pesos(80000)).toBe('$80.000');
    expect(pesos(-10000)).toBe('-$10.000');
    expect(fechaCl('2026-10-25')).toBe('25-10-2026');
    expect(formatoRut('12647419-9')).toBe('12.647.419-9');
    expect(formatoRut('7654321-k')).toBe('7.654.321-K');
    expect(formatoRut('123-4')).toBe('123-4');
    expect(formatoRut('sin formato')).toBe('sin formato');
  });
});

describe('documento del presupuesto', () => {
  it('trae lo que ve el cliente: taller, numero, trabajos, totales, anticipo y plazo', () => {
    const t = textoDe(base);
    for (const esperado of ['Taller Sur', 'N° 12', '10-10-2026', '25-10-2026', 'María Pérez', 'ABCD12', 'Toyota Yaris 2019']) {
      expect(t).toContain(esperado);
    }
    for (const esperado of ['Puerta delantera izquierda', 'Desabollado y pintura', 'Cambio de pieza y pintura', 'Pulido de focos']) {
      expect(t).toContain(esperado);
    }
    for (const esperado of ['$360.000', '-$10.000', '6 días hábiles', 'Incluye pulido general', 'Garantía de 6 meses.']) {
      expect(t).toContain(esperado);
    }
  });

  it('el anticipo se llama "Anticipo" (ya no "Para iniciar el trabajo") y solo sale si se solicita', () => {
    expect(textoDe(base)).toContain('ANTICIPO');
    expect(textoDe(base)).toContain('$125.000');
    expect(textoDe(base)).not.toContain('Para iniciar el trabajo');
    expect(textoDe({ ...base, montoInicio: 0 })).not.toContain('ANTICIPO');
  });

  it('la direccion y el telefono van bajo el nombre del taller, con iconos', () => {
    const t = textoDe(base);
    expect(t).toContain('Av. Pajaritos 1234, Maipú');
    expect(t).toContain('+56 9 1111 2222');
    const sinPlano = { ...base, lineas: [base.lineas[2]] };
    // Ubicacion y telefono, mas la insignia de la marca del auto.
    expect((textoDe(sinPlano).match(/"svg"/g) ?? []).length).toBe(3);
    // Solo la direccion: un icono.
    expect((textoDe(sinPlano, { ...taller, telefono: null }).match(/"svg"/g) ?? []).length).toBe(2);
    expect((textoDe(sinPlano, { ...taller, direccion: null, telefono: null }).match(/"svg"/g) ?? []).length).toBe(1);
  });

  it('muestra todas las cuentas para transferir, con RUT con puntos, y la nota de pago', () => {
    const t = textoDe(base);
    for (const esperado of [
      'DATOS PARA TRANSFERIR',
      'Banco Falabella',
      'Cuenta corriente',
      'N° 1-980-432549-6',
      'Luis Humberto Vega Pozo',
      'RUT 12.647.419-9',
      'luisvega1912@gmail.com',
      'Mercado Pago',
      'Cuenta vista',
      'N° 1003355333',
      'Envía el comprobante por WhatsApp',
    ]) {
      expect(t).toContain(esperado);
    }
    expect(textoDe(base, { ...taller, cuentas: [falabella] })).not.toContain('Mercado Pago');
    // Sin cuentas ni nota no hay recuadro; solo con la nota, si.
    expect(textoDe(base, { ...taller, cuentas: [], notaPago: null })).not.toContain('DATOS PARA TRANSFERIR');
    expect(textoDe(base, { ...taller, cuentas: [], notaPago: 'Solo efectivo' })).toContain('Solo efectivo');
  });

  it('"Qué incluye el trabajo" muestra solo lo que el presupuesto lleva', () => {
    const t = textoDe(base);
    expect(t).toContain('QUÉ INCLUYE EL TRABAJO');
    expect(t).toContain('Lijado y preparación de la superficie.');
    expect(t).toContain('Enderezado de la chapa.');
    // Solo pintura (sin desabollado): no sale el bloque de desabolladura.
    const soloPintura = textoDe({ ...base, lineas: [{ ...base.lineas[1] }] });
    expect(soloPintura).toContain('Aplicación de barniz.');
    expect(soloPintura).not.toContain('Enderezado de la chapa.');
    // Solo un servicio libre: no hay detalle de trabajo.
    expect(textoDe({ ...base, lineas: [base.lineas[2]] })).not.toContain('QUÉ INCLUYE EL TRABAJO');
    // Reparar con desabollado en $0 no cuenta como desabolladura.
    expect(textoDe({ ...base, lineas: [{ ...base.lineas[0], desabollado: 0 }] })).not.toContain('Enderezado de la chapa.');
  });

  it('un servicio muestra su descripcion bajo el nombre', () => {
    expect(textoDe(base)).toContain('Pulido de los focos para recuperar su transparencia.');
    expect(textoDe({ ...base, lineas: [{ ...base.lineas[2], descripcion: null }] })).not.toContain('recuperar su transparencia');
  });

  it('omite lo que no aplica: descuento, anticipo, plazo, observaciones, condiciones, cuentas y direccion', () => {
    const t = textoDe(
      { ...base, descuento: 0, montoInicio: 0, plazoDias: null, observaciones: null, condiciones: '' },
      { ...taller, cuentas: [], notaPago: null, direccion: null, telefono: null },
    );
    for (const ausente of ['Descuento', 'ANTICIPO', 'PLAZO ESTIMADO', 'OBSERVACIONES', 'CONDICIONES', 'DATOS PARA TRANSFERIR']) {
      expect(t).not.toContain(ausente);
    }
  });

  it('con logo lo dibuja en vez del nombre en texto grande', () => {
    const logo = '<svg viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg>';
    expect(textoDe(base, { ...taller, logoSvg: logo })).toContain(logo.replace(/"/g, '\\"'));
    expect(textoDe(base, { ...taller, logoSvg: logo })).not.toContain('"text":"TALLER SUR","fontSize":17');
    expect(textoDe(base)).toContain('"text":"TALLER SUR","fontSize":17');
  });

  it('dibuja el auto con las piezas del presupuesto: franjas al reparar, lleno al cambiar', () => {
    expect([...marcasDelPlano(base)]).toEqual([
      ['capot', 'reparar'],
      ['puerta_delantera|izquierda', 'reemplazar'],
    ]);
    const t = textoDe(base);
    expect(t).toContain('PIEZAS A TRABAJAR');
    expect(t).toContain('LATERAL IZQUIERDO');
    expect(t).toContain('Reparar y pintar');
    // La leyenda nombra las piezas de cada tipo.
    expect(t).toContain('capot');
    expect(t).toContain('puerta delantera izquierda');
    expect(t).toContain('Cambiar pieza y pintar');
    // Solo servicios (sin zona): no hay dibujo.
    expect(textoDe({ ...base, lineas: [base.lineas[2]] })).not.toContain('PIEZAS A TRABAJAR');
    // Solo reparaciones: la leyenda no muestra "cambiar".
    expect(textoDe({ ...base, lineas: [base.lineas[0]] })).not.toContain('Cambiar pieza y pintar');
  });

  it('cliente y vehiculo van en tarjetas, con la insignia de la marca en la del vehiculo', () => {
    const t = textoDe(base);
    expect(t).toContain(logoDeMarca('Toyota')!.slice(0, 40));
    // Marca sin logo: sus iniciales; sin marca: el icono de auto.
    expect(textoDe({ ...base, vehiculo: { ...base.vehiculo, marca: 'Great Wall' } })).toContain('"text":"GW"');
    expect(textoDe({ ...base, vehiculo: { ...base.vehiculo, marca: null } })).toContain('M4 15v-3l2-5h12l2 5v3');
  });

  it('orden: cliente, piezas a trabajar, detalle con precios y que incluye', () => {
    const t = textoDe(base);
    const pos = ['CLIENTE', 'PIEZAS A TRABAJAR', 'DETALLE DEL TRABAJO', 'QUÉ INCLUYE EL TRABAJO'].map((x) => t.indexOf(x));
    expect(pos.every((x) => x >= 0)).toBe(true);
    expect([...pos].sort((x, y) => x - y)).toEqual(pos);
  });

  it('un dia de plazo va en singular', () => {
    expect(textoDe({ ...base, plazoDias: 1 })).toContain('1 día hábil');
  });

  it('nunca incluye la vista interna (costos ni ganancia)', () => {
    const t = textoDe(base).toLowerCase();
    for (const prohibido of ['costo', 'ganancia', 'margen']) expect(t).not.toContain(prohibido);
  });
});
