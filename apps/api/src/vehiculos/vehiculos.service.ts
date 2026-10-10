import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { traducirErrorBD } from '../validacion';

export interface Vehiculo {
  id: string;
  clienteId: string;
  patente: string;
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  color: string | null;
  creadoEn: string;
}

export interface VehiculoConCliente extends Vehiculo {
  cliente: { id: string; nombre: string; telefono: string };
}

export interface DatosVehiculo {
  patente: string;
  marca?: string | null;
  modelo?: string | null;
  anio?: number | null;
  color?: string | null;
}

export interface FilaVehiculo {
  id: string;
  cliente_id: string;
  patente: string;
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  color: string | null;
  creado_en: Date;
}

export const COLUMNAS_VEHICULO = 'id, cliente_id, patente, marca, modelo, anio, color, creado_en';

export const aVehiculo = (f: FilaVehiculo): Vehiculo => ({
  id: f.id,
  clienteId: f.cliente_id,
  patente: f.patente,
  marca: f.marca,
  modelo: f.modelo,
  anio: f.anio,
  color: f.color,
  creadoEn: f.creado_en.toISOString(),
});

/** Inserta un vehiculo dentro de una transaccion de conTaller(). Lo usan tambien los clientes. */
export async function insertarVehiculo(
  db: PoolClient,
  tallerId: string,
  clienteId: string,
  d: DatosVehiculo,
): Promise<Vehiculo> {
  try {
    const { rows } = await db.query<FilaVehiculo>(
      `INSERT INTO vehiculos (taller_id, cliente_id, patente, marca, modelo, anio, color)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${COLUMNAS_VEHICULO}`,
      [tallerId, clienteId, d.patente, d.marca ?? null, d.modelo ?? null, d.anio ?? null, d.color ?? null],
    );
    return aVehiculo(rows[0]);
  } catch (e) {
    return traducirErrorBD(e);
  }
}

const SELECT_CON_CLIENTE = `
  SELECT v.id, v.cliente_id, v.patente, v.marca, v.modelo, v.anio, v.color, v.creado_en,
         c.nombre AS cliente_nombre, c.telefono AS cliente_telefono
    FROM vehiculos v JOIN clientes c ON c.id = v.cliente_id`;

type FilaConCliente = FilaVehiculo & { cliente_nombre: string; cliente_telefono: string };

const aConCliente = (f: FilaConCliente): VehiculoConCliente => ({
  ...aVehiculo(f),
  cliente: { id: f.cliente_id, nombre: f.cliente_nombre, telefono: f.cliente_telefono },
});

@Injectable()
export class VehiculosService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async porId(tallerId: string, id: string): Promise<VehiculoConCliente> {
    const { rows } = await this.db.conTaller(tallerId, (c) =>
      c.query<FilaConCliente>(`${SELECT_CON_CLIENTE} WHERE v.id = $1`, [id]),
    );
    if (!rows[0]) throw new NotFoundException('El vehículo no existe');
    return aConCliente(rows[0]);
  }

  /** Busqueda exacta por patente ya normalizada (paso 1 del presupuesto). */
  async porPatente(tallerId: string, patente: string): Promise<VehiculoConCliente> {
    const { rows } = await this.db.conTaller(tallerId, (c) =>
      c.query<FilaConCliente>(`${SELECT_CON_CLIENTE} WHERE v.patente = $1`, [patente]),
    );
    if (!rows[0]) throw new NotFoundException('No hay un vehículo con esa patente');
    return aConCliente(rows[0]);
  }

  async crear(tallerId: string, clienteId: string, datos: DatosVehiculo): Promise<Vehiculo> {
    return this.db.conTaller(tallerId, async (c) => {
      // Con RLS solo se ven los clientes del propio taller: uno ajeno responde igual que uno inexistente.
      const cliente = await c.query('SELECT 1 FROM clientes WHERE id = $1', [clienteId]);
      if (!cliente.rowCount) throw new NotFoundException('El cliente no existe');
      return insertarVehiculo(c, tallerId, clienteId, datos);
    });
  }

  async actualizar(
    tallerId: string,
    id: string,
    cambios: Partial<DatosVehiculo> & { clienteId?: string },
  ): Promise<VehiculoConCliente> {
    const sets: string[] = [];
    const valores: unknown[] = [];
    const agregar = (columna: string, valor: unknown) => {
      valores.push(valor);
      sets.push(`${columna} = $${valores.length}`);
    };
    if (cambios.patente !== undefined) agregar('patente', cambios.patente);
    if (cambios.marca !== undefined) agregar('marca', cambios.marca);
    if (cambios.modelo !== undefined) agregar('modelo', cambios.modelo);
    if (cambios.anio !== undefined) agregar('anio', cambios.anio);
    if (cambios.color !== undefined) agregar('color', cambios.color);
    if (cambios.clienteId !== undefined) agregar('cliente_id', cambios.clienteId);

    await this.db.conTaller(tallerId, async (c) => {
      if (cambios.clienteId !== undefined) {
        const cliente = await c.query('SELECT 1 FROM clientes WHERE id = $1', [cambios.clienteId]);
        if (!cliente.rowCount) throw new NotFoundException('El cliente no existe');
      }
      if (!sets.length) return;
      try {
        const r = await c.query(`UPDATE vehiculos SET ${sets.join(', ')} WHERE id = $${valores.length + 1}`, [...valores, id]);
        if (!r.rowCount) throw new NotFoundException('El vehículo no existe');
      } catch (e) {
        if (e instanceof NotFoundException) throw e;
        return traducirErrorBD(e);
      }
    });
    return this.porId(tallerId, id);
  }
}
