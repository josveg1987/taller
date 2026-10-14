import type { Column, Content, TDocumentDefinitions } from 'pdfmake/interfaces';

export interface CuentaParaPdf {
  titular: string;
  /** Normalizado: 12345678-5. */
  rut: string;
  banco: string;
  tipoCuenta: 'corriente' | 'vista' | 'ahorro';
  numero: string;
  email: string | null;
}

/** Lo que el PDF necesita del taller. */
export interface TallerParaPdf {
  nombre: string;
  /** Una linea (calle y comuna). Sale destacada con un icono. */
  direccion: string | null;
  telefono: string | null;
  /** Nota opcional bajo las cuentas (p. ej. "envía el comprobante por WhatsApp"). */
  notaPago: string | null;
  /** Logo SVG para fondo claro (ya validado al guardarlo). Si falta, se escribe el nombre. */
  logoSvg: string | null;
  /** Cuentas activas, en el orden del taller. */
  cuentas: CuentaParaPdf[];
  /** Pasos de "Que incluye el trabajo" (el texto del taller o el estandar). */
  detallePintura: string[];
  detalleDesabollado: string[];
}

/** Subconjunto del presupuesto que se imprime. Nunca incluye la vista interna (costos y ganancia). */
export interface PresupuestoParaPdf {
  numero: number;
  fecha: string;
  validoHasta: string;
  cliente: { nombre: string; telefono: string };
  vehiculo: { patente: string; marca: string | null; modelo: string | null; anio: number | null };
  lineas: {
    nombre: string;
    posicion: string;
    operacion: 'reparar' | 'reemplazar' | 'libre';
    pintura: number;
    desabollado: number;
    precioTotal: number;
    /** Texto bajo el nombre (servicios e items libres). */
    descripcion: string | null;
  }[];
  subtotal: number;
  descuento: number;
  total: number;
  /** Anticipo: 0 si no se solicita. */
  montoInicio: number;
  plazoDias: number | null;
  observaciones: string | null;
  condiciones: string;
}

const COLOR_TEXTO = '#111827';
const COLOR_SUAVE = '#4b5563';
const COLOR_LINEA = '#d1d5db';
const COLOR_FONDO = '#f3f4f6';
const COLOR_DESTACADO = '#eef2f7';
const COLOR_BORDE_DESTACADO = '#11223d';

// Iconos simples (viewBox 24) para los recuadros destacados: pdfmake los dibuja como vectores.
const ICONO_UBICACION = `<svg viewBox="0 0 24 24"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" fill="none" stroke="${COLOR_BORDE_DESTACADO}" stroke-width="2.2" stroke-linejoin="round"/><circle cx="12" cy="10" r="2.6" fill="none" stroke="${COLOR_BORDE_DESTACADO}" stroke-width="2.2"/></svg>`;
const ICONO_TELEFONO = `<svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" fill="none" stroke="${COLOR_BORDE_DESTACADO}" stroke-width="2.2" stroke-linejoin="round"/></svg>`;

/** 80000 -> "$80.000"; -10000 -> "-$10.000". */
export const pesos = (n: number): string =>
  (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });

/** "2026-10-25" -> "25-10-2026". */
export const fechaCl = (iso: string): string => iso.split('-').reverse().join('-');

/** "12647419-9" -> "12.647.419-9" (si no tiene la forma esperada, se deja tal cual). */
export function formatoRut(rut: string): string {
  const m = rut.trim().match(/^(\d{1,9})-([\dkK])$/);
  if (!m) return rut;
  return `${m[1].replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${m[2].toUpperCase()}`;
}

const TIPO_CUENTA = { corriente: 'Cuenta corriente', vista: 'Cuenta vista', ahorro: 'Cuenta de ahorro' } as const;

const lado = (posicion: string) => (posicion === 'izquierda' ? ' izquierda' : posicion === 'derecha' ? ' derecha' : '');

function queSeHace(l: PresupuestoParaPdf['lineas'][number]): string | null {
  if (l.operacion === 'reemplazar') return 'Cambio de pieza y pintura';
  if (l.operacion === 'reparar') return l.desabollado > 0 ? 'Desabollado y pintura' : 'Pintura';
  return l.descripcion; // servicios e items libres: su propia descripcion (puede no tener)
}

/** Recuadro destacado: fondo suave y una franja oscura a la izquierda. */
function destacado(contenido: Content, margin: [number, number, number, number]): Content {
  return {
    margin,
    unbreakable: true,
    table: { widths: ['*'], body: [[{ stack: [contenido], margin: [4, 2, 4, 2] }]] },
    layout: {
      fillColor: () => COLOR_DESTACADO,
      hLineWidth: () => 0,
      vLineWidth: (i: number) => (i === 0 ? 4 : 0),
      vLineColor: () => COLOR_BORDE_DESTACADO,
      paddingLeft: () => 10,
      paddingRight: () => 10,
      paddingTop: () => 8,
      paddingBottom: () => 8,
    },
  };
}

