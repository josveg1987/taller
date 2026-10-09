import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

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

  async onModuleDestroy() {
    await this.pool?.end();
  }
}
