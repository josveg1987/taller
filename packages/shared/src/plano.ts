import { ARTE_PLANO, CAJAS_PLANO, FOCOS_PLANO, REGIONES_PLANO } from './plano-datos';
import { clavePlano, ZONAS, type LadoPlano, type Zona } from './zonas';

export * from './zonas';

type Vista = 'superior' | 'lateral' | 'frente' | 'atras';

// Ubicacion de cada vista dentro del plano completo (360 x 596), igual que en el prototipo.
const VW: Record<Vista, { x0: number; y0: number; w: number; s: number; tx: number; ty: number }> = {
  superior: { x0: 24, y0: 335, w: 866, s: 0.3926, tx: 10, ty: 24 },
  lateral: { x0: 28, y0: 34, w: 860, s: 0.3953, tx: 10, ty: 202 },
  frente: { x0: 950, y0: 36, w: 388, s: 0.425, tx: 10, ty: 470 },
  atras: { x0: 948, y0: 402, w: 390, s: 0.423, tx: 185, ty: 470 },
};
const TY_DERECHO = 330; // el lateral derecho es el izquierdo en espejo, mas abajo

function transformacion(v: Vista, ty: number, espejo: boolean): string {
  const c = VW[v];
  return espejo
    ? `translate(${(c.tx + c.s * c.w).toFixed(2)} ${ty}) scale(${-c.s} ${c.s}) translate(${-c.x0} ${-c.y0})`
    : `translate(${c.tx} ${ty}) scale(${c.s}) translate(${-c.x0} ${-c.y0})`;
}

/** Recortes del plano completo para acercar una vista. */
export const VISTAS_PLANO = {
  todo: { texto: 'Todo', viewBox: '0 0 360 596' },
  superior: { texto: 'Arriba', viewBox: '0 4 360 174' },
  izquierda: { texto: 'Izq.', viewBox: '0 186 360 128' },
  derecha: { texto: 'Der.', viewBox: '0 314 360 130' },
  frente: { texto: 'Frente', viewBox: '0 454 180 142' },
  atras: { texto: 'Atrás', viewBox: '180 454 180 142' },
} as const;
export type VistaPlano = keyof typeof VISTAS_PLANO;

/** Rotulos de las vistas en el plano completo. */
export const ROTULOS_PLANO = [
  { x: 10, y: 14, texto: 'VISTA SUPERIOR · frente a la izquierda' },
  { x: 10, y: 42, texto: 'DER.' },
  { x: 10, y: 170, texto: 'IZQ.' },
  { x: 10, y: 196, texto: 'LATERAL IZQUIERDO' },
  { x: 10, y: 324, texto: 'LATERAL DERECHO' },
  { x: 10, y: 464, texto: 'FRENTE' },
  { x: 185, y: 464, texto: 'ATRÁS' },
] as const;

export type AreaTactil = { tipo: 'circulo'; cx: number; cy: number; r: number } | { tipo: 'rect'; x: number; y: number; w: number; h: number };

/** Un trozo dibujable de una pieza en una vista (ya ubicado con su transformacion). */
export interface Trozo {
  /** Recorte en que aparece (para no dibujar de mas al mostrar una sola vista). */
  vista: Exclude<VistaPlano, 'todo'>;
  transform: string;
  /** Chapa. */
  s: string;
  /** Vidrio (ventanilla de una puerta). */
  gl?: string;
  /** Area tactil extra, invisible (espejo, zocalo). */
  area?: AreaTactil;
}

/** Una pieza del plano, con todos sus trozos en las 4 vistas. */
export interface PiezaPlano {
  clave: string;
  zona: Zona;
  lado: LadoPlano | null;
  trozos: Trozo[];
}

function areaExtra(zona: Zona, claveCaja: string): AreaTactil | undefined {
  const b = CAJAS_PLANO[claveCaja];
  if (!b) return undefined;
  if (zona === 'espejo') return { tipo: 'circulo', cx: (b[0] + b[2]) / 2, cy: (b[1] + b[3]) / 2, r: 40 };
  if (zona === 'zocalo') return { tipo: 'rect', x: b[0], y: b[1], w: b[2] - b[0], h: b[3] - b[1] + 26 };
  return undefined;
}

// Orden de dibujo del prototipo (las de encima al final).
const ORDEN: Zona[] = [
  'parachoques_delantero',
  'parachoques_trasero',
  'capot',
  'maleta',
  'tapabarro_delantero',
  'costado_trasero',
  'puerta_trasera',
  'puerta_delantera',
  'zocalo',
  'techo',
  'espejo',
];

function trozosDe(zona: Zona, lado: LadoPlano | null): Trozo[] {
  const trozos: Trozo[] = [];
  const lateral = REGIONES_PLANO.lateral[zona];
  if (lateral) {
    // Lateral: izquierdo tal cual; derecho en espejo. Una pieza sin lado aparece en los dos.
    const lados: LadoPlano[] = lado ? [lado] : ['izquierda', 'derecha'];
    for (const l of lados) {
      const der = l === 'derecha';
      trozos.push({
        vista: der ? 'derecha' : 'izquierda',
        transform: transformacion('lateral', der ? TY_DERECHO : VW.lateral.ty, der),
        ...lateral,
        area: areaExtra(zona, `lateral.${zona}`),
      });
    }
  }
  for (const v of ['superior', 'frente', 'atras'] as const) {
    const k = lado ? `${zona}|${lado}` : zona;
    const r = REGIONES_PLANO[v][k];
    if (r) trozos.push({ vista: v, transform: transformacion(v, VW[v].ty, false), ...r, area: areaExtra(zona, `${v}.${k}`) });
  }
  return trozos;
}

