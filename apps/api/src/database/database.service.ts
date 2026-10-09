import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient } from 'pg';

export interface DbStatus {
  configured: boolean;
  ok: boolean;
  ms?: number;
  error?: string;
}

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private pool?: Pool;

  constructor(config: ConfigService) {
    const url = config.get<string>('DATABASE_URL');
    if (url) {
      // Neon exige SSL; en local no.
      const ssl = /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false };
      this.pool = new Pool({ connectionString: url, ssl, max: 5, connectionTimeoutMillis: 5000 });
    }
  }

  async ping(): Promise<DbStatus> {
    if (!this.pool) return { configured: false, ok: false };
    const t0 = Date.now();
    try {
      await this.pool.query('select 1');
      return { configured: true, ok: true, ms: Date.now() - t0 };
    } catch (e) {
      return { configured: true, ok: false, error: (e as Error).message };
    }
  }

  /**
   * Ejecuta `fn` en una transaccion que solo ve los datos de `tallerId` (RLS). Toda consulta de
   * negocio debe pasar por aqui: asume el rol `taller_app` y fija el taller solo para esta
   * transaccion (SET LOCAL / set_config local), asi tambien es seguro con un pooler de conexiones.
   */
  async conTaller<T>(tallerId: string, fn: (db: PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool) throw new Error('DATABASE_URL no esta configurada');
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      await db.query('SET LOCAL ROLE taller_app');
      await db.query("SELECT set_config('app.taller_id', $1, true)", [tallerId]);
      const resultado = await fn(db);
      await db.query('COMMIT');
      return resultado;
    } catch (e) {
      await db.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      db.release();
    }
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }
}
