// Deben coincidir con apps/api/src/clientes/clientes.service.ts y apps/api/src/vehiculos/vehiculos.service.ts.
export interface VehiculoResumen {
  id: string;
  patente: string;
  marca: string | null;
  modelo: string | null;
}

export interface ClienteLista {
  id: string;
  nombre: string;
  telefono: string;
  vehiculos: VehiculoResumen[];
}

export interface Vehiculo {
  id: string;
  clienteId: string;
  patente: string;
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  color: string | null;
}

export interface ClienteDetalle {
  id: string;
  nombre: string;
  telefono: string;
  rut: string | null;
  email: string | null;
  direccion: string | null;
  vehiculos: Vehiculo[];
}

export interface VehiculoConCliente extends Vehiculo {
  cliente: { id: string; nombre: string; telefono: string };
}

/** "Toyota Yaris 2018" a partir de lo que haya. */
export function descripcionVehiculo(v: Pick<Vehiculo, 'marca' | 'modelo' | 'anio'>): string {
  return [v.marca, v.modelo, v.anio].filter(Boolean).join(' ');
}
