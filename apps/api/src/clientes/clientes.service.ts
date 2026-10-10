import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { escaparLike, normalizarPatente } from '../validacion';
import {
  aVehiculo,
  COLUMNAS_VEHICULO,
  DatosVehiculo,
  FilaVehiculo,
  insertarVehiculo,
  Vehiculo,
} from '../vehiculos/vehiculos.service';

export interface Cliente {
  id: string;
  nombre: string;
  telefono: string;
  rut: string | null;
  email: string | null;
  direccion: string | null;
  creadoEn: string;
}

export interface VehiculoResumen {
  id: string;
  patente: string;
  marca: string | null;
  modelo: string | null;
}

export interface ClienteConVehiculos extends Cliente {
  vehiculos: VehiculoResumen[];
}

export interface ClienteDetalle extends Cliente {
  vehiculos: Vehiculo[];
}

export interface DatosCliente {
  nombre: string;
  telefono: string;
  rut?: string | null;
  email?: string | null;
  direccion?: string | null;
}

interface FilaCliente {
  id: string;
  nombre: string;
  telefono: string;
  rut: string | null;
  email: string | null;
  direccion: string | null;
  creado_en: Date;
}

const aCliente = (f: FilaCliente): Cliente => ({
  id: f.id,
  nombre: f.nombre,
  telefono: f.telefono,
  rut: f.rut,
  email: f.email,
  direccion: f.direccion,
  creadoEn: f.creado_en.toISOString(),
});

const COLUMNAS_CLIENTE = 'id, nombre, telefono, rut, email, direccion, creado_en';
const MAX_RESULTADOS = 100;

@Injectable()
export class ClientesService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  /**
   * Sin texto: los clientes mas recientes. Con texto: busca por nombre (sin distinguir mayusculas
   * ni tildes), por telefono (solo los digitos) o por la patente de alguno de sus vehiculos.
   */
  async buscar(tallerId: string, texto?: string): Promise<ClienteConVehiculos[]> {
    const q = (texto ?? '').trim();
    const params: unknown[] = [];
    let filtro = '';
    let orden = 'c.creado_en DESC';

    if (q) {
      const digitos = q.replace(/\D/g, '');
      const patente = normalizarPatente(q);
      params.push(`%${escaparLike(q)}%`);
      const condiciones = [`unaccent(lower(c.nombre)) LIKE unaccent(lower($${params.length}))`];
      if (digitos.length >= 3) {
        params.push(`%${digitos}%`);
        condiciones.push(`regexp_replace(c.telefono, '\\D', '', 'g') LIKE $${params.length}`);
      }
      if (patente.length >= 2) {
        params.push(`%${escaparLike(patente)}%`);
        condiciones.push(`EXISTS (SELECT 1 FROM vehiculos x WHERE x.cliente_id = c.id AND x.patente LIKE $${params.length})`);
      }
      filtro = `WHERE ${condiciones.join(' OR ')}`;
      orden = 'lower(c.nombre)';
    }

    const { rows } = await this.db.conTaller(tallerId, (c) =>
      c.query<FilaCliente & { vehiculos: VehiculoResumen[] }>(
        `SELECT c.id, c.nombre, c.telefono, c.rut, c.email, c.direccion, c.creado_en,
                COALESCE(json_agg(json_build_object('id', v.id, 'patente', v.patente, 'marca', v.marca, 'modelo', v.modelo)
                                  ORDER BY v.patente) FILTER (WHERE v.id IS NOT NULL), '[]') AS vehiculos
           FROM clientes c LEFT JOIN vehiculos v ON v.cliente_id = c.id
           ${filtro}
          GROUP BY c.id
          ORDER BY ${orden}
          LIMIT ${MAX_RESULTADOS}`,
        params,
      ),
    );
    return rows.map((f) => ({ ...aCliente(f), vehiculos: f.vehiculos }));
  }

  /** Crea el cliente y, si se indica, su primer vehiculo, en una sola transaccion. */
  async crear(tallerId: string, datos: DatosCliente, vehiculo?: DatosVehiculo): Promise<ClienteDetalle> {
    return this.db.conTaller(tallerId, async (c) => {
      const { rows } = await c.query<FilaCliente>(
        `INSERT INTO clientes (taller_id, nombre, telefono, rut, email, direccion)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${COLUMNAS_CLIENTE}`,
        [tallerId, datos.nombre, datos.telefono, datos.rut ?? null, datos.email ?? null, datos.direccion ?? null],
      );
      const cliente = aCliente(rows[0]);
      const vehiculos = vehiculo ? [await insertarVehiculo(c, tallerId, cliente.id, vehiculo)] : [];
      return { ...cliente, vehiculos };
    });
  }

  async obtener(tallerId: string, id: string): Promise<ClienteDetalle> {
    return this.db.conTaller(tallerId, async (c) => {
      const { rows } = await c.query<FilaCliente>(`SELECT ${COLUMNAS_CLIENTE} FROM clientes WHERE id = $1`, [id]);
      if (!rows[0]) throw new NotFoundException('El cliente no existe');
      const v = await c.query<FilaVehiculo>(
        `SELECT ${COLUMNAS_VEHICULO} FROM vehiculos WHERE cliente_id = $1 ORDER BY patente`,
        [id],
      );
      return { ...aCliente(rows[0]), vehiculos: v.rows.map(aVehiculo) };
    });
  }

  async actualizar(tallerId: string, id: string, cambios: Partial<DatosCliente>): Promise<ClienteDetalle> {
    const sets: string[] = [];
    const valores: unknown[] = [];
    const agregar = (columna: string, valor: unknown) => {
      valores.push(valor);
      sets.push(`${columna} = $${valores.length}`);
    };
    if (cambios.nombre !== undefined) agregar('nombre', cambios.nombre);
    if (cambios.telefono !== undefined) agregar('telefono', cambios.telefono);
    if (cambios.rut !== undefined) agregar('rut', cambios.rut);
    if (cambios.email !== undefined) agregar('email', cambios.email);
    if (cambios.direccion !== undefined) agregar('direccion', cambios.direccion);

    if (sets.length) {
      const r = await this.db.conTaller(tallerId, (c) =>
        c.query(`UPDATE clientes SET ${sets.join(', ')} WHERE id = $${valores.length + 1}`, [...valores, id]),
      );
      if (!r.rowCount) throw new NotFoundException('El cliente no existe');
    }
    return this.obtener(tallerId, id);
  }
}
