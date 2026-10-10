import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import type { INestApplication } from '@nestjs/common';
import { hashPassword } from '../src/auth/password';
import { COOKIE_SESION } from '../src/auth/auth.guard';

// Escribe en la base: solo contra una base local.
const url = process.env.TEST_DATABASE_URL ?? 'postgresql://taller:taller@localhost:5432/taller';
if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error('Los tests de BD solo pueden correr contra una base local');

const CLAVE = 'clave-segura-1';
const sufijo = Math.random().toString(36).slice(2, 8);
const pool = new Pool({ connectionString: url, max: 2 });

let app: INestApplication;
let base: string;
let tallerId: string;
let cookie: string;

interface Item {
  id: number;
  nombre: string;
}

/** `sinSesion` hace la llamada sin cookie. */
const get = async (ruta: string, sinSesion = false) => {
  const res = await fetch(base + ruta, { headers: sinSesion ? {} : { cookie } });
  const texto = await res.text();
  return { status: res.status, json: texto ? JSON.parse(texto) : null };
};
const marcas = async (q = '') => (await get(`/catalogo/marcas?q=${encodeURIComponent(q)}`)).json as Item[];
const marcaId = async (nombre: string) => (await marcas(nombre)).find((m) => m.nombre === nombre)!.id;
const modelos = async (idMarca: number, q = '', anio = '') =>
  (await get(`/catalogo/modelos?marcaId=${idMarca}&q=${encodeURIComponent(q)}&anio=${anio}`)).json as Item[];

beforeAll(async () => {
  process.env.DATABASE_URL = url;
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../src/app.module');
  app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;

  tallerId = (await pool.query('INSERT INTO talleres (nombre) VALUES ($1) RETURNING id', [`Catalogo (test ${sufijo})`])).rows[0].id;
  const email = `catalogo-${sufijo}@test.local`;
  await pool.query('INSERT INTO usuarios (taller_id, nombre, email, password_hash) VALUES ($1, $2, $3, $4)', [
    tallerId,
    'Dueno',
    email,
    await hashPassword(CLAVE),
  ]);
  const res = await fetch(base + '/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: CLAVE }),
  });
  cookie = res.headers.getSetCookie().find((c) => c.startsWith(`${COOKIE_SESION}=`))!.split(';')[0];
});

afterAll(async () => {
  await pool.query('DELETE FROM talleres WHERE id = $1', [tallerId]);
  await pool.end();
  await app?.close();
});

describe('catalogo cargado por las migraciones', () => {
  it('trae el listado del SII: marcas, modelos y años de verdad', async () => {
    const { rows } = await pool.query(`SELECT
      (SELECT count(*)::int FROM catalogo_marcas) AS marcas,
      (SELECT count(*)::int FROM catalogo_modelos) AS modelos,
      (SELECT count(*)::int FROM catalogo_modelo_anios) AS combinaciones,
      (SELECT count(*)::int FROM catalogo_cargas) AS cargas`);
    expect(rows[0].marcas).toBeGreaterThan(140);
    expect(rows[0].modelos).toBeGreaterThan(2000);
    expect(rows[0].combinaciones).toBeGreaterThan(17000);
    expect(rows[0].cargas).toBeGreaterThanOrEqual(1);
  });

  it('incluye las marcas que se ven en Chile (chinas incluidas) y no las motos', async () => {
    const todas = (await marcas()).map((m) => m.nombre);
    expect(todas.length).toBe(50); // el listado se corta en 50 por pagina
    for (const nombre of ['Toyota', 'Kia', 'Chery', 'JAC', 'MG', 'Great Wall', 'Haval', 'Mercedes-Benz', 'BMW', 'Chevrolet']) {
      expect((await marcas(nombre)).map((m) => m.nombre)).toContain(nombre);
    }
    for (const moto of ['Yamaha', 'Kawasaki', 'KTM', 'Harley', 'Ducati']) {
      expect((await marcas(moto)).map((m) => m.nombre)).not.toContain(moto);
    }
    expect((await marcas('Kia')).map((m) => m.nombre)).not.toContain('Kia Motors');
  });
});

describe('/catalogo/marcas', () => {
  it('exige sesion', async () => {
    expect((await get('/catalogo/marcas', true)).status).toBe(401);
    expect((await get('/catalogo/modelos?marcaId=1', true)).status).toBe(401);
    expect((await get('/catalogo/anios?marcaId=1', true)).status).toBe(401);
  });

  it('sin texto devuelve las marcas en orden alfabetico', async () => {
    const nombres = (await marcas()).map((m) => m.nombre);
    expect(nombres.slice(0, 3)).toEqual(['Acadian', 'Acura', 'Alfa Romeo']);
  });

  it('busca por parte del nombre, sin distinguir mayusculas ni tildes, y ordena primero las que empiezan igual', async () => {
    const r = (await marcas('toy')).map((m) => m.nombre);
    expect(r[0]).toBe('Toyota');
    expect((await marcas('MERCEDES')).map((m) => m.nombre)).toContain('Mercedes-Benz');
    expect((await marcas('citroën')).map((m) => m.nombre)).toContain('Citroen'); // con tilde encuentra sin tilde
    const contiene = (await marcas('rover')).map((m) => m.nombre);
    expect(contiene).toEqual(expect.arrayContaining(['Land Rover', 'Rover']));
    expect(contiene[0]).toBe('Rover'); // empieza igual: va primero
  });

  it('% y _ se buscan como texto, no como comodin', async () => {
    expect(await marcas('%')).toEqual([]);
    expect(await marcas('_')).toEqual([]);
  });
});

