import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { traducirErrorBD } from '../validacion';

export interface Combo {
  id: string;
  nombre: string;
  activo: boolean;
  orden: number;
  piezas: { id: string; nombre: string; usaPosicion: boolean }[];
}

interface FilaCombo {
  id: string;
  nombre: string;
  activo: boolean;
  orden: number;
  piezas: { id: string; nombre: string; usaPosicion: boolean }[];
}

const SELECT_COMBOS = `
  SELECT co.id, co.nombre, co.activo, co.orden,
         COALESCE(json_agg(json_build_object('id', p.id, 'nombre', p.nombre, 'usaPosicion', p.usa_posicion)
                           ORDER BY cp.orden, p.nombre) FILTER (WHERE p.id IS NOT NULL), '[]') AS piezas
    FROM combos co
    LEFT JOIN combo_piezas cp ON cp.combo_id = co.id
    LEFT JOIN piezas p ON p.id = cp.pieza_id`;

/** Combos: grupos de piezas que se agregan juntas a un presupuesto (p. ej. "Lateral completo"). */
@Injectable()
export class CombosService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async listar(tallerId: string): Promise<Combo[]> {
    const { rows } = await this.db.conTaller(tallerId, (c) =>
      c.query<FilaCombo>(`${SELECT_COMBOS} GROUP BY co.id ORDER BY co.orden, co.nombre`),
    );
    return rows;
  }

  private async obtener(c: PoolClient, id: string): Promise<Combo> {
    const { rows } = await c.query<FilaCombo>(`${SELECT_COMBOS} WHERE co.id = $1 GROUP BY co.id`, [id]);
    if (!rows[0]) throw new NotFoundException('El combo no existe');
    return rows[0];
  }

  /** Reemplaza las piezas del combo. Con RLS solo se ven las piezas del propio taller. */
  private async fijarPiezas(c: PoolClient, tallerId: string, comboId: string, piezaIds: string[]): Promise<void> {
    const unicas = [...new Set(piezaIds)];
    if (unicas.length) {
      const { rows } = await c.query<{ n: number }>('SELECT count(*)::int AS n FROM piezas WHERE id = ANY($1::uuid[])', [unicas]);
      if (rows[0].n !== unicas.length) throw new NotFoundException('Alguna de las piezas no existe');
    }
    await c.query('DELETE FROM combo_piezas WHERE combo_id = $1', [comboId]);
    for (const [i, piezaId] of unicas.entries()) {
      await c.query('INSERT INTO combo_piezas (combo_id, taller_id, pieza_id, orden) VALUES ($1, $2, $3, $4)', [
        comboId,
        tallerId,
        piezaId,
        i + 1,
      ]);
    }
  }

  async crear(tallerId: string, d: { nombre: string; piezaIds: string[] }): Promise<Combo> {
    try {
      return await this.db.conTaller(tallerId, async (c) => {
        const { rows } = await c.query<{ id: string }>(
          `INSERT INTO combos (taller_id, nombre, orden)
           VALUES ($1, $2, COALESCE((SELECT max(orden) FROM combos), 0) + 1) RETURNING id`,
          [tallerId, d.nombre],
        );
        await this.fijarPiezas(c, tallerId, rows[0].id, d.piezaIds);
        return this.obtener(c, rows[0].id);
      });
    } catch (e) {
      if (e instanceof NotFoundException || e instanceof BadRequestException) throw e;
      return traducirErrorBD(e);
    }
  }

  async actualizar(
    tallerId: string,
    id: string,
    cambios: { nombre?: string; activo?: boolean; piezaIds?: string[] },
  ): Promise<Combo> {
    try {
      return await this.db.conTaller(tallerId, async (c) => {
        const sets: string[] = [];
        const valores: unknown[] = [];
        if (cambios.nombre !== undefined) {
          valores.push(cambios.nombre);
          sets.push(`nombre = $${valores.length}`);
        }
        if (cambios.activo !== undefined) {
          valores.push(cambios.activo);
          sets.push(`activo = $${valores.length}`);
        }
        if (sets.length) {
          const r = await c.query(`UPDATE combos SET ${sets.join(', ')} WHERE id = $${valores.length + 1}`, [...valores, id]);
          if (!r.rowCount) throw new NotFoundException('El combo no existe');
        }
        if (cambios.piezaIds !== undefined) {
          const existe = await c.query('SELECT 1 FROM combos WHERE id = $1', [id]);
          if (!existe.rowCount) throw new NotFoundException('El combo no existe');
          await this.fijarPiezas(c, tallerId, id, cambios.piezaIds);
        }
        return this.obtener(c, id);
      });
    } catch (e) {
      if (e instanceof NotFoundException || e instanceof BadRequestException) throw e;
      return traducirErrorBD(e);
    }
  }

  async eliminar(tallerId: string, id: string): Promise<void> {
    const r = await this.db.conTaller(tallerId, (c) => c.query('DELETE FROM combos WHERE id = $1', [id]));
    if (!r.rowCount) throw new NotFoundException('El combo no existe');
  }
}
