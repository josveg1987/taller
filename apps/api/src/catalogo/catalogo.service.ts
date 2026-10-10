import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { escaparLike } from '../validacion';

export interface ItemCatalogo {
  id: number;
  nombre: string;
}

const MAX_MARCAS = 50;
const MAX_MODELOS = 200;

/**
 * Catalogo de vehiculos para sugerir al escribir (marca, modelo y año). Son tablas de referencia
 * globales y de solo lectura (no hay datos de ningun taller), por eso se consultan con la
 * conexion normal y no con conTaller().
 */
@Injectable()
export class CatalogoService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  /** Marcas cuyo nombre contiene el texto (sin distinguir mayusculas ni tildes); primero las que empiezan igual. */
  async marcas(texto?: string): Promise<ItemCatalogo[]> {
    const q = (texto ?? '').trim();
    const { rows } = q
      ? await this.db.admin<ItemCatalogo>(
          `SELECT id, nombre FROM catalogo_marcas
            WHERE unaccent(lower(nombre)) LIKE unaccent(lower($1))
            ORDER BY (unaccent(lower(nombre)) LIKE unaccent(lower($2))) DESC, nombre
            LIMIT ${MAX_MARCAS}`,
          [`%${escaparLike(q)}%`, `${escaparLike(q)}%`],
        )
      : await this.db.admin<ItemCatalogo>(`SELECT id, nombre FROM catalogo_marcas ORDER BY nombre LIMIT ${MAX_MARCAS}`);
    return rows;
  }

  /** Modelos de una marca, opcionalmente filtrados por texto y por un año en que existan. */
  async modelos(marcaId: number, texto?: string, anio?: number): Promise<ItemCatalogo[]> {
    const params: unknown[] = [marcaId];
    const filtros = ['m.marca_id = $1'];
    let orden = 'm.nombre';
    const q = (texto ?? '').trim();
    if (q) {
      params.push(`%${escaparLike(q)}%`, `${escaparLike(q)}%`);
      filtros.push(`unaccent(lower(m.nombre)) LIKE unaccent(lower($2))`);
      orden = `(unaccent(lower(m.nombre)) LIKE unaccent(lower($3))) DESC, m.nombre`;
    }
    if (anio !== undefined) {
      params.push(anio);
      filtros.push(`EXISTS (SELECT 1 FROM catalogo_modelo_anios a WHERE a.modelo_id = m.id AND a.anio = $${params.length})`);
    }
    const { rows } = await this.db.admin<ItemCatalogo>(
      `SELECT m.id, m.nombre FROM catalogo_modelos m WHERE ${filtros.join(' AND ')} ORDER BY ${orden} LIMIT ${MAX_MODELOS}`,
      params,
    );
    return rows;
  }

  /** Años (del mas nuevo al mas antiguo) de un modelo, o de todos los modelos de una marca. */
  async anios(filtro: { modeloId: number } | { marcaId: number }): Promise<number[]> {
    const { rows } = await this.db.admin<{ anio: number }>(
      'modeloId' in filtro
        ? 'SELECT anio FROM catalogo_modelo_anios WHERE modelo_id = $1 ORDER BY anio DESC'
        : `SELECT DISTINCT a.anio FROM catalogo_modelo_anios a JOIN catalogo_modelos m ON m.id = a.modelo_id
            WHERE m.marca_id = $1 ORDER BY a.anio DESC`,
      ['modeloId' in filtro ? filtro.modeloId : filtro.marcaId],
    );
    return rows.map((r) => r.anio);
  }
}
