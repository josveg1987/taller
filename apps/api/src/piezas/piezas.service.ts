import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { traducirErrorBD } from '../validacion';

export interface Pieza {
  id: string;
  nombre: string;
  usaPosicion: boolean;
  /** null = usa la tarifa de pintura del taller. */
  tarifaPintura: number | null;
  activa: boolean;
  orden: number;
}

interface FilaPieza {
  id: string;
  nombre: string;
  usa_posicion: boolean;
  tarifa_pintura: number | null;
  activa: boolean;
  orden: number;
}

const aPieza = (f: FilaPieza): Pieza => ({
  id: f.id,
  nombre: f.nombre,
  usaPosicion: f.usa_posicion,
  tarifaPintura: f.tarifa_pintura,
  activa: f.activa,
  orden: f.orden,
});

const COLUMNAS = 'id, nombre, usa_posicion, tarifa_pintura, activa, orden';

type Consulta = (sql: string, params: unknown[]) => Promise<{ rowCount: number | null }>;

/**
 * Copia la plantilla estandar (piezas y combos) al catalogo del taller. Se puede repetir sin duplicar:
 * agrega solo las piezas que faltan, y un combo solo si no existe (nunca toca los combos que el taller
 * ya tiene, ni sus piezas). Devuelve cuantas piezas agrego.
 */
export async function sembrarCatalogo(consulta: Consulta, tallerId: string): Promise<number> {
  const piezas = await consulta(
    `INSERT INTO piezas (taller_id, nombre, usa_posicion, orden)
     SELECT $1, b.nombre, b.usa_posicion, b.orden + COALESCE((SELECT max(orden) FROM piezas WHERE taller_id = $1), 0)
       FROM catalogo_piezas_base b
     ON CONFLICT (taller_id, nombre) DO NOTHING`,
    [tallerId],
  );
  await consulta(
    `WITH nuevos AS (
       INSERT INTO combos (taller_id, nombre, orden)
       SELECT $1, b.nombre, b.orden + COALESCE((SELECT max(orden) FROM combos WHERE taller_id = $1), 0)
         FROM catalogo_combos_base b
       ON CONFLICT (taller_id, nombre) DO NOTHING
       RETURNING id, nombre
     )
     INSERT INTO combo_piezas (combo_id, taller_id, pieza_id, orden)
     SELECT n.id, $1, p.id, cbp.orden
       FROM nuevos n
       JOIN catalogo_combos_base cb ON cb.nombre = n.nombre
       JOIN catalogo_combo_base_piezas cbp ON cbp.combo_id = cb.id
       JOIN catalogo_piezas_base pb ON pb.id = cbp.pieza_id
       JOIN piezas p ON p.taller_id = $1 AND p.nombre = pb.nombre`,
    [tallerId],
  );
  return piezas.rowCount ?? 0;
}

@Injectable()
export class PiezasService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async listar(tallerId: string, incluirInactivas: boolean): Promise<Pieza[]> {
    const { rows } = await this.db.conTaller(tallerId, (c) =>
      c.query<FilaPieza>(
        `SELECT ${COLUMNAS} FROM piezas ${incluirInactivas ? '' : 'WHERE activa'} ORDER BY orden, nombre`,
      ),
    );
    return rows.map(aPieza);
  }

  async crear(
    tallerId: string,
    d: { nombre: string; usaPosicion: boolean; tarifaPintura: number | null },
  ): Promise<Pieza> {
    try {
      const { rows } = await this.db.conTaller(tallerId, (c) =>
        c.query<FilaPieza>(
          `INSERT INTO piezas (taller_id, nombre, usa_posicion, tarifa_pintura, orden)
           VALUES ($1, $2, $3, $4, COALESCE((SELECT max(orden) FROM piezas), 0) + 1)
           RETURNING ${COLUMNAS}`,
          [tallerId, d.nombre, d.usaPosicion, d.tarifaPintura],
        ),
      );
      return aPieza(rows[0]);
    } catch (e) {
      return traducirErrorBD(e);
    }
  }

  async actualizar(
    tallerId: string,
    id: string,
    cambios: { nombre?: string; usaPosicion?: boolean; tarifaPintura?: number | null; activa?: boolean },
  ): Promise<Pieza> {
    const sets: string[] = [];
    const valores: unknown[] = [];
    const agregar = (columna: string, valor: unknown) => {
      valores.push(valor);
      sets.push(`${columna} = $${valores.length}`);
    };
    if (cambios.nombre !== undefined) agregar('nombre', cambios.nombre);
    if (cambios.usaPosicion !== undefined) agregar('usa_posicion', cambios.usaPosicion);
    if (cambios.tarifaPintura !== undefined) agregar('tarifa_pintura', cambios.tarifaPintura);
    if (cambios.activa !== undefined) agregar('activa', cambios.activa);
    try {
      const { rows } = await this.db.conTaller(tallerId, (c) =>
        sets.length
          ? c.query<FilaPieza>(
              `UPDATE piezas SET ${sets.join(', ')} WHERE id = $${valores.length + 1} RETURNING ${COLUMNAS}`,
              [...valores, id],
            )
          : c.query<FilaPieza>(`SELECT ${COLUMNAS} FROM piezas WHERE id = $1`, [id]),
      );
      if (!rows[0]) throw new NotFoundException('La pieza no existe');
      return aPieza(rows[0]);
    } catch (e) {
      if (e instanceof NotFoundException) throw e;
      return traducirErrorBD(e);
    }
  }

  /** Sube o baja una pieza una posicion en el orden del catalogo. */
  async mover(tallerId: string, id: string, direccion: 'arriba' | 'abajo'): Promise<Pieza[]> {
    await this.db.conTaller(tallerId, async (c) => {
      const { rows } = await c.query<{ id: string }>('SELECT id FROM piezas ORDER BY orden, nombre');
      const ids = rows.map((r) => r.id);
      const i = ids.indexOf(id);
      if (i < 0) throw new NotFoundException('La pieza no existe');
      const j = direccion === 'arriba' ? i - 1 : i + 1;
      if (j >= 0 && j < ids.length) [ids[i], ids[j]] = [ids[j], ids[i]];
      // Reescribe el orden completo (1..n): deja la numeracion limpia aunque hubiera huecos.
      await c.query(
        `UPDATE piezas p SET orden = v.n
           FROM (SELECT unnest($1::uuid[]) AS id, generate_series(1, $2::int) AS n) v
          WHERE p.id = v.id`,
        [ids, ids.length],
      );
    });
    return this.listar(tallerId, true);
  }

  /** Agrega al catalogo del taller las piezas estandar que le falten. */
  async agregarEstandar(tallerId: string): Promise<{ agregadas: number; piezas: Pieza[] }> {
    const agregadas = await this.db.conTaller(tallerId, (c) => sembrarCatalogo((sql, p) => c.query(sql, p), tallerId));
    return { agregadas, piezas: await this.listar(tallerId, true) };
  }
}
