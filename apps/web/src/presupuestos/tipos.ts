import type { Operacion } from '@taller/shared';

export type Posicion = 'izquierda' | 'derecha' | 'no_aplica';
export type Lado = 'izquierda' | 'derecha';
export type Estado = 'borrador' | 'enviado' | 'aceptado' | 'rechazado' | 'vencido';

// Deben coincidir con apps/api/src/presupuestos/presupuestos.service.ts.
export interface LineaPresupuesto {
  id: string;
  piezaId: string | null;
  nombre: string;
  posicion: Posicion;
  operacion: Operacion;
  pintura: number;
  desabollado: number;
  repuestoCosto: number;
  margenPct: number;
  repuestoPrecio: number;
  precioTotal: number;
  descripcion: string | null;
}

export interface Presupuesto {
  id: string;
  numero: number;
  fecha: string;
  validoHasta: string;
  estado: Estado;
  cliente: { id: string; nombre: string; telefono: string };
  vehiculo: { id: string; patente: string; marca: string | null; modelo: string | null; anio: number | null };
  lineas: LineaPresupuesto[];
  subtotal: number;
  descuento: number;
  total: number;
  montoInicio: number;
  solicitaAnticipo: boolean;
  costoRepuestos: number;
  precioRepuestos: number;
  gananciaRepuestos: number;
  observaciones: string | null;
  /** Plazo total estimado, en dias habiles. */
  plazoDias: number | null;
  condiciones: string;
}

export interface PresupuestoResumen {
  id: string;
  numero: number;
  fecha: string;
  estado: Estado;
  total: number;
  cliente: { id: string; nombre: string };
  vehiculo: { id: string; patente: string; marca: string | null; modelo: string | null };
}

/** Una linea mientras se arma el presupuesto en el telefono. */
export interface LineaBorrador {
  /** Identificador local de la linea (no es de la base). */
  clave: string;
  piezaId: string | null;
  nombre: string;
  usaPosicion: boolean;
  posicion: Posicion;
  operacion: Operacion;
  pintura: number;
  desabollado: number;
  repuestoCosto: number;
  margenPct: number;
  /** Solo items libres. */
  precio: number;
  /** Servicio del catalogo del que salio la linea (para quitarla al tocarlo de nuevo). */
  servicioId?: string;
  /** Texto que va bajo el nombre en el PDF (servicios). */
  descripcion?: string | null;
}

/** Cliente y vehiculo encontrados por la patente. */
export interface VehiculoEncontrado {
  id: string;
  patente: string;
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  cliente: { id: string; nombre: string; telefono: string };
}

/**
 * Presupuesto en preparacion. Se guarda en el telefono (IndexedDB) en cada cambio, asi no se pierde
 * si se cierra la app o se va la señal; se borra al guardarlo en el servidor.
 */
export interface Borrador {
  id: string;
  /** Taller en que se armo (el administrador de la APP puede entrar a varios). */
  tallerId: string;
  /** Presupuesto del servidor que se esta editando (null si es nuevo). */
  presupuestoId: string | null;
  numero: number | null;
  paso: 1 | 2 | 3;
  patente: string;
  vehiculo: VehiculoEncontrado | null;
  /** Para un vehiculo nuevo de un cliente que ya existe. */
  clienteExistente: { id: string; nombre: string; telefono: string } | null;
  /** Para un vehiculo (y quizas un cliente) nuevos. */
  nuevo: { nombre: string; telefono: string; marca: string; modelo: string; anio: string };
  lado: Lado;
  lineas: LineaBorrador[];
  descuento: number;
  observaciones: string;
  /** Plazo total en dias habiles; 0 = sin plazo indicado. (Borradores antiguos no lo traen: se lee con `?? 0`.) */
  plazoDias: number;
  /** null = todavia no se tocan: se usan las del taller. */
  condiciones: string | null;
  /** undefined = todavia no se decide: parte con lo que diga la configuracion del taller. */
  solicitaAnticipo?: boolean;
  actualizado: number;
  /** Texto con que parte el buscador del paso 1 (p. ej. el nombre de un cliente con varios vehiculos). */
  busqueda?: string;
}

export interface PiezaCatalogo {
  id: string;
  nombre: string;
  usaPosicion: boolean;
  tarifaPintura: number | null;
  desabolladoSugerido: number | null;
}

export interface ServicioCatalogo {
  id: string;
  nombre: string;
  precioSugerido: number | null;
  descripcion: string | null;
}

export interface ComboCatalogo {
  id: string;
  nombre: string;
  activo: boolean;
  piezas: { id: string; nombre: string; usaPosicion: boolean }[];
}

export interface ConfigTaller {
  tarifaPintura: number;
  margenRepuestosPct: number;
  montosDesabollado: number[];
  anticipo: { tipo: 'ninguno' | 'repuestos' | 'porcentaje' | 'fijo'; valor: number | null };
  condiciones: string;
}

export const ESTADOS: Record<Estado, string> = {
  borrador: 'Borrador',
  enviado: 'Enviado',
  aceptado: 'Aceptado',
  rechazado: 'Rechazado',
  vencido: 'Vencido',
};

export const nombreConLado = (nombre: string, posicion: Posicion) =>
  posicion === 'no_aplica' ? nombre : `${nombre} ${posicion === 'izquierda' ? 'izquierda' : 'derecha'}`;
