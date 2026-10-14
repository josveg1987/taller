import { clavePlano, COLORES_PLANO_PDF, svgPlano, type MarcaPlano, type VistaPlano, type Zona } from '@taller/shared/plano';
import { iniciales, logoDeMarca } from '@taller/shared';
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
    /** Zona del plano del auto (null si la pieza no esta en el dibujo). */
    zona: Zona | null;
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

/** Circulo con el logo de la marca del auto (como en la app): logo, o iniciales si no lo tenemos, o un auto si no hay marca. */
function insigniaAuto(marca: string | null): Column {
  const circulo = `<circle cx="20" cy="20" r="19.25" fill="#ffffff" stroke="${COLOR_LINEA}" stroke-width="1.5"/>`;
  const trazo = logoDeMarca(marca);
  if (trazo) {
    return { width: 36, svg: `<svg viewBox="0 0 40 40">${circulo}<path transform="translate(9 9) scale(0.9167)" fill="${COLOR_BORDE_DESTACADO}" d="${trazo}"/></svg>` };
  }
  if (!marca?.trim()) {
    return { width: 36, svg: `<svg viewBox="0 0 40 40">${circulo}<path transform="translate(10 10) scale(0.8333)" fill="none" stroke="${COLOR_BORDE_DESTACADO}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 15v-3l2-5h12l2 5v3M4 15h16M4 15v3h3v-3M17 15v3h3v-3"/></svg>` };
  }
  return {
    width: 36,
    stack: [
      { svg: `<svg viewBox="0 0 40 40">${circulo}</svg>`, width: 36 },
      { text: iniciales(marca), bold: true, fontSize: 12, color: COLOR_BORDE_DESTACADO, alignment: 'center', margin: [0, -26, 0, 0] },
    ],
  };
}

/** Cliente y vehiculo en un recuadro de esquinas redondeadas, con la insignia de la marca del auto. */
function bloqueClienteVehiculo(p: PresupuestoParaPdf): Content {
  const vehiculo = [p.vehiculo.marca, p.vehiculo.modelo, p.vehiculo.anio].filter(Boolean).join(' ');
  // pdfmake no redondea tablas: se dibuja el fondo redondeado (fuera del flujo) y el contenido encima.
  // El alto se estima por las lineas que ocuparan el nombre y el vehiculo.
  const lineasNombre = Math.max(1, Math.ceil(p.cliente.nombre.length / 34));
  const lineasVehiculo = Math.max(1, Math.ceil(vehiculo.length / 28));
  const alto = Math.max(26 + 13.5 * lineasNombre, 26 + 12.5 * lineasVehiculo, 38) + 24;
  const etiqueta = (t: string) => ({ text: t, fontSize: 8.5, color: COLOR_SUAVE, characterSpacing: 1 });
  return {
    unbreakable: true,
    margin: [0, 0, 0, 2],
    stack: [
      { canvas: [{ type: 'rect', x: 0, y: 0, w: 515, h: alto, r: 12, color: COLOR_FONDO, lineColor: COLOR_LINEA, lineWidth: 0.8 }], relativePosition: { x: 0, y: 0 } },
      {
        margin: [16, 12, 16, 12],
        columnGap: 16,
        columns: [
          {
            width: '*',
            stack: [etiqueta('CLIENTE'), { text: p.cliente.nombre, bold: true, fontSize: 11, margin: [0, 2, 0, 0] }, { text: p.cliente.telefono, color: COLOR_SUAVE }],
          },
          {
            width: '*',
            columnGap: 10,
            columns: [
              insigniaAuto(p.vehiculo.marca),
              {
                width: '*',
                stack: [etiqueta('VEHÍCULO'), { text: p.vehiculo.patente, bold: true, fontSize: 11, margin: [0, 2, 0, 0] }, ...(vehiculo ? [{ text: vehiculo, color: COLOR_SUAVE }] : [])],
              },
            ],
          },
        ],
      },
    ],
  };
}

