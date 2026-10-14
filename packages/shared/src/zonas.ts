/**
 * Plano del auto: zonas del dibujo que corresponden a una pieza del catalogo. Una pieza del taller puede tener
 * una zona (columna `piezas.zona`); asi tocar el dibujo la agrega al presupuesto y el PDF la colorea.
 * La numeracion del 1 al 17 sigue el esquema acordado con el taller (impar = izquierda, par = derecha).
 */
export const ZONAS = {
  parachoques_delantero: { nombre: 'Parachoques delantero', porLado: false },
  capot: { nombre: 'Capot', porLado: false },
  tapabarro_delantero: { nombre: 'Tapabarro delantero', porLado: true },
  puerta_delantera: { nombre: 'Puerta delantera', porLado: true },
  puerta_trasera: { nombre: 'Puerta trasera', porLado: true },
  costado_trasero: { nombre: 'Costado trasero', porLado: true },
  zocalo: { nombre: 'Zócalo', porLado: true },
  espejo: { nombre: 'Espejo', porLado: true },
  techo: { nombre: 'Techo', porLado: false },
  maleta: { nombre: 'Maleta / portalón', porLado: false },
  parachoques_trasero: { nombre: 'Parachoques trasero', porLado: false },
} as const;

export type Zona = keyof typeof ZONAS;
export type LadoPlano = 'izquierda' | 'derecha';
export const LISTA_ZONAS = Object.keys(ZONAS) as Zona[];
export const esZona = (v: unknown): v is Zona => typeof v === 'string' && Object.hasOwn(ZONAS, v);

/** Clave de una pieza en el plano: "capot" o "puerta_delantera|izquierda". */
export const clavePlano = (zona: Zona, lado: LadoPlano | null) => (ZONAS[zona].porLado && lado ? `${zona}|${lado}` : zona);
