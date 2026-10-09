import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import type { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../src/database/database.service';

// Estos tests escriben en la base. Solo corren contra una base local.
const url = process.env.TEST_DATABASE_URL ?? 'postgresql://taller:taller@localhost:5432/taller';
if (!/localhost|127\.0\.0\.1/.test(url)) {
  throw new Error('Los tests de BD solo pueden correr contra una base local');
}

// Conexion del dueno (sin RLS): prepara y limpia datos. La app real usa db.conTaller().
const admin = new Pool({ connectionString: url, max: 2 });
const db = new DatabaseService({ get: () => url } as unknown as ConfigService);

interface Taller {
  id: string;
  clienteId: string;
  vehiculoId: string;
  usuarioId: string;
}

async function crearTaller(nombre: string, patente: string): Promise<Taller> {
  const { rows: t } = await admin.query(
    'INSERT INTO talleres (nombre) VALUES ($1) RETURNING id',
    [`${nombre} (test)`],
  );
  const id: string = t[0].id;
  const { rows: u } = await admin.query(
    `INSERT INTO usuarios (taller_id, nombre, email, password_hash)
     VALUES ($1, 'Dueno', $2, 'hash') RETURNING id`,
    [id, `${id}@test.local`],
  );
  const { rows: c } = await admin.query(
    `INSERT INTO clientes (taller_id, nombre, telefono) VALUES ($1, 'Cliente ' || $2::text, '+56911111111') RETURNING id`,
    [id, nombre],
  );
  const { rows: v } = await admin.query(
    'INSERT INTO vehiculos (taller_id, cliente_id, patente) VALUES ($1, $2, $3) RETURNING id',
    [id, c[0].id, patente],
  );
  return { id, clienteId: c[0].id, vehiculoId: v[0].id, usuarioId: u[0].id };
}

let a: Taller;
let b: Taller;

beforeAll(async () => {
  a = await crearTaller('Taller A', 'AAAA11');
  b = await crearTaller('Taller B', 'BBBB22');
});

afterAll(async () => {
  // El borrado en cascada limpia todo lo del taller.
  await admin.query('DELETE FROM talleres WHERE id = ANY($1)', [[a?.id, b?.id].filter(Boolean)]);
  await admin.end();
  await db.onModuleDestroy();
});

describe('aislamiento entre talleres (RLS)', () => {
  it('cada taller ve solo sus clientes y vehiculos', async () => {
    const clientes = await db.conTaller(a.id, (c) => c.query('SELECT id, taller_id FROM clientes'));
    expect(clientes.rows).toHaveLength(1);
    expect(clientes.rows[0].taller_id).toBe(a.id);

    const vehiculos = await db.conTaller(b.id, (c) => c.query('SELECT patente FROM vehiculos'));
    expect(vehiculos.rows.map((r) => r.patente)).toEqual(['BBBB22']);
  });

  it('un taller no ve a los usuarios de otro', async () => {
    const r = await db.conTaller(a.id, (c) => c.query('SELECT id FROM usuarios'));
    expect(r.rows.map((x) => x.id)).toEqual([a.usuarioId]);
  });

  it('un taller solo ve su propia fila en talleres', async () => {
    const r = await db.conTaller(a.id, (c) => c.query('SELECT id FROM talleres'));
    expect(r.rows.map((x) => x.id)).toEqual([a.id]);
  });

  it('sin taller fijado no se ve ninguna fila', async () => {
    const c = await admin.connect();
    try {
      await c.query('BEGIN');
      await c.query('SET LOCAL ROLE taller_app');
      const r = await c.query('SELECT count(*)::int AS n FROM clientes');
      expect(r.rows[0].n).toBe(0);
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  });

  it('no puede insertar filas a nombre de otro taller', async () => {
    await expect(
      db.conTaller(a.id, (c) =>
        c.query("INSERT INTO clientes (taller_id, nombre, telefono) VALUES ($1, 'Intruso', '1')", [b.id]),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('no puede modificar ni borrar filas de otro taller', async () => {
    const upd = await db.conTaller(a.id, (c) =>
      c.query("UPDATE clientes SET nombre = 'Hackeado' WHERE id = $1", [b.clienteId]),
    );
    expect(upd.rowCount).toBe(0);
    const del = await db.conTaller(a.id, (c) => c.query('DELETE FROM clientes WHERE id = $1', [b.clienteId]));
    expect(del.rowCount).toBe(0);

    const { rows } = await admin.query('SELECT nombre FROM clientes WHERE id = $1', [b.clienteId]);
    expect(rows[0].nombre).toBe('Cliente Taller B');
  });

  it('un presupuesto no puede apuntar a un cliente de otro taller (llave foranea)', async () => {
    await expect(
      db.conTaller(a.id, (c) =>
        c.query(
          `INSERT INTO presupuestos (taller_id, numero, cliente_id, vehiculo_id, valido_hasta)
           VALUES ($1, 1, $2, $3, current_date + 15)`,
          [a.id, b.clienteId, a.vehiculoId],
        ),
      ),
    ).rejects.toThrow(/foreign key/i);
  });

  it('la app no puede crear ni borrar talleres', async () => {
    await expect(
      db.conTaller(a.id, (c) => c.query("INSERT INTO talleres (nombre) VALUES ('Otro')")),
    ).rejects.toThrow(/permission denied/i);
    await expect(db.conTaller(a.id, (c) => c.query('DELETE FROM talleres'))).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('una operacion que falla no deja datos a medias', async () => {
    await expect(
      db.conTaller(a.id, async (c) => {
        await c.query("INSERT INTO clientes (taller_id, nombre, telefono) VALUES ($1, 'Fantasma', '1')", [a.id]);
        throw new Error('falla a mitad de camino');
      }),
    ).rejects.toThrow('falla a mitad de camino');
    const { rows } = await admin.query("SELECT 1 FROM clientes WHERE nombre = 'Fantasma'");
    expect(rows).toHaveLength(0);
  });
});

describe('presupuestos', () => {
  it('la numeracion es correlativa e independiente por taller', async () => {
    const numero = (t: Taller) =>
      db.conTaller(t.id, async (c) => (await c.query('SELECT siguiente_numero_presupuesto() AS n')).rows[0].n);
    expect(await numero(a)).toBe(1);
    expect(await numero(a)).toBe(2);
    expect(await numero(b)).toBe(1);
  });

  it('un numero consumido en una transaccion que falla no se pierde', async () => {
    const antes = (await admin.query('SELECT siguiente_numero FROM talleres WHERE id = $1', [b.id])).rows[0]
      .siguiente_numero;
    await expect(
      db.conTaller(b.id, async (c) => {
        await c.query('SELECT siguiente_numero_presupuesto()');
        throw new Error('falla');
      }),
    ).rejects.toThrow('falla');
    const despues = (await admin.query('SELECT siguiente_numero FROM talleres WHERE id = $1', [b.id])).rows[0]
      .siguiente_numero;
    expect(despues).toBe(antes);
  });

  it('el historial de estados solo se agrega, no se modifica', async () => {
    await db.conTaller(a.id, async (c) => {
      const p = await c.query(
        `INSERT INTO presupuestos (taller_id, numero, cliente_id, vehiculo_id, valido_hasta)
         VALUES ($1, 100, $2, $3, current_date + 15) RETURNING id`,
        [a.id, a.clienteId, a.vehiculoId],
      );
      await c.query(
        "INSERT INTO historial_estados (taller_id, presupuesto_id, estado, usuario_id) VALUES ($1, $2, 'borrador', $3)",
        [a.id, p.rows[0].id, a.usuarioId],
      );
    });
    await expect(db.conTaller(a.id, (c) => c.query("UPDATE historial_estados SET estado = 'aceptado'"))).rejects.toThrow(
      /permission denied/i,
    );
    await expect(db.conTaller(a.id, (c) => c.query('DELETE FROM historial_estados'))).rejects.toThrow(
      /permission denied/i,
    );
  });
});

describe('red de seguridad', () => {
  it('toda tabla con taller_id (y talleres) tiene RLS activado y una politica', async () => {
    const { rows } = await admin.query(`
      SELECT c.relname AS tabla, c.relrowsecurity AS rls,
             EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename = c.relname AND p.schemaname = 'public') AS politica
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      WHERE c.relkind = 'r'
        AND (c.relname = 'talleres'
             OR EXISTS (SELECT 1 FROM information_schema.columns k
                        WHERE k.table_schema = 'public' AND k.table_name = c.relname AND k.column_name = 'taller_id'))
    `);
    expect(rows.length).toBeGreaterThanOrEqual(8);
    const sinProteccion = rows.filter((r) => !r.rls || !r.politica).map((r) => r.tabla);
    expect(sinProteccion).toEqual([]);
  });
});
