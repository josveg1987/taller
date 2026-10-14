import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { traducirErrorBD } from '../validacion';

export type TipoCuenta = 'corriente' | 'vista' | 'ahorro';
export const TIPOS_CUENTA = ['corriente', 'vista', 'ahorro'] as const;

/** Maximo de cuentas por taller (caben bien en el PDF y en la pantalla). */
export const MAX_CUENTAS = 10;

export interface CuentaBancaria {
  id: string;
  titular: string;
  /** Normalizado: 12345678-5. */
  rut: string;
  banco: string;
  tipoCuenta: TipoCuenta;
  numero: string;
  email: string | null;
  activa: boolean;
  orden: number;
}

interface FilaCuenta {
  id: string;
  titular: string;
  rut: string;
  banco: string;
  tipo_cuenta: TipoCuenta;
  numero: string;
  email: string | null;
  activa: boolean;
  orden: number;
}

const aCuenta = (f: FilaCuenta): CuentaBancaria => ({
  id: f.id,
  titular: f.titular,
  rut: f.rut,
  banco: f.banco,
  tipoCuenta: f.tipo_cuenta,
  numero: f.numero,
  email: f.email,
  activa: f.activa,
  orden: f.orden,
});

const COLUMNAS = 'id, titular, rut, banco, tipo_cuenta, numero, email, activa, orden';

export interface DatosCuenta {
  titular: string;
  rut: string;
  banco: string;
  tipoCuenta: TipoCuenta;
  numero: string;
  email: string | null;
}

/** Cuentas para transferir del taller. Las activas salen en el PDF de cada presupuesto. */
@Injectable()
export class CuentasService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async listar(tallerId: string, incluirInactivas: boolean): Promise<CuentaBancaria[]> {
    const { rows } = await this.db.conTaller(tallerId, (c) =>
      c.query<FilaCuenta>(`SELECT ${COLUMNAS} FROM cuentas_bancarias ${incluirInactivas ? '' : 'WHERE activa'} ORDER BY orden, creado_en`),
    );
    return rows.map(aCuenta);
  }

  async crear(tallerId: string, d: DatosCuenta): Promise<CuentaBancaria> {
    try {
      return await this.db.conTaller(tallerId, async (c) => {
        const { rows: n } = await c.query<{ n: number; maximo: number }>('SELECT count(*)::int AS n, COALESCE(max(orden), 0) AS maximo FROM cuentas_bancarias');
        if (n[0].n >= MAX_CUENTAS) throw new BadRequestException(`Puedes tener hasta ${MAX_CUENTAS} cuentas`);
        const { rows } = await c.query<FilaCuenta>(
          `INSERT INTO cuentas_bancarias (taller_id, titular, rut, banco, tipo_cuenta, numero, email, orden)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${COLUMNAS}`,
          [tallerId, d.titular, d.rut, d.banco, d.tipoCuenta, d.numero, d.email, n[0].maximo + 1],
        );
        return aCuenta(rows[0]);
      });
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      return traducirErrorBD(e);
    }
  }

  async actualizar(tallerId: string, id: string, cambios: Partial<DatosCuenta> & { activa?: boolean }): Promise<CuentaBancaria> {
    const sets: string[] = [];
    const valores: unknown[] = [];
    const agregar = (columna: string, valor: unknown) => {
      valores.push(valor);
      sets.push(`${columna} = $${valores.length}`);
    };
    if (cambios.titular !== undefined) agregar('titular', cambios.titular);
    if (cambios.rut !== undefined) agregar('rut', cambios.rut);
    if (cambios.banco !== undefined) agregar('banco', cambios.banco);
    if (cambios.tipoCuenta !== undefined) agregar('tipo_cuenta', cambios.tipoCuenta);
    if (cambios.numero !== undefined) agregar('numero', cambios.numero);
    if (cambios.email !== undefined) agregar('email', cambios.email);
    if (cambios.activa !== undefined) agregar('activa', cambios.activa);
    try {
      const { rows } = await this.db.conTaller(tallerId, (c) =>
        sets.length
          ? c.query<FilaCuenta>(`UPDATE cuentas_bancarias SET ${sets.join(', ')} WHERE id = $${valores.length + 1} RETURNING ${COLUMNAS}`, [...valores, id])
          : c.query<FilaCuenta>(`SELECT ${COLUMNAS} FROM cuentas_bancarias WHERE id = $1`, [id]),
      );
      if (!rows[0]) throw new NotFoundException('La cuenta no existe');
      return aCuenta(rows[0]);
    } catch (e) {
      if (e instanceof NotFoundException) throw e;
      return traducirErrorBD(e);
    }
  }

  async eliminar(tallerId: string, id: string): Promise<void> {
    const r = await this.db.conTaller(tallerId, (c) => c.query('DELETE FROM cuentas_bancarias WHERE id = $1', [id]));
    if (!r.rowCount) throw new NotFoundException('La cuenta no existe');
  }

  /** Sube o baja una cuenta una posicion (la primera es la principal). */
  async mover(tallerId: string, id: string, direccion: 'arriba' | 'abajo'): Promise<CuentaBancaria[]> {
    await this.db.conTaller(tallerId, async (c) => {
      const { rows } = await c.query<{ id: string }>('SELECT id FROM cuentas_bancarias ORDER BY orden, creado_en');
      const ids = rows.map((r) => r.id);
      const i = ids.indexOf(id);
      if (i < 0) throw new NotFoundException('La cuenta no existe');
      const j = direccion === 'arriba' ? i - 1 : i + 1;
      if (j >= 0 && j < ids.length) [ids[i], ids[j]] = [ids[j], ids[i]];
      await c.query(
        `UPDATE cuentas_bancarias x SET orden = v.n
           FROM (SELECT unnest($1::uuid[]) AS id, generate_series(1, $2::int) AS n) v
          WHERE x.id = v.id`,
        [ids, ids.length],
      );
    });
    return this.listar(tallerId, true);
  }
}