let cache: PiezaPlano[] | null = null;

/** Todas las piezas del plano (17: las por lado van una vez por lado), en orden de dibujo. */
export function piezasDelPlano(): PiezaPlano[] {
  if (cache) return cache;
  cache = [];
  for (const zona of ORDEN) {
    const lados: (LadoPlano | null)[] = ZONAS[zona].porLado ? ['izquierda', 'derecha'] : [null];
    for (const lado of lados) cache.push({ clave: clavePlano(zona, lado), zona, lado, trozos: trozosDe(zona, lado) });
  }
  return cache;
}

/**
 * Vidrios decorativos (parabrisas, luneta), focos (no son de ninguna pieza: se dibujan en blanco encima, asi nunca
 * quedan pintados) y lineas del dibujo, con su transformacion.
 */
type Recorte = Exclude<VistaPlano, 'todo'>;

export function fondoDelPlano(): {
  vidrios: { vista: Recorte; transform: string; d: string }[];
  focos: { vista: Recorte; transform: string; d: string }[];
  arte: { vista: Recorte; transform: string; d: string[] }[];
} {
  const ubicaciones: [Vista, number, boolean, Recorte][] = [
    ['superior', VW.superior.ty, false, 'superior'],
    ['lateral', VW.lateral.ty, false, 'izquierda'],
    ['lateral', TY_DERECHO, true, 'derecha'],
    ['frente', VW.frente.ty, false, 'frente'],
    ['atras', VW.atras.ty, false, 'atras'],
  ];
  return {
    vidrios: ubicaciones
      .map(([v, ty, esp, vista]) => ({ vista, transform: transformacion(v, ty, esp), d: REGIONES_PLANO[v].vidrio?.s ?? '' }))
      .filter((x) => x.d),
    focos: ubicaciones.flatMap(([v, ty, esp, vista]) => FOCOS_PLANO[v].map((d) => ({ vista, transform: transformacion(v, ty, esp), d }))),
    // El arte viene en el sistema del SVG original (y invertida, escala 0,1).
    arte: ubicaciones.map(([v, ty, esp, vista]) => ({
      vista,
      transform: `${transformacion(v, ty, esp)} translate(0 717) scale(0.1 -0.1)`,
      d: [...ARTE_PLANO[v]],
    })),
  };
}

export type MarcaPlano = 'reparar' | 'reemplazar';

export interface ColoresPlano {
  linea: string;
  chapa: string;
  vidrio: string;
  reparar: string;
  reemplazar: string;
  /** Color de las franjas sobre lo marcado (para distinguirlo tambien en blanco y negro). */
  franja: string;
}

export const COLORES_PLANO_PDF: ColoresPlano = {
  linea: '#1C2A44',
  chapa: '#FFFFFF',
  vidrio: '#D5DDE8',
  reparar: '#C2410C',
  reemplazar: '#6F95C9',
  franja: '#FFFFFF',
};

/**
 * SVG del plano (o de un recorte) con las piezas marcadas coloreadas. Lo usa el PDF: los colores van escritos
 * en el SVG (sin clases ni variables CSS). Reparar = franjas sobre el color de reparar; cambiar = color lleno.
 */
export function svgPlano(marcas: ReadonlyMap<string, MarcaPlano>, vista: VistaPlano = 'todo', colores: ColoresPlano = COLORES_PLANO_PDF): string {
  const relleno = (m: MarcaPlano | undefined) => (m === 'reparar' ? 'url(#plano-reparar)' : m === 'reemplazar' ? colores.reemplazar : colores.chapa);
  const fondo = fondoDelPlano();
  const ver = (x: { vista: Recorte }) => vista === 'todo' || x.vista === vista;
  let cuerpo = '';
  for (const v of fondo.vidrios.filter(ver)) cuerpo += `<path transform="${v.transform}" fill="${colores.vidrio}" fill-rule="evenodd" d="${v.d}"/>`;
  for (const p of piezasDelPlano()) {
    const m = marcas.get(p.clave);
    for (const t of p.trozos.filter(ver)) {
      cuerpo += `<path transform="${t.transform}" fill="${relleno(m)}" fill-rule="evenodd" d="${t.s}"/>`;
      if (t.gl) cuerpo += `<path transform="${t.transform}" fill="${m ? relleno(m) : colores.vidrio}" fill-opacity="${m ? 0.55 : 1}" fill-rule="evenodd" d="${t.gl}"/>`;
    }
  }
  for (const f of fondo.focos.filter(ver)) cuerpo += `<path transform="${f.transform}" fill="${colores.chapa}" fill-rule="evenodd" d="${f.d}"/>`;
  for (const a of fondo.arte.filter(ver)) cuerpo += `<g transform="${a.transform}" fill="${colores.linea}">${a.d.map((d) => `<path d="${d}"/>`).join('')}</g>`;
  const patron =
    `<pattern id="plano-reparar" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
    `<rect width="18" height="18" fill="${colores.reparar}"/><rect width="18" height="7" fill="${colores.franja}" fill-opacity="0.45"/></pattern>`;
  const [, , w, h] = VISTAS_PLANO[vista].viewBox.split(' ').map(Number);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VISTAS_PLANO[vista].viewBox}" width="${w}" height="${h}"><defs>${patron}</defs>${cuerpo}</svg>`;
}
