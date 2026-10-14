import { iniciales, logoDeMarca } from '@taller/shared';
import { clavePlano, COLORES_PLANO_PDF, svgPlano, ZONAS, type MarcaPlano, type VistaPlano, type Zona } from '@taller/shared/plano';
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
  /** Una linea (calle y comuna). Va en el encabezado, con un icono. */
  direccion: string | null;
  telefono: string | null;
  /** Nota opcional bajo las cuentas (p. ej. "envía el comprobante por WhatsApp"). */
  notaPago: string | null;
  /** Logo SVG para fondo CLARO (el encabezado es gris claro; ya validado al guardarlo). Si falta, se escribe el nombre. */
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

// Colores de la marca (los mismos de la app: apps/web/src/styles.css). Cuando cada taller tenga su paleta,
// llegaran aqui como parametro.
const MARCA = '#11223d';
const ACENTO = '#c2410c';
// Encabezados de pagina y caja del TOTAL: tono crema (pedido del dueño), con texto oscuro encima.
const FONDO_ENCABEZADO = '#fff7ed';
const SOBRE_GRIS = '#374151';
const TINTA = '#1f2937';
const SUAVE = '#6b7280';
const LINEA = '#e5e7eb';
const FONDO = '#f6f7f9';
const PELIGRO = '#b91c1c';

// Medidas (puntos). A4 = 595,28 x 841,89.
const ANCHO_PAGINA = 595.28;
const LADO = 34;
const ANCHO = ANCHO_PAGINA - 2 * LADO;
const BANDA = 104; // encabezado de la primera pagina
const BANDA_DELGADA = 42; // encabezado de las demas
const FRANJA = 5; // linea naranja bajo el encabezado
const ARRIBA = BANDA_DELGADA + FRANJA + 18; // margen superior de todas las paginas

const icono = (trazo: string, color: string) =>
  `<svg viewBox="0 0 24 24"><path d="${trazo}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
const TRAZO_UBICACION = 'M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12zM12 7.4a2.6 2.6 0 1 0 0 5.2a2.6 2.6 0 0 0 0-5.2z';
const TRAZO_TELEFONO = 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z';
const CHECK = `<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" fill="${ACENTO}"/><path d="M4.5 8.3l2.3 2.3 4.7-5" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

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

/** Columna "Trabajo" de la tabla. */
function queSeHace(l: PresupuestoParaPdf['lineas'][number]): string {
  if (l.operacion === 'reemplazar') return 'Cambio de pieza y pintura';
  if (l.operacion === 'reparar') return l.desabollado > 0 ? 'Desabollado y pintura' : 'Pintura';
  return 'Servicio';
}

const MARCAS_TEXTO: Record<MarcaPlano, string> = { reparar: 'Reparar y pintar', reemplazar: 'Cambiar pieza y pintar' };

/** Etiqueta redondeada (pastilla) de color, con el texto en blanco. El ancho se estima por el largo del texto. */
function pastilla(texto: string, color: string): Column {
  const ancho = texto.length * 4.6 + 16;
  return {
    width: ancho,
    stack: [
      { canvas: [{ type: 'rect', x: 0, y: 0, w: ancho, h: 15, r: 7.5, color }], relativePosition: { x: 0, y: 0 } },
      { text: texto, color: '#ffffff', bold: true, fontSize: 8, alignment: 'center', margin: [0, 3, 0, 0] },
    ],
  };
}

/** Titulo de seccion: mayusculas en azul con linea azul debajo; a la derecha, pastillas opcionales. */
function titulo(texto: string, pastillas: Column[] = [], arriba = 18): Content {
  return {
    margin: [0, arriba, 0, 8],
    stack: [
      {
        columns: [{ text: texto.toUpperCase(), bold: true, fontSize: 9.5, color: MARCA, characterSpacing: 1.6, width: '*', margin: [0, 2, 0, 0] }, ...pastillas],
        columnGap: 6,
      },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: ANCHO, y2: 0, lineWidth: 2, lineColor: MARCA }], margin: [0, 5, 0, 0] },
    ],
  };
}

/** Fondo redondeado (fuera del flujo) bajo un contenido de alto conocido. */
const fondoRedondeado = (w: number, h: number, r: number, opciones: { color?: string; lineColor?: string; lineWidth?: number; dash?: { length: number; space: number } }): Content => ({
  canvas: [{ type: 'rect', x: 0, y: 0, w, h, r, ...opciones }],
  relativePosition: { x: 0, y: 0 },
});

