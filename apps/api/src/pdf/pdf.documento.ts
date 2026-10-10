import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';

/** Lo que el PDF necesita del taller. El logo (SVG) y los colores se agregan aqui cuando existan. */
export interface TallerParaPdf {
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  datosTransferencia: string | null;
  /** Logo SVG para fondo claro (ya validado al guardarlo). Si falta, se escribe el nombre. */
  logoSvg: string | null;
}

/** Subconjunto del presupuesto que se imprime. Nunca incluye la vista interna (costos y ganancia). */
export interface PresupuestoParaPdf {
  numero: number;
  fecha: string;
  validoHasta: string;
  cliente: { nombre: string; telefono: string };
  vehiculo: { patente: string; marca: string | null; modelo: string | null; anio: number | null };
  lineas: { nombre: string; posicion: string; operacion: 'reparar' | 'reemplazar' | 'libre'; desabollado: number; precioTotal: number }[];
  subtotal: number;
  descuento: number;
  total: number;
  montoInicio: number;
  plazoDias: number | null;
  observaciones: string | null;
  condiciones: string;
}

const COLOR_TEXTO = '#111827';
const COLOR_SUAVE = '#4b5563';
const COLOR_LINEA = '#d1d5db';
const COLOR_FONDO = '#f3f4f6';

/** 80000 -> "$80.000"; -10000 -> "-$10.000". */
export const pesos = (n: number): string =>
  (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });

/** "2026-10-25" -> "25-10-2026". */
export const fechaCl = (iso: string): string => iso.split('-').reverse().join('-');

const lado = (posicion: string) => (posicion === 'izquierda' ? ' izquierda' : posicion === 'derecha' ? ' derecha' : '');

function queSeHace(l: PresupuestoParaPdf['lineas'][number]): string | null {
  if (l.operacion === 'reemplazar') return 'Cambio de pieza y pintura';
  if (l.operacion === 'reparar') return l.desabollado > 0 ? 'Desabollado y pintura' : 'Pintura';
  return null;
}

/** Arma el documento (A4) con los datos ya calculados por el servidor. */
export function construirDocumento(taller: TallerParaPdf, p: PresupuestoParaPdf): TDocumentDefinitions {
  const vehiculo = [p.vehiculo.marca, p.vehiculo.modelo, p.vehiculo.anio].filter(Boolean).join(' ');

  const contacto = [taller.direccion, taller.telefono ? `Tel. ${taller.telefono}` : null].filter(Boolean) as string[];

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
    datos.push({ text: [{ text: 'Para iniciar el trabajo: ', bold: true }, pesos(p.montoInicio)], margin: [0, 0, 0, 4] });
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
  if (taller.datosTransferencia?.trim()) bloque('Datos para transferencia', taller.datosTransferencia.trim());

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
            stack: [
              taller.logoSvg ? { svg: taller.logoSvg, width: 170 } : { text: taller.nombre, fontSize: 20, bold: true },
              ...(contacto.length ? [{ text: contacto.join('\n'), color: COLOR_SUAVE, fontSize: 9.5, margin: [0, 3, 0, 0] as [number, number, number, number] }] : []),
            ],
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
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: COLOR_LINEA }], margin: [0, 14, 0, 14] },
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
      { text: 'Detalle del trabajo', bold: true, fontSize: 12, margin: [0, 20, 0, 6] },
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
      ...bloques,
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
