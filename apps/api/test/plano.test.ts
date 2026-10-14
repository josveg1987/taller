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
const sufijo = Math.random().toString(36).slice(2, 7).toLowerCase();
const pool = new Pool({ connectionString: url, max: 2 });
const talleres: string[] = [];
let adminId: string;

let app: INestApplication;
let base: string;
let cookieAdmin: string;
let a: { tallerId: string; cookie: string };
let b: { tallerId: string; cookie: string };

async function llamar(metodo: string, ruta: string, cookie?: string, cuerpo?: unknown) {
  const res = await fetch(base + ruta, {
    method: metodo,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await res.text();
  return { status: res.status, json: texto ? JSON.parse(texto) : null };
}

async function entrar(email: string): Promise<string> {
  const res = await fetch(base + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: CLAVE }) });
  expect(res.status).toBe(200);
  return res.headers.getSetCookie().find((c) => c.startsWith(`${COOKIE_SESION}=`))!.split(';')[0];
}

/** Crea el taller como lo hace el administrador de la APP (asi recibe la plantilla de piezas y servicios). */
async function crearTaller(nombre: string) {
  const t = await llamar('POST', '/admin/talleres', cookieAdmin, { nombre: `${nombre} (test ${sufijo})`, maxUsuarios: 2 });
  expect(t.status).toBe(201);
  talleres.push(t.json.id);
  const email = `${nombre.toLowerCase()}-${sufijo}@test.local`;
  expect((await llamar('POST', `/admin/talleres/${t.json.id}/usuarios`, cookieAdmin, { nombre: `Dueno ${nombre}`, email, password: CLAVE })).status).toBe(201);
  return { tallerId: t.json.id as string, cookie: await entrar(email) };
}

beforeAll(async () => {
  process.env.DATABASE_URL = url;
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../src/app.module');
  app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;

  const emailAdmin = `root-plano-${sufijo}@test.local`;
  const r = await pool.query("INSERT INTO administradores_app (nombre, email, password_hash) VALUES ('Root', $1, $2) RETURNING id", [emailAdmin, await hashPassword(CLAVE)]);
  adminId = r.rows[0].id;
  cookieAdmin = await entrar(emailAdmin);
  a = await crearTaller('Alfa');
  b = await crearTaller('Beta');
});

afterAll(async () => {
  await pool.query('DELETE FROM sesiones WHERE usuario_id IN (SELECT id FROM usuarios WHERE taller_id = ANY($1)) OR admin_id = $2', [talleres, adminId]);
  await pool.query('DELETE FROM talleres WHERE id = ANY($1)', [talleres]);
  await pool.query('DELETE FROM administradores_app WHERE id = $1', [adminId]);
  await pool.end();
  await app.close();
});

type Pieza = { id: string; nombre: string; usaPosicion: boolean; zona: string | null; orden: number };
const piezas = async (t: { cookie: string }) => (await llamar('GET', '/piezas?todas=1', t.cookie)).json as Pieza[];