// --- Encabezado ----------------------------------------------------------------------------------------

/** Direccion y telefono del taller, con iconos, sobre el fondo azul. */
function contactoTaller(t: TallerParaPdf): Content[] {
  const fila = (trazo: string, texto: string): Content => ({
    columns: [
      { svg: icono(trazo, SOBRE_GRIS), width: 9, margin: [0, 1, 0, 0] },
      { text: texto, fontSize: 9.5, color: SOBRE_GRIS, width: '*' },
    ],
    columnGap: 5,
    margin: [0, 3, 0, 0],
  });
  return [...(t.direccion ? [fila(TRAZO_UBICACION, t.direccion)] : []), ...(t.telefono ? [fila(TRAZO_TELEFONO, t.telefono)] : [])];
}

/** Encabezado de la primera pagina: se dibuja en el fondo de la pagina, sobre la banda crema (alto fijo). */
function encabezado(t: TallerParaPdf, p: PresupuestoParaPdf): Content {
  return {
    margin: [LADO, 20, LADO, 0],
    columns: [
      {
        width: '*',
        stack: [
          t.logoSvg
            ? { svg: t.logoSvg, fit: [210, 44] }
            : { text: t.nombre.toUpperCase(), fontSize: 17, bold: true, color: MARCA, characterSpacing: 0.5 },
          ...contactoTaller(t),
        ],
      },
      {
        width: 'auto',
        alignment: 'right',
        stack: [
          { text: 'PRESUPUESTO', fontSize: 8.5, color: SOBRE_GRIS, characterSpacing: 3 },
          { text: `N° ${p.numero}`, fontSize: 24, bold: true, color: ACENTO, margin: [0, 1, 0, 1] },
          { text: `Fecha: ${fechaCl(p.fecha)} · Válido hasta: ${fechaCl(p.validoHasta)}`, fontSize: 8.5, color: SOBRE_GRIS },
        ],
      },
    ],
  };
}

// --- Cliente y vehiculo ----------------------------------------------------------------------------------

/** Circulo con el logo de la marca del auto (como en la app): logo, o iniciales si no lo tenemos, o un auto si no hay marca. */
function insigniaAuto(marca: string | null): Column {
  const circulo = `<circle cx="20" cy="20" r="19.25" fill="#ffffff" stroke="${LINEA}" stroke-width="1.5"/>`;
  const trazo = logoDeMarca(marca);
  if (trazo) {
    return { width: 30, svg: `<svg viewBox="0 0 40 40">${circulo}<path transform="translate(9 9) scale(0.9167)" fill="${MARCA}" d="${trazo}"/></svg>` };
  }
  if (!marca?.trim()) {
    return {
      width: 30,
      svg: `<svg viewBox="0 0 40 40">${circulo}<path transform="translate(10 10) scale(0.8333)" fill="none" stroke="${MARCA}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 15v-3l2-5h12l2 5v3M4 15h16M4 15v3h3v-3M17 15v3h3v-3"/></svg>`,
    };
  }
  return {
    width: 30,
    stack: [
      { svg: `<svg viewBox="0 0 40 40">${circulo}</svg>`, width: 30 },
      { text: iniciales(marca), bold: true, fontSize: 10, color: MARCA, alignment: 'center', margin: [0, -21, 0, 0] },
    ],
  };
}

/** Tarjeta con fondo suave y borde naranja a la izquierda. */
function tarjeta(contenido: Content): Content {
  return {
    table: { widths: ['*'], body: [[contenido]] },
    layout: {
      fillColor: () => FONDO,
      hLineWidth: () => 0,
      vLineWidth: (i: number) => (i === 0 ? 4 : 0),
      vLineColor: () => ACENTO,
      paddingLeft: () => 12,
      paddingRight: () => 12,
      paddingTop: () => 8,
      paddingBottom: () => 8,
    },
  };
}

const etiqueta = (t: string): Content => ({ text: t, fontSize: 8, bold: true, color: SUAVE, characterSpacing: 1.6, margin: [0, 0, 0, 2] });