/** Direccion (una linea, con icono) y telefono del taller, en un recuadro destacado. */
function bloqueDireccion(t: TallerParaPdf): Content | null {
  if (!t.direccion && !t.telefono) return null;
  const columnas: Column[] = [];
  if (t.direccion) {
    columnas.push({ svg: ICONO_UBICACION, width: 13, margin: [0, 1, 6, 0] }, { text: t.direccion, bold: true, fontSize: 11, width: '*' });
  } else {
    columnas.push({ text: '', width: '*' });
  }
  if (t.telefono) {
    columnas.push({ svg: ICONO_TELEFONO, width: 12, margin: [8, 2, 4, 0] }, { text: t.telefono, bold: true, fontSize: 11, width: 'auto' });
  }
  return destacado({ columns: columnas, columnGap: 0 }, [0, 0, 0, 14]);
}

function bloqueCuenta(c: CuentaParaPdf): Column {
  return {
    width: '*',
    stack: [
      { text: [{ text: c.banco, bold: true }, { text: `  ·  ${TIPO_CUENTA[c.tipoCuenta]}`, color: COLOR_SUAVE }], fontSize: 10.5 },
      { text: `N° ${c.numero}`, bold: true, fontSize: 13, margin: [0, 2, 0, 2] },
      { text: c.titular, fontSize: 9.5 },
      { text: `RUT ${formatoRut(c.rut)}`, fontSize: 9.5 },
      ...(c.email ? [{ text: c.email, fontSize: 9.5, color: COLOR_SUAVE }] : []),
    ],
  };
}

/** "Datos para transferir": todas las cuentas activas, de a dos por fila, en un recuadro destacado. */
function bloqueCuentas(t: TallerParaPdf): Content | null {
  if (t.cuentas.length === 0 && !t.notaPago?.trim()) return null;
  const filas: Content[] = [];
  for (let i = 0; i < t.cuentas.length; i += 2) {
    const par = t.cuentas.slice(i, i + 2);
    filas.push({ columns: [...par.map(bloqueCuenta), ...(par.length === 1 ? [{ text: '', width: '*' }] : [])], columnGap: 16, margin: [0, i === 0 ? 0 : 8, 0, 0] });
  }
  return destacado(
    {
      stack: [
        { text: 'DATOS PARA TRANSFERIR', fontSize: 8.5, bold: true, color: COLOR_SUAVE, characterSpacing: 1, margin: [0, 0, 0, 6] },
        ...filas,
        ...(t.notaPago?.trim() ? [{ text: t.notaPago.trim(), fontSize: 9, color: COLOR_SUAVE, margin: [0, 8, 0, 0] as [number, number, number, number] }] : []),
      ],
    },
    [0, 16, 0, 0],
  );
}

/** "Que incluye el trabajo": solo lo que ese presupuesto lleva (pintura y/o desabolladura). */
function bloqueDetalle(t: TallerParaPdf, p: PresupuestoParaPdf): Content | null {
  const conPintura = p.lineas.some((l) => l.operacion !== 'libre' && l.pintura > 0);
  const conDesabollado = p.lineas.some((l) => l.operacion === 'reparar' && l.desabollado > 0);
  const columnas: Column[] = [];
  const agregar = (titulo: string, pasos: string[]) => {
    if (pasos.length) columnas.push({ width: '*', stack: [{ text: titulo, bold: true, fontSize: 10, margin: [0, 0, 0, 3] }, { ul: pasos, fontSize: 9, color: COLOR_SUAVE, lineHeight: 1.25 }] });
  };
  if (conDesabollado) agregar('Desabolladura', t.detalleDesabollado);
  if (conPintura) agregar('Pintura', t.detallePintura);
  if (columnas.length === 0) return null;
  return {
    unbreakable: true,
    stack: [{ text: 'Qué incluye el trabajo', bold: true, fontSize: 12, margin: [0, 16, 0, 6] }, { columns: columnas, columnGap: 20 }],
  };
}