describe('zonas del plano del auto', () => {
  it('un taller nuevo recibe las piezas con su zona y en el orden del esquema (1 a 17)', async () => {
    const ps = await piezas(a);
    expect(ps.map((p) => p.zona)).toEqual([
      'parachoques_delantero', 'capot', 'tapabarro_delantero', 'puerta_delantera', 'puerta_trasera', 'costado_trasero',
      'zocalo', 'espejo', 'techo', 'maleta', 'parachoques_trasero', null, null,
    ]);
    expect(ps.find((p) => p.zona === 'maleta')!.nombre).toBe('Maleta / portalón');
    expect(ps.filter((p) => p.zona === null).map((p) => p.nombre)).toEqual(['Alerón', 'Tolva']);
  });

  it('una zona la usa una sola pieza del taller (409), pero cada taller tiene las suyas', async () => {
    const ps = await piezas(a);
    const aleron = ps.find((p) => p.nombre === 'Alerón')!;
    const r = await llamar('PATCH', `/piezas/${aleron.id}`, a.cookie, { zona: 'capot' });
    expect(r.status).toBe(409);
    expect(r.json.message).toMatch(/zona/);
    // Beta tiene su propio capot: no choca con el de Alfa.
    expect((await piezas(b)).some((p) => p.zona === 'capot')).toBe(true);
  });

  it('la zona por lado exige una pieza por lado, y al reves (400)', async () => {
    const ps = await piezas(a);
    const aleron = ps.find((p) => p.nombre === 'Alerón')!; // una sola pieza
    expect((await llamar('PATCH', `/piezas/${aleron.id}`, a.cookie, { zona: 'espejo' })).status).toBe(400);
    const puerta = ps.find((p) => p.zona === 'puerta_delantera')!;
    expect((await llamar('PATCH', `/piezas/${puerta.id}`, a.cookie, { usaPosicion: false })).status).toBe(400);
    expect((await llamar('POST', '/piezas', a.cookie, { nombre: 'Pieza rara', usaPosicion: false, zona: 'zocalo' })).status).toBe(400);
    expect((await llamar('POST', '/piezas', a.cookie, { nombre: 'Zona inventada', zona: 'rueda' })).status).toBe(400);
  });

  it('se puede mover una zona: se quita de una pieza y se pone en otra', async () => {
    const ps = await piezas(a);
    const maleta = ps.find((p) => p.zona === 'maleta')!;
    const aleron = ps.find((p) => p.nombre === 'Alerón')!;
    expect((await llamar('PATCH', `/piezas/${maleta.id}`, a.cookie, { zona: null })).json.zona).toBeNull();
    expect((await llamar('PATCH', `/piezas/${aleron.id}`, a.cookie, { zona: 'maleta' })).json.zona).toBe('maleta');
    // Devolverla para no afectar los demas tests.
    await llamar('PATCH', `/piezas/${aleron.id}`, a.cookie, { zona: null });
    await llamar('PATCH', `/piezas/${maleta.id}`, a.cookie, { zona: 'maleta' });
  });

  it('"agregar las estandar" no repite una zona que el taller ya puso en otra pieza', async () => {
    const ps = await piezas(b);
    const techo = ps.find((p) => p.zona === 'techo')!;
    expect((await llamar('PATCH', `/piezas/${techo.id}`, b.cookie, { nombre: 'Techo y parante' })).status).toBe(200);
    const r = await llamar('POST', '/piezas/estandar', b.cookie);
    expect(r.status).toBe(201);
    const techos = (r.json.piezas as Pieza[]).filter((p) => p.nombre === 'Techo' || p.nombre === 'Techo y parante');
    expect(techos.map((p) => [p.nombre, p.zona])).toEqual(expect.arrayContaining([['Techo y parante', 'techo'], ['Techo', null]]));
  });

  it('el presupuesto guarda la zona de cada linea como foto, y el PDF sale con el auto', async () => {
    const ps = await piezas(a);
    const z = (zona: string) => ps.find((p) => p.zona === zona)!.id;
    const r = await llamar('POST', '/presupuestos', a.cookie, {
      vehiculo: { patente: `PZ${sufijo}`.slice(0, 8) },
      cliente: { nombre: 'Cliente Plano', telefono: '912345678' },
      lineas: [
        { piezaId: z('capot'), posicion: 'no_aplica', operacion: 'reparar' },
        { piezaId: z('espejo'), posicion: 'derecha', operacion: 'reemplazar', repuestoCosto: 20000 },
        { piezaId: null, nombre: 'Pulido', posicion: 'no_aplica', operacion: 'libre', precio: 10000 },
      ],
      descuento: 0,
      observaciones: null,
      plazoDias: null,
    });
    expect(r.status).toBe(201);
    expect(r.json.lineas.map((l: { zona: string | null }) => l.zona)).toEqual(['capot', 'espejo', null]);
    // Si despues la pieza pierde su zona, el presupuesto conserva la suya.
    await llamar('PATCH', `/piezas/${z('capot')}`, a.cookie, { zona: null });
    expect((await llamar('GET', `/presupuestos/${r.json.id}`, a.cookie)).json.lineas[0].zona).toBe('capot');
    await llamar('PATCH', `/piezas/${ps.find((p) => p.nombre === 'Capot')!.id}`, a.cookie, { zona: 'capot' });

    const inicio = Date.now();
    const pdf = await fetch(`${base}/presupuestos/${r.json.id}/pdf`, { headers: { cookie: a.cookie } });
    expect(pdf.status).toBe(200);
    const bytes = Buffer.from(await pdf.arrayBuffer());
    expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
    expect(Date.now() - inicio).toBeLessThan(5000);
  });
});