function bloqueClienteVehiculo(p: PresupuestoParaPdf): Content {
  const modelo = [p.vehiculo.marca, p.vehiculo.modelo, p.vehiculo.anio].filter(Boolean).join(' ');
  return {
    // El flujo parte a la altura de la banda delgada: en la primera pagina se baja hasta despues de la banda alta.
    margin: [0, BANDA + FRANJA - ARRIBA + 18, 0, 0],
    columnGap: 14,
    columns: [
      tarjeta({ stack: [etiqueta('CLIENTE'), { text: p.cliente.nombre, bold: true }, { text: p.cliente.telefono, color: SUAVE }] }),
      tarjeta({
        columns: [
          {
            width: '*',
            stack: [
              etiqueta('VEHÍCULO'),
              { text: modelo || `Patente ${p.vehiculo.patente}`, bold: true },
              ...(modelo ? [{ text: `Patente ${p.vehiculo.patente}`, color: SUAVE }] : []),
            ],
          },
          insigniaAuto(p.vehiculo.marca),
        ],
        columnGap: 8,
      }),
    ],
  };
}

// --- Piezas a trabajar (plano del auto) -------------------------------------------------------------------

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

/** Nombres de las piezas marcadas, por tipo, para la leyenda ("capot, puerta delantera izquierda…"). */
function nombresMarcados(marcas: Map<string, MarcaPlano>, tipo: MarcaPlano): string[] {
  const nombres: string[] = [];
  for (const [clave, m] of marcas) {
    if (m !== tipo) continue;
    const [zona, l] = clave.split('|') as [Zona, string | undefined];
    nombres.push((ZONAS[zona].nombre + (l ? ` ${l}` : '')).toLowerCase());
  }
  return nombres;
}

/** El auto con las piezas del presupuesto coloreadas, en un recuadro redondeado (solo si alguna pieza esta en el dibujo). */
function bloquePlano(p: PresupuestoParaPdf): Content | null {
  const marcas = marcasDelPlano(p);
  if (marcas.size === 0) return null;
  const pad = 10;
  const interior = ANCHO - 2 * pad;
  const gap = 12;
  const anchoLateral = (interior - gap) / 2;
  const anchoChico = (anchoLateral - gap) / 2;
  // Alto de cada recorte del plano (sus viewBox: laterales 360x128-130, superior 360x174, frente/atras 180x142).
  const altoLateral = (anchoLateral * 130) / 360;
  const altoFila2 = Math.max((anchoLateral * 174) / 360, (anchoChico * 142) / 180);
  const vista = (v: VistaPlano, texto: string, ancho: number): Column => ({
    width: ancho,
    stack: [
      { svg: svgPlano(marcas, v), width: ancho },
      { text: texto, fontSize: 7, color: SUAVE, characterSpacing: 1.4, alignment: 'center', margin: [0, 2, 0, 0] },
    ],
  });
  const usadas = (['reparar', 'reemplazar'] as const).filter((m) => [...marcas.values()].includes(m));
  const muestra = (m: MarcaPlano): Column => ({
    width: 14,
    margin: [0, 1, 0, 0],
    svg: `<svg viewBox="0 0 14 10"><rect x="0.75" y="0.75" width="12.5" height="8.5" rx="2" fill="${m === 'reparar' ? COLORES_PLANO_PDF.reparar : COLORES_PLANO_PDF.reemplazar}" stroke="${COLORES_PLANO_PDF.linea}" stroke-width="1"/>${m === 'reparar' ? '<path d="M2 10L10 0M7 10L14 1" stroke="#ffffff" stroke-width="1.4" stroke-opacity="0.6"/>' : ''}</svg>`,
  });
  const leyenda: Content[] = usadas.map((m) => ({
    columns: [muestra(m), { text: [{ text: `${MARCAS_TEXTO[m]}: `, bold: true }, nombresMarcados(marcas, m).join(', ')], fontSize: 8.5, color: SUAVE, width: '*' }],
    columnGap: 6,
    margin: [0, 3, 0, 0],
  }));
  // Alto del recuadro: dibujos y rotulos (fijos) + leyenda (se estima por el largo del texto).
  const lineasLeyenda = usadas.reduce((s, m) => s + Math.ceil((MARCAS_TEXTO[m].length + nombresMarcados(marcas, m).join(', ').length) / 105), 0);
  const alto = pad + altoLateral + 11 + 8 + altoFila2 + 11 + 8 + 1 + 4 + lineasLeyenda * 12.5 + pad;
  return {
    unbreakable: true,
    stack: [
      titulo('Piezas a trabajar', usadas.map((m) => pastilla(MARCAS_TEXTO[m], m === 'reparar' ? ACENTO : COLORES_PLANO_PDF.reemplazar))),
      fondoRedondeado(ANCHO, alto, 8, { color: FONDO, lineColor: LINEA, lineWidth: 1 }),
      {
        margin: [pad, pad, pad, pad],
        stack: [
          { columns: [vista('izquierda', 'LATERAL IZQUIERDO', anchoLateral), vista('derecha', 'LATERAL DERECHO', anchoLateral)], columnGap: gap },
          {
            columns: [vista('superior', 'VISTA SUPERIOR', anchoLateral), vista('frente', 'FRENTE', anchoChico), vista('atras', 'ATRÁS', anchoChico)],
            columnGap: gap,
            margin: [0, 8, 0, 0],
          },
          { canvas: [{ type: 'line', x1: 0, y1: 0, x2: interior, y2: 0, lineWidth: 1, lineColor: LINEA, dash: { length: 3, space: 3 } }], margin: [0, 8, 0, 2] },
          ...leyenda,
        ],
      },
    ],
  };
}