/** Arma el documento (A4) con los datos ya calculados por el servidor. */
export function construirDocumento(taller: TallerParaPdf, p: PresupuestoParaPdf): TDocumentDefinitions {
  const vehiculo = [p.vehiculo.marca, p.vehiculo.modelo, p.vehiculo.anio].filter(Boolean).join(' ');

  const filas = p.lineas.map((l) => {
    const detalle = queSeHace(l);
    return [
      {
        stack: [{ text: l.nombre + (l.operacion === 'libre' ? '' : lado(l.posicion)), bold: true }, ...(detalle ? [{ text: detalle, color: COLOR_SUAVE, fontSize: 9 }] : [])],
      },
      { text: pesos(l.precioTotal), alignment: 'right' as const },
    ];
  });

  const totales: Content[] = [
    {
      columns: [{ text: 'Subtotal', color: COLOR_SUAVE }, { text: pesos(p.subtotal), alignment: 'right' }],
      margin: [0, 2, 0, 2],
    },
  ];
  if (p.descuento > 0) {
    totales.push({ columns: [{ text: 'Descuento', color: COLOR_SUAVE }, { text: pesos(-p.descuento), alignment: 'right' }], margin: [0, 2, 0, 2] });
  }
  totales.push({
    columns: [{ text: 'TOTAL', bold: true, fontSize: 13 }, { text: pesos(p.total), bold: true, fontSize: 13, alignment: 'right' }],
    margin: [0, 6, 0, 0],
  });

  const datos: Content[] = [];
  if (p.montoInicio > 0) {
    datos.push({ text: [{ text: 'Anticipo: ', bold: true }, pesos(p.montoInicio)], margin: [0, 0, 0, 4] });
  }
  if (p.plazoDias) {
    datos.push({
      text: [{ text: 'Plazo estimado: ', bold: true }, `${p.plazoDias} ${p.plazoDias === 1 ? 'día hábil' : 'días hábiles'}`],
      margin: [0, 0, 0, 4],
    });
  }

  const bloques: Content[] = [];
  const bloque = (titulo: string, texto: string) =>
    bloques.push({ text: titulo, bold: true, margin: [0, 14, 0, 3] }, { text: texto, color: COLOR_SUAVE, fontSize: 9.5, lineHeight: 1.3 });
  if (p.observaciones?.trim()) bloque('Observaciones', p.observaciones.trim());
  if (p.condiciones.trim()) bloque('Condiciones', p.condiciones.trim());

  const direccion = bloqueDireccion(taller);
  const detalle = bloqueDetalle(taller, p);
  const cuentas = bloqueCuentas(taller);

  return {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 56],
    info: { title: `Presupuesto N° ${p.numero} - ${taller.nombre}`, author: taller.nombre },
    defaultStyle: { font: 'Roboto', fontSize: 10.5, color: COLOR_TEXTO },
    content: [
      {
        columns: [
          {
            width: '*',
            stack: [taller.logoSvg ? { svg: taller.logoSvg, width: 170 } : { text: taller.nombre, fontSize: 20, bold: true }],
          },
          {
            width: 'auto',
            alignment: 'right',
            stack: [
              { text: 'PRESUPUESTO', fontSize: 9, color: COLOR_SUAVE, characterSpacing: 1.5 },
              { text: `N° ${p.numero}`, fontSize: 20, bold: true },
              { text: `Fecha: ${fechaCl(p.fecha)}`, color: COLOR_SUAVE, fontSize: 9.5, margin: [0, 3, 0, 0] },
              { text: `Válido hasta: ${fechaCl(p.validoHasta)}`, color: COLOR_SUAVE, fontSize: 9.5 },
            ],
          },
        ],
      },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: COLOR_LINEA }], margin: [0, 12, 0, 12] },
      ...(direccion ? [direccion] : []),
      {
        columns: [
          {
            stack: [
              { text: 'CLIENTE', fontSize: 8.5, color: COLOR_SUAVE, characterSpacing: 1 },
              { text: p.cliente.nombre, bold: true, margin: [0, 2, 0, 0] },
              { text: p.cliente.telefono, color: COLOR_SUAVE },
            ],
          },
          {
            stack: [
              { text: 'VEHÍCULO', fontSize: 8.5, color: COLOR_SUAVE, characterSpacing: 1 },
              { text: p.vehiculo.patente, bold: true, margin: [0, 2, 0, 0] },
              ...(vehiculo ? [{ text: vehiculo, color: COLOR_SUAVE }] : []),
            ],
          },
        ],
      },
      { text: 'Detalle del trabajo', bold: true, fontSize: 12, margin: [0, 18, 0, 6] },
      {
        table: { widths: ['*', 'auto'], headerRows: 1, dontBreakRows: true, body: [[{ text: 'Trabajo', bold: true, color: COLOR_SUAVE }, { text: 'Precio', bold: true, color: COLOR_SUAVE, alignment: 'right' }], ...filas] },
        layout: {
          fillColor: (fila: number) => (fila === 0 ? COLOR_FONDO : null),
          hLineColor: () => COLOR_LINEA,
          vLineWidth: () => 0,
          hLineWidth: (i: number, nodo: { table: { body: unknown[] } }) => (i === 0 || i === nodo.table.body.length ? 0 : 0.5),
          paddingTop: () => 6,
          paddingBottom: () => 6,
        },
      },
      { margin: [285, 12, 0, 0], unbreakable: true, stack: totales },
      ...(datos.length ? [{ margin: [0, 16, 0, 0] as [number, number, number, number], stack: datos }] : []),
      ...(detalle ? [detalle] : []),
      ...bloques,
      ...(cuentas ? [cuentas] : []),
    ],
    footer: (pagina: number, total: number) => ({
      columns: [
        { text: `Presupuesto N° ${p.numero} · ${taller.nombre}`, color: COLOR_SUAVE, fontSize: 8 },
        { text: `Página ${pagina} de ${total}`, color: COLOR_SUAVE, fontSize: 8, alignment: 'right' },
      ],
      margin: [40, 20, 40, 0],
    }),
  };
}
