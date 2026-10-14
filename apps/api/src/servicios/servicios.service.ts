import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { traducirErrorBD } from '../validacion';

/** Servicio adicional del taller (pulido y otros): se agrega a un presupuesto como una linea de precio propio. */
export interface Servicio {
  id: string;
  nombre: string;
  /** Precio con que parte al agregarlo (editable en el presupuesto); null = sin precio sugerido. */
  precioSugerido: number | null;
  /** Texto que sale bajo el nombre en el PDF. */
  descripcion: string | null;
  activo: boolean;
  orden: number;
}

interface FilaServicio {
  id: string;
  nombre: string;
  precio_sugerido: number | null;
  descripcion: string | null;
  activo: boolean;
  orden: number;
}

const aServicio = (f: FilaServicio): Servicio => ({
  id: f.id,
  nombre: f.nombre,
  precioSugerido: f.precio_sugerido,
  descripcion: f.descripcion,
  activo: f.activo,
  orden: f.orden,
});

const COLUMNAS = 'id, nombre, precio_sugerido, descripcion, activo, orden';

type Consulta = (sql: string, params: unknown[]) => Promise<{ rowCount: number | null }>;

/**
 * Copia la plantilla de servicios (pulido general y de focos) al taller. Se puede repetir sin duplicar:
 * agrega solo los que faltan y nunca pisa lo que el taller ya cambio. Devuelve cuantos agrego.
 */
export async function sembrarServicios(consulta: Consulta, tallerId: string): Promise<number> {
  const r = await consulta(
    `INSERT INTO servicios (taller_id, nombre, descripcion, orden)
     SELECT $1, b.nombre, b.descripcion, b.orden + COALESCE((SELECT max(orden) FROM servicios WHERE taller_id = $1), 0)
       FROM catalogo_servicios_base b
     ON CONFLICT (taller_id, nombre) DO NOTHING`,
    [tallerId],
  );
  return r.rowCount ?? 0;
}

@Injectable()
export class ServiciosService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async listar(tallerId: string, incluirInactivos: boolean): Promise<Servicio[]> {
    const { rows } = await this.db.conTaller(tallerId, (c) =>
      c.query<FilaServicio>(`SELECT ${COLUMNAS} FROM servicios ${incluirInactivos ? '' : 'WHERE activo'} ORDER BY orden, nombre`),
    );
    return rows.map(aServicio);
  }

  async crear(tallerId: string, d: { nombre: string; precioSugerido: number | null; descripcion: string | null }): Promise<Servicio> {
    try {
      const { rows } = await this.db.conTaller(tallerId, (c) =>
        c.query<FilaServicio>(
          `INSERT INTO servicios (taller_id, nombre, precio_sugerido, descripcion, orden)
           VALUES ($1, $2, $3, $4, COALESCE((SELECT max(orden) FROM servicios), 0) + 1) RETURNING ${COLUMNAS}`,
          [tallerId, d.nombre, d.precioSugerido, d.descripcion],
        ),
      );
      return aServicio(rows[0]);
    } catch (e) {
      return traducirErrorBD(e);
    }
  }

  async actualizar(
    tallerId: string,
    id: string,
    cambios: { nombre?: string; precioSugerido?: number | null; descripcion?: string | null; activo?: boolean },
  ): Promise<Servicio> {
    const sets: string[] = [];
    const valores: unknown[] = [];
    const agregar = (columna: string, valor: unknown) => {
      valores.push(valor);
      sets.push(`${columna} = $${valores.length}`);
    };
    if (cambios.nombre !== undefined) agregar('nombre', cambios.nombre);
    if (cambios.precioSugerido !== undefined) agregar('precio_sugerido', cambios.precioSugerido);
    if (cambios.descripcion !== undefined) agregar('descripcion', cambios.descripcion);
    if (cambios.activo !== undefined) agregar('activo', cambios.activo);
    try {
      const { rows } = await this.db.conTaller(tallerId, (c) =>
        sets.length
          ? c.query<FilaServicio>(`UPDATE servicios SET ${sets.join(', ')} WHERE id = $${valores.length + 1} RETURNING ${COLUMNAS}`, [...valores, id])
          : c.query<FilaServicio>(`SELECT ${COLUMNAS} FROM servicios WHERE id = $1`, [id]),
      );
      if (!rows[0]) throw new NotFoundException('El servicio no existe');
      return aServicio(rows[0]);
    } catch (e) {
      if (e instanceof NotFoundException) throw e;
      return traducirErrorBD(e);
    }
  }

  /** Los presupuestos guardan una "foto" de la linea, asi que borrar un servicio no cambia los ya hechos. */
  async eliminar(tallerId: string, id: string): Promise<void> {
    const r = await this.db.conTaller(tallerId, (c) => c.query('DELETE FROM servicios WHERE id = $1', [id]));
    if (!r.rowCount) throw new NotFoundException('El servicio no existe');
  }

  async mover(tallerId: string, id: string, direccion: 'arriba' | 'abajo'): Promise<Servicio[]> {
    await this.db.conTaller(tallerId, async (c) => {
      const { rows } = await c.query<{ id: string }>('SELECT id FROM servicios ORDER BY orden, nombre');
      const ids = rows.map((r) => r.id);
      const i = ids.indexOf(id);
      if (i < 0) throw new NotFoundException('El servicio no existe');
      const j = direccion === 'arriba' ? i - 1 : i + 1;
      if (j >= 0 && j < ids.length) [ids[i], ids[j]] = [ids[j], ids[i]];
      await c.query(
        `UPDATE servicios s SET orden = v.n
           FROM (SELECT unnest($1::uuid[]) AS id, generate_series(1, $2::int) AS n) v
          WHERE s.id = v.id`,
        [ids, ids.length],
      );
    });
    return this.listar(tallerId, true);
  }

  /** Agrega al taller los servicios estandar que le falten. */
  async agregarEstandar(tallerId: string): Promise<{ agregados: number; servicios: Servicio[] }> {
    const agregados = await this.db.conTaller(tallerId, (c) => sembrarServicios((sql, p) => c.query(sql, p), tallerId));
    return { agregados, servicios: await this.listar(tallerId, true) };
  }
}