describe('/catalogo/modelos y /catalogo/anios', () => {
  it('lista los modelos de una marca y filtra por texto', async () => {
    const toyota = await marcaId('Toyota');
    const todos = (await modelos(toyota)).map((m) => m.nombre);
    expect(todos).toEqual(expect.arrayContaining(['Yaris', 'Hilux', 'Corolla', 'RAV4']));
    expect((await modelos(toyota, 'yar')).map((m) => m.nombre)).toContain('Yaris');
    expect((await modelos(toyota, 'zzzz'))).toEqual([]);
    const chevrolet = await marcaId('Chevrolet');
    expect((await modelos(chevrolet)).map((m) => m.nombre)).toContain('Spark');
    expect((await modelos(chevrolet)).map((m) => m.nombre)).not.toContain('Yaris');
  });

  it('con un año, solo los modelos que existieron ese año (marca > año > modelo)', async () => {
    const toyota = await marcaId('Toyota');
    expect((await modelos(toyota, '', '2019')).map((m) => m.nombre)).toContain('Yaris');
    expect((await modelos(toyota, '', '1962')).map((m) => m.nombre)).not.toContain('Yaris');
    expect((await modelos(toyota, 'yar', '1962'))).toEqual([]);
  });

  it('entrega los años de un modelo, del mas nuevo al mas antiguo (marca > modelo > año)', async () => {
    const toyota = await marcaId('Toyota');
    const yaris = (await modelos(toyota, 'Yaris')).find((m) => m.nombre === 'Yaris')!;
    const anios = (await get(`/catalogo/anios?modeloId=${yaris.id}`)).json as number[];
    expect(anios).toContain(2019);
    expect(anios).toEqual([...anios].sort((a, b) => b - a));
    expect(Math.min(...anios)).toBeLessThan(2005);
  });

  it('entrega los años de toda una marca, sin repetir', async () => {
    const kia = await marcaId('Kia');
    const anios = (await get(`/catalogo/anios?marcaId=${kia}`)).json as number[];
    expect(anios.length).toBeGreaterThan(10);
    expect(new Set(anios).size).toBe(anios.length);
    expect(anios).toContain(2020);
  });

  it('valida los parametros', async () => {
    expect((await get('/catalogo/modelos')).status).toBe(400);
    expect((await get('/catalogo/modelos?marcaId=abc')).status).toBe(400);
    expect((await get('/catalogo/modelos?marcaId=-1')).status).toBe(400);
    expect((await get('/catalogo/modelos?marcaId=1&anio=1800')).status).toBe(400);
    expect((await get('/catalogo/modelos?marcaId=1&anio=2020.5')).status).toBe(400);
    expect((await get('/catalogo/anios')).status).toBe(400);
    expect((await get('/catalogo/anios?modeloId=x')).status).toBe(400);
  });

  it('una marca o modelo que no existe devuelve una lista vacia, no un error', async () => {
    expect((await get('/catalogo/modelos?marcaId=999999')).json).toEqual([]);
    expect((await get('/catalogo/anios?modeloId=999999')).json).toEqual([]);
    expect((await get('/catalogo/anios?marcaId=999999')).json).toEqual([]);
  });
});

describe('permisos', () => {
  it('la app solo puede leer el catalogo, no modificarlo', async () => {
    const c = await pool.connect();
    try {
      for (const sql of [
        "INSERT INTO catalogo_marcas (nombre) VALUES ('Intrusa')",
        "UPDATE catalogo_marcas SET nombre = 'Hackeada'",
        'DELETE FROM catalogo_modelos',
        'DELETE FROM catalogo_modelo_anios',
      ]) {
        await c.query('BEGIN');
        await c.query('SET LOCAL ROLE taller_app');
        await expect(c.query(sql)).rejects.toThrow(/permission denied/i);
        await c.query('ROLLBACK');
      }
      await c.query('BEGIN');
      await c.query('SET LOCAL ROLE taller_app');
      const r = await c.query('SELECT count(*)::int AS n FROM catalogo_marcas');
      expect(r.rows[0].n).toBeGreaterThan(100);
      await c.query('ROLLBACK');
    } finally {
      c.release();
    }
  });
});