/** Direccion y telefono bajo el nombre (o logo) del taller, cada uno con su icono. */
function contactoTaller(t: TallerParaPdf): Content[] {
  const fila = (icono: string, texto: string): Content => ({
    columns: [
      { svg: icono, width: 9, margin: [0, 1, 0, 0] },
      { text: texto, fontSize: 9.5, color: COLOR_SUAVE, width: '*' },
    ],
    columnGap: 5,
    margin: [0, 3, 0, 0],
  });
  return [...(t.direccion ? [fila(ICONO_UBICACION, t.direccion)] : []), ...(t.telefono ? [fila(ICONO_TELEFONO, t.telefono)] : [])];
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

/** Piezas del presupuesto marcadas en el plano: clave del plano → reparar o cambiar (cambiar gana si hay ambas). */
export function marcasDelPlano(p: PresupuestoParaPdf): Map<string, MarcaPlano> {
  const marcas = new Map<string, MarcaPlano>();
  for (const l of p.lineas) {
    if (!l.zona || l.operacion === 'libre') continue;
    const lado = l.posicion === 'izquierda' || l.posicion === 'derecha' ? l.posicion : null;
    const clave = clavePlano(l.zona, lado);
    if (marcas.get(clave) !== 'reemplazar') marcas.set(clave, l.operacion);
  }
  return marcas;
}

/** El auto dibujado con las piezas del presupuesto coloreadas (solo si alguna pieza esta en el dibujo). */
function bloquePlano(p: PresupuestoParaPdf): Content | null {
  const marcas = marcasDelPlano(p);
  if (marcas.size === 0) return null;
  const vista = (v: VistaPlano, titulo: string, ancho: number): Column => ({
    width: ancho,
    stack: [
      { text: titulo, fontSize: 7.5, color: COLOR_SUAVE, characterSpacing: 0.8, margin: [0, 0, 0, 2] },
      { svg: svgPlano(marcas, v), width: ancho },
    ],
  });
  const muestra = (m: MarcaPlano) => ({
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" width="12" height="12"><rect x="0.5" y="0.5" width="11" height="11" rx="2" fill="${m === 'reparar' ? COLORES_PLANO_PDF.reparar : COLORES_PLANO_PDF.reemplazar}" stroke="${COLORES_PLANO_PDF.linea}"/>${m === 'reparar' ? `<path d="M0 6L6 0M3 12L12 3" stroke="#fff" stroke-width="1.6" stroke-opacity="0.6"/>` : ''}</svg>`,
    width: 10,
  });
  const usadas = new Set(marcas.values());
  const leyenda: Column[] = [];
  if (usadas.has('reparar')) leyenda.push({ width: 'auto', columns: [muestra('reparar'), { text: 'Reparar y pintar', fontSize: 8.5, margin: [4, 0, 0, 0] }] });
  if (usadas.has('reemplazar')) leyenda.push({ width: 'auto', columns: [muestra('reemplazar'), { text: 'Cambiar pieza y pintar', fontSize: 8.5, margin: [4, 0, 0, 0] }] });
  return {
    unbreakable: true,
    stack: [
      { text: 'Piezas a trabajar', bold: true, fontSize: 12, margin: [0, 16, 0, 6] },
      { columns: [vista('izquierda', 'LATERAL IZQUIERDO', 250), vista('derecha', 'LATERAL DERECHO', 250)], columnGap: 15 },
      { columns: [vista('superior', 'VISTA SUPERIOR', 220), vista('frente', 'FRENTE', 130), vista('atras', 'ATRÁS', 130)], columnGap: 17, margin: [0, 8, 0, 0] },
      { columns: leyenda, columnGap: 18, margin: [0, 6, 0, 0] },
    ],
  };
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

  const detalle = bloqueDetalle(taller, p);
  const plano = bloquePlano(p);
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
            stack: [taller.logoSvg ? { svg: taller.logoSvg, width: 170 } : { text: taller.nombre, fontSize: 20, bold: true }, ...contactoTaller(taller)],
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
      bloqueClienteVehiculo(p),
      // Orden acordado: cliente y vehiculo, piezas a trabajar (el auto), detalle con precios, que incluye.
      ...(plano ? [plano] : []),
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
      ...(datos.length ? [{ margin: [0, 16, 0, 0] as [number, number, number, number], unbreakable: true, stack: datos }] : []),
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