// --- Detalle, totales, anticipo y plazo ----------------------------------------------------------------------

function tablaDetalle(p: PresupuestoParaPdf): Content {
  const encabezados = ['PIEZA', 'TRABAJO', 'PRECIO'].map((t, i) => ({
    text: t,
    fontSize: 8,
    bold: true,
    color: SUAVE,
    characterSpacing: 1.4,
    alignment: i === 2 ? ('right' as const) : ('left' as const),
  }));
  const filas = p.lineas.map((l) => [
    {
      stack: [
        { text: l.nombre + (l.operacion === 'libre' ? '' : lado(l.posicion)) },
        ...(l.operacion === 'libre' && l.descripcion ? [{ text: l.descripcion, color: SUAVE, fontSize: 8.5, margin: [0, 2, 0, 0] as [number, number, number, number] }] : []),
      ],
    },
    { text: queSeHace(l) },
    { text: pesos(l.precioTotal), alignment: 'right' as const },
  ]);
  return {
    table: { widths: ['*', 140, 70], headerRows: 1, dontBreakRows: true, body: [encabezados, ...filas] },
    layout: {
      fillColor: (fila: number) => (fila > 0 && fila % 2 === 0 ? FONDO : null),
      hLineColor: () => LINEA,
      hLineWidth: (i: number) => (i === 0 ? 0 : 1),
      vLineWidth: () => 0,
      paddingLeft: () => 8,
      paddingRight: () => 8,
      paddingTop: (i: number) => (i === 0 ? 2 : 7),
      paddingBottom: (i: number) => (i === 0 ? 5 : 7),
    },
  };
}

function bloqueTotales(p: PresupuestoParaPdf): Content {
  const ancho = 300;
  const fila = (texto: string, monto: string, color = TINTA): Content => ({
    columns: [{ text: texto, color }, { text: monto, alignment: 'right', color }],
    margin: [8, 3, 8, 3],
  });
  return {
    unbreakable: true,
    margin: [ANCHO - ancho, 10, 0, 0],
    stack: [
      fila('Subtotal', pesos(p.subtotal)),
      ...(p.descuento > 0 ? [fila('Descuento', pesos(-p.descuento), PELIGRO)] : []),
      {
        margin: [0, 6, 0, 0],
        stack: [
          fondoRedondeado(ancho, 34, 6, { color: FONDO_ENCABEZADO }),
          {
            columns: [
              { text: 'TOTAL', bold: true, fontSize: 13, color: MARCA },
              { text: pesos(p.total), bold: true, fontSize: 15, color: ACENTO, alignment: 'right' },
            ],
            margin: [12, 8, 12, 8],
          },
        ],
      },
    ],
  };
}

/** Anticipo y plazo en cajas con borde naranja punteado (solo los que hay). */
function bloquePago(p: PresupuestoParaPdf): Content | null {
  const cajas: [string, string][] = [];
  if (p.montoInicio > 0) cajas.push(['ANTICIPO', pesos(p.montoInicio)]);
  if (p.plazoDias) cajas.push(['PLAZO ESTIMADO', `${p.plazoDias} ${p.plazoDias === 1 ? 'día hábil' : 'días hábiles'}`]);
  if (cajas.length === 0) return null;
  const gap = 14;
  const ancho = (ANCHO - gap) / 2;
  return {
    unbreakable: true,
    margin: [0, 14, 0, 0],
    columnGap: gap,
    columns: cajas.map(([etq, valor]) => ({
      width: ancho,
      stack: [
        fondoRedondeado(ancho, 46, 6, { lineColor: ACENTO, lineWidth: 1, dash: { length: 3, space: 2 } }),
        {
          margin: [12, 8, 12, 8],
          stack: [
            { text: etq, fontSize: 7.5, color: SUAVE, characterSpacing: 1.4 },
            { text: valor, fontSize: 14, bold: true, margin: [0, 2, 0, 0] },
          ],
        },
      ],
    })),
  };
}

// --- Que incluye, notas y cuentas ------------------------------------------------------------------------------

/** Lista con un check naranja, en dos columnas. */
function listaCheck(pasos: string[]): Content {
  const item = (texto: string): Content => ({ columns: [{ svg: CHECK, width: 11, margin: [0, 1, 0, 0] }, { text: texto, width: '*' }], columnGap: 7, margin: [0, 0, 0, 5] });
  const mitad = Math.ceil(pasos.length / 2);
  return { columns: [{ width: '*', stack: pasos.slice(0, mitad).map(item) }, { width: '*', stack: pasos.slice(mitad).map(item) }], columnGap: 20 };
}

/** "Que incluye el trabajo": solo lo que ese presupuesto lleva (desabolladura y/o pintura). */
function bloqueDetalle(t: TallerParaPdf, p: PresupuestoParaPdf): Content | null {
  const conPintura = p.lineas.some((l) => l.operacion !== 'libre' && l.pintura > 0);
  const conDesabollado = p.lineas.some((l) => l.operacion === 'reparar' && l.desabollado > 0);
  const partes: [string, string[]][] = [];
  if (conDesabollado && t.detalleDesabollado.length) partes.push(['Desabolladura', t.detalleDesabollado]);
  if (conPintura && t.detallePintura.length) partes.push(['Pintura', t.detallePintura]);
  if (partes.length === 0) return null;
  return {
    unbreakable: true,
    stack: [
      titulo('Qué incluye el trabajo'),
      ...partes.flatMap(([sub, pasos], i): Content[] => [
        ...(partes.length > 1 ? [{ text: sub, bold: true, color: MARCA, margin: [0, i === 0 ? 0 : 6, 0, 5] as [number, number, number, number] }] : []),
        listaCheck(pasos),
      ]),
    ],
  };
}

function bloqueTexto(tituloTexto: string, texto: string): Content {
  return { unbreakable: true, stack: [titulo(tituloTexto), { text: texto, color: TINTA, fontSize: 10, lineHeight: 1.3 }] };
}

/** "Datos para transferir": el titular arriba si es el mismo en todas; una tarjeta por cuenta, de a dos por fila. */
function bloqueCuentas(t: TallerParaPdf): Content | null {
  if (t.cuentas.length === 0 && !t.notaPago?.trim()) return null;
  const persona = (c: CuentaParaPdf) => `${c.titular}|${c.rut}|${c.email ?? ''}`;
  const mismoTitular = t.cuentas.length > 0 && t.cuentas.every((c) => persona(c) === persona(t.cuentas[0]));
  const datosTitular = (c: CuentaParaPdf) => [c.titular, `RUT ${formatoRut(c.rut)}`, ...(c.email ? [c.email] : [])];

  const gap = 14;
  const ancho = (ANCHO - gap) / 2;
  const altoTarjeta = mismoTitular ? 58 : 58 + 3 * 12;
  const tarjetaCuenta = (c: CuentaParaPdf): Column => ({
    width: ancho,
    stack: [
      fondoRedondeado(ancho, altoTarjeta, 6, { color: FONDO }),
      {
        margin: [14, 10, 14, 10],
        stack: [
          { text: c.banco, bold: true, fontSize: 11, color: MARCA },
          { text: TIPO_CUENTA[c.tipoCuenta], fontSize: 9.5, color: SUAVE },
          { text: `N° ${c.numero}`, bold: true, fontSize: 12, margin: [0, 2, 0, 0] },
          ...(mismoTitular ? [] : datosTitular(c).map((x) => ({ text: x, fontSize: 9, margin: [0, 1, 0, 0] as [number, number, number, number] }))),
        ],
      },
    ],
  });
  const filas: Content[] = [];
  for (let i = 0; i < t.cuentas.length; i += 2) {
    filas.push({ columns: t.cuentas.slice(i, i + 2).map(tarjetaCuenta), columnGap: gap, margin: [0, i === 0 ? 0 : 10, 0, 0] });
  }
  return {
    unbreakable: true,
    stack: [
      titulo('Datos para transferir'),
      ...(mismoTitular
        ? [{ text: [{ text: t.cuentas[0].titular, bold: true }, ...datosTitular(t.cuentas[0]).slice(1).map((x) => `  ·  ${x}`)], margin: [0, 0, 0, 10] as [number, number, number, number] }]
        : []),
      ...filas,
      ...(t.notaPago?.trim() ? [{ text: t.notaPago.trim(), fontSize: 9.5, color: SUAVE, margin: [0, 10, 0, 0] as [number, number, number, number] }] : []),
    ],
  };
}

// --- Documento ------------------------------------------------------------------------------------------------

/** Arma el documento (A4) con los datos ya calculados por el servidor. */
export function construirDocumento(taller: TallerParaPdf, p: PresupuestoParaPdf): TDocumentDefinitions {
  const plano = bloquePlano(p);
  const pago = bloquePago(p);
  const detalle = bloqueDetalle(taller, p);
  const cuentas = bloqueCuentas(taller);

  return {
    pageSize: 'A4',
    pageMargins: [LADO, ARRIBA, LADO, 50],
    info: { title: `Presupuesto N° ${p.numero} - ${taller.nombre}`, author: taller.nombre },
    defaultStyle: { font: 'Roboto', fontSize: 10, color: TINTA, lineHeight: 1.15 },
    // Banda crema con franja naranja: alta (con el encabezado completo) en la primera pagina, delgada en las demas.
    background: (pagina: number) => {
      const alto = pagina === 1 ? BANDA : BANDA_DELGADA;
      const banda: Content = {
        absolutePosition: { x: 0, y: 0 },
        canvas: [
          { type: 'rect', x: 0, y: 0, w: ANCHO_PAGINA, h: alto, color: FONDO_ENCABEZADO },
          { type: 'rect', x: 0, y: alto, w: ANCHO_PAGINA, h: FRANJA, color: ACENTO },
        ],
      };
      const contenido: Content =
        pagina === 1
          ? encabezado(taller, p)
          : {
              margin: [LADO, 14, LADO, 0],
              columns: [
                { text: taller.nombre.toUpperCase(), bold: true, fontSize: 11, color: MARCA, characterSpacing: 0.5 },
                { text: `Presupuesto N° ${p.numero}`, bold: true, fontSize: 11, color: ACENTO, alignment: 'right' },
              ],
            };
      return [banda, contenido];
    },
    content: [
      bloqueClienteVehiculo(p),
      // Orden acordado con el dueño: pagina 1 = cliente y vehiculo, piezas a trabajar (el auto) y que incluye el trabajo;
      // el detalle con precios parte SIEMPRE en la pagina 2.
      ...(plano ? [plano] : []),
      ...(detalle ? [detalle] : []),
      { stack: [titulo('Detalle del trabajo', [], 4)], pageBreak: 'before' },
      tablaDetalle(p),
      bloqueTotales(p),
      ...(pago ? [pago] : []),
      ...(p.observaciones?.trim() ? [bloqueTexto('Observaciones', p.observaciones.trim())] : []),
      ...(p.condiciones.trim() ? [bloqueTexto('Condiciones', p.condiciones.trim())] : []),
      ...(cuentas ? [cuentas] : []),
    ],
    footer: (pagina: number, total: number) => ({
      margin: [LADO, 14, LADO, 0],
      stack: [
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: ANCHO, y2: 0, lineWidth: 1, lineColor: LINEA }] },
        {
          margin: [0, 6, 0, 0],
          columns: [
            { text: `Presupuesto N° ${p.numero} · ${taller.nombre}`, color: SUAVE, fontSize: 8 },
            { text: `Página ${pagina} de ${total}`, color: SUAVE, fontSize: 8, alignment: 'right' },
          ],
        },
      ],
    }),
  };
}
