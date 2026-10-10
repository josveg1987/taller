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
const emailAdmin = `root-${sufijo}@test.local`;
const talleresCreados: string[] = [];

interface Cuenta {
  tallerId: string;
  cookie: string;
}
interface Pieza {
  id: string;
  nombre: string;
  usaPosicion: boolean;
  tarifaPintura: number | null;
  desabolladoSugerido: number | null;
  activa: boolean;
  orden: number;
}
interface Combo {
  id: string;
  nombre: string;
  activo: boolean;
  piezas: { id: string; nombre: string; usaPosicion: boolean }[];
}

let app: INestApplication;
let base: string;
let a: Cuenta;
let b: Cuenta;
let cookieAdmin: string;

async function llamar(metodo: string, ruta: string, cookie?: string, cuerpo?: unknown) {
  const res = await fetch(base + ruta, {
    method: metodo,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await res.text();
  return { status: res.status, json: texto ? JSON.parse(texto) : null };
}

async function iniciar(email: string): Promise<string> {
  const res = await fetch(base + '/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: CLAVE }),
  });
  expect(res.status).toBe(200);
  return res.headers.getSetCookie().find((c) => c.startsWith(`${COOKIE_SESION}=`))!.split(';')[0];
}

async function crearCuenta(nombre: string): Promise<Cuenta> {
  const t = await pool.query('INSERT INTO talleres (nombre) VALUES ($1) RETURNING id', [`${nombre} (test ${sufijo})`]);
  talleresCreados.push(t.rows[0].id);
  const email = `${nombre.toLowerCase()}-${sufijo}@test.local`;
  await pool.query('INSERT INTO usuarios (taller_id, nombre, email, password_hash) VALUES ($1, $2, $3, $4)', [
    t.rows[0].id,
    `Dueno ${nombre}`,
    email,
    await hashPassword(CLAVE),
  ]);
  return { tallerId: t.rows[0].id, cookie: await iniciar(email) };
}

const piezas = async (c: Cuenta, todas = true) => (await llamar('GET', `/piezas${todas ? '?todas=1' : ''}`, c.cookie)).json as Pieza[];
const combos = async (c: Cuenta) => (await llamar('GET', '/combos', c.cookie)).json as Combo[];

beforeAll(async () => {
  process.env.DATABASE_URL = url;
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../src/app.module');
  app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  a = await crearCuenta('Alfa');
  b = await crearCuenta('Beta');
  await pool.query("INSERT INTO administradores_app (nombre, email, password_hash) VALUES ('Root', $1, $2)", [
    emailAdmin,
    await hashPassword(CLAVE),
  ]);
  cookieAdmin = await iniciar(emailAdmin);
});

afterAll(async () => {
  await pool.query('DELETE FROM talleres WHERE id = ANY($1)', [talleresCreados]);
  await pool.query('DELETE FROM administradores_app WHERE email = $1', [emailAdmin]);
  await pool.end();
  await app?.close();
});

describe('acceso', () => {
  it('exige sesion y, para el administrador de la app, haber entrado a un taller', async () => {
    expect((await llamar('GET', '/piezas')).status).toBe(401);
    expect((await llamar('GET', '/combos')).status).toBe(401);
    await llamar('POST', '/admin/salir-taller', cookieAdmin);
    expect((await llamar('GET', '/piezas', cookieAdmin)).status).toBe(400);
  });
});

describe('plantilla estandar', () => {
  it('un taller sin piezas parte vacio y puede cargar las 13 estandar', async () => {
    expect(await piezas(a)).toEqual([]);
    const r = await llamar('POST', '/piezas/estandar', a.cookie);
    expect(r.status).toBe(201);
    expect(r.json.agregadas).toBe(13);
    const lista = await piezas(a);
    expect(lista).toHaveLength(13);
    expect(lista.map((p) => p.orden)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    const por = Object.fromEntries(lista.map((p) => [p.nombre, p]));
    expect(por['Capot'].usaPosicion).toBe(false);
    expect(por['Puerta delantera'].usaPosicion).toBe(true);
    expect(por['Zócalo'].usaPosicion).toBe(true);
    expect(por['Maleta / portalón'].usaPosicion).toBe(false);
    // La plantilla no inventa valores: cada taller pone su pintura y su desabollado sugerido.
    expect(lista.every((p) => p.activa && p.tarifaPintura === null && p.desabolladoSugerido === null)).toBe(true);
  });

  it('cargarlas de nuevo no duplica ni pisa los cambios del taller', async () => {
    const capot = (await piezas(a)).find((p) => p.nombre === 'Capot')!;
    await llamar('PATCH', `/piezas/${capot.id}`, a.cookie, { tarifaPintura: 95000, activa: false });
    const r = await llamar('POST', '/piezas/estandar', a.cookie);
    expect(r.json.agregadas).toBe(0);
    const despues = (await piezas(a)).find((p) => p.id === capot.id)!;
    expect(despues).toMatchObject({ tarifaPintura: 95000, activa: false });
    expect(await piezas(a)).toHaveLength(13);
  });

  it('agrega solo las que faltan si el taller renombro una', async () => {
    const techo = (await piezas(a)).find((p) => p.nombre === 'Techo')!;
    await llamar('PATCH', `/piezas/${techo.id}`, a.cookie, { nombre: 'Techo corredizo' });
    const r = await llamar('POST', '/piezas/estandar', a.cookie);
    expect(r.json.agregadas).toBe(1); // vuelve a aparecer "Techo", la renombrada se conserva
    const nombres = (await piezas(a)).map((p) => p.nombre);
    expect(nombres).toEqual(expect.arrayContaining(['Techo', 'Techo corredizo']));
  });

  it('trae el combo de ejemplo con sus 5 piezas y no lo repite al volver a cargar', async () => {
    const lista = await combos(a);
    expect(lista).toHaveLength(1);
    expect(lista[0].nombre).toBe('Lateral completo');
    expect(lista[0].piezas.map((p) => p.nombre).sort()).toEqual(
      ['Costado trasero', 'Puerta delantera', 'Puerta trasera', 'Tapabarro delantero', 'Zócalo'].sort(),
    );
    // El taller le quita una pieza: cargar la plantilla otra vez no se la vuelve a poner.
    const sinZocalo = lista[0].piezas.filter((p) => p.nombre !== 'Zócalo').map((p) => p.id);
    await llamar('PATCH', `/combos/${lista[0].id}`, a.cookie, { piezaIds: sinZocalo });
    await llamar('POST', '/piezas/estandar', a.cookie);
    const despues = await combos(a);
    expect(despues).toHaveLength(1);
    expect(despues[0].piezas).toHaveLength(4);
  });

  it('un taller nuevo creado por el administrador de la app ya trae su catalogo', async () => {
    const r = await llamar('POST', '/admin/talleres', cookieAdmin, { nombre: `Con catalogo (test ${sufijo})` });
    expect(r.status).toBe(201);
    talleresCreados.push(r.json.id);
    const { rows } = await pool.query(
      `SELECT (SELECT count(*)::int FROM piezas WHERE taller_id = $1) AS piezas,
              (SELECT count(*)::int FROM combos WHERE taller_id = $1) AS combos,
              (SELECT count(*)::int FROM combo_piezas WHERE taller_id = $1) AS combo_piezas,
              (SELECT montos_desabollado FROM talleres WHERE id = $1) AS montos`,
      [r.json.id],
    );
    expect(rows[0]).toMatchObject({ piezas: 13, combos: 1, combo_piezas: 5, montos: [30000, 60000, 100000] });
  });
});

describe('piezas del taller', () => {
  it('crea una pieza (por lado por defecto) y la agrega al final', async () => {
    const antes = await piezas(b);
    const r = await llamar('POST', '/piezas', b.cookie, { nombre: '  Faro  ' });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({
      nombre: 'Faro',
      usaPosicion: true,
      tarifaPintura: null,
      desabolladoSugerido: null,
      activa: true,
      orden: antes.length + 1,
    });
    const sola = await llamar('POST', '/piezas', b.cookie, {
      nombre: 'Antena',
      usaPosicion: false,
      tarifaPintura: 30000,
      desabolladoSugerido: 20000,
    });
    expect(sola.json).toMatchObject({ usaPosicion: false, tarifaPintura: 30000, desabolladoSugerido: 20000 });
  });

  it('valida los datos', async () => {
    const malo = (cuerpo: unknown) => llamar('POST', '/piezas', b.cookie, cuerpo);
    expect((await malo({})).status).toBe(400);
    expect((await malo({ nombre: '   ' })).status).toBe(400);
    expect((await malo({ nombre: 'x'.repeat(81) })).status).toBe(400);
    expect((await malo({ nombre: 'P1', tarifaPintura: -1 })).status).toBe(400);
    expect((await malo({ nombre: 'P2', tarifaPintura: 100.5 })).status).toBe(400);
    expect((await malo({ nombre: 'P3', tarifaPintura: '80000' })).status).toBe(400);
    expect((await malo({ nombre: 'P4', tarifaPintura: 100_000_001 })).status).toBe(400);
    expect((await malo({ nombre: 'P5', usaPosicion: 'si' })).status).toBe(400);
    expect((await malo({ nombre: 'P6', desabolladoSugerido: -1 })).status).toBe(400);
    expect((await malo({ nombre: 'P7', desabolladoSugerido: 60000.5 })).status).toBe(400);
    expect((await malo({ nombre: 'P8', desabolladoSugerido: '60000' })).status).toBe(400);
    expect((await malo({ nombre: 'P9', desabolladoSugerido: 100_000_001 })).status).toBe(400);
    expect((await malo('texto')).status).toBe(400);
  });

  it('no repite el nombre dentro del taller, pero otro taller puede usarlo', async () => {
    expect((await llamar('POST', '/piezas', b.cookie, { nombre: 'Pieza repetida' })).status).toBe(201);
    const dup = await llamar('POST', '/piezas', b.cookie, { nombre: 'Pieza repetida' });
    expect(dup.status).toBe(409);
    expect(dup.json.message).toMatch(/Ya existe una pieza con ese nombre/);
    expect((await llamar('POST', '/piezas', a.cookie, { nombre: 'Pieza repetida' })).status).toBe(201);
  });

  it('edita nombre, lado, tarifa propia y estado; la tarifa vacia vuelve a la del taller', async () => {
    const p = (await llamar('POST', '/piezas', b.cookie, { nombre: 'Editable' })).json as Pieza;
    const r = await llamar('PATCH', `/piezas/${p.id}`, b.cookie, { nombre: 'Editada', usaPosicion: false, tarifaPintura: 50000, activa: false });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ nombre: 'Editada', usaPosicion: false, tarifaPintura: 50000, activa: false });
    const sin = await llamar('PATCH', `/piezas/${p.id}`, b.cookie, { tarifaPintura: null });
    expect(sin.json.tarifaPintura).toBeNull();
    const vacia = await llamar('PATCH', `/piezas/${p.id}`, b.cookie, { tarifaPintura: 70000 });
    expect(vacia.json.tarifaPintura).toBe(70000);
    expect((await llamar('PATCH', `/piezas/${p.id}`, b.cookie, { tarifaPintura: '' })).json.tarifaPintura).toBeNull();
    expect((await llamar('PATCH', `/piezas/${p.id}`, b.cookie, {})).status).toBe(200); // sin cambios
    expect((await llamar('PATCH', `/piezas/${p.id}`, b.cookie, { nombre: '' })).status).toBe(400);
    expect((await llamar('PATCH', `/piezas/${p.id}`, b.cookie, { nombre: 'Pieza repetida' })).status).toBe(409);
    expect((await llamar('PATCH', '/piezas/00000000-0000-4000-8000-000000000000', b.cookie, { nombre: 'x' })).status).toBe(404);
    expect((await llamar('PATCH', '/piezas/no-es-un-id', b.cookie, { nombre: 'x' })).status).toBe(404);
  });

  it('el desabollado sugerido se pone, se cambia y se borra enviandolo vacio', async () => {
    const p = (await llamar('POST', '/piezas', b.cookie, { nombre: 'Con sugerido' })).json as Pieza;
    expect(p.desabolladoSugerido).toBeNull();
    expect((await llamar('PATCH', `/piezas/${p.id}`, b.cookie, { desabolladoSugerido: 60000 })).json.desabolladoSugerido).toBe(60000);
    expect((await llamar('PATCH', `/piezas/${p.id}`, b.cookie, { desabolladoSugerido: 0 })).json.desabolladoSugerido).toBe(0);
    expect((await llamar('PATCH', `/piezas/${p.id}`, b.cookie, { desabolladoSugerido: 45000, tarifaPintura: 80000 })).json).toMatchObject({
      desabolladoSugerido: 45000,
      tarifaPintura: 80000,
    });
    // Otros cambios no lo tocan.
    expect((await llamar('PATCH', `/piezas/${p.id}`, b.cookie, { nombre: 'Con sugerido 2' })).json.desabolladoSugerido).toBe(45000);
    expect((await llamar('PATCH', `/piezas/${p.id}`, b.cookie, { desabolladoSugerido: '' })).json.desabolladoSugerido).toBeNull();
    expect((await llamar('PATCH', `/piezas/${p.id}`, b.cookie, { desabolladoSugerido: -5 })).status).toBe(400);
    // Es una sugerencia por taller: el otro taller no la ve en sus piezas.
    expect((await piezas(a)).some((x) => x.id === p.id)).toBe(false);
  });

  it('por defecto solo lista las activas; con ?todas=1 tambien las desactivadas', async () => {
    const p = (await llamar('POST', '/piezas', b.cookie, { nombre: 'A desactivar' })).json as Pieza;
    await llamar('PATCH', `/piezas/${p.id}`, b.cookie, { activa: false });
    expect((await piezas(b, false)).map((x) => x.id)).not.toContain(p.id);
    expect((await piezas(b, true)).map((x) => x.id)).toContain(p.id);
  });

  it('sube y baja una pieza en el orden; en los extremos no pasa nada', async () => {
    const x = (await llamar('POST', '/piezas', b.cookie, { nombre: 'Orden uno' })).json as Pieza;
    const y = (await llamar('POST', '/piezas', b.cookie, { nombre: 'Orden dos' })).json as Pieza;
    const posicion = async (id: string) => (await piezas(b)).findIndex((p) => p.id === id);
    const iy = await posicion(y.id);
    expect(iy).toBe((await posicion(x.id)) + 1);

    await llamar('POST', `/piezas/${y.id}/mover`, b.cookie, { direccion: 'arriba' });
    expect(await posicion(y.id)).toBe(iy - 1);
    await llamar('POST', `/piezas/${y.id}/mover`, b.cookie, { direccion: 'abajo' });
    expect(await posicion(y.id)).toBe(iy);

    const lista = await piezas(b);
    const primera = lista[0];
    await llamar('POST', `/piezas/${primera.id}/mover`, b.cookie, { direccion: 'arriba' });
    expect((await piezas(b))[0].id).toBe(primera.id);
    // La numeracion queda limpia (1..n).
    expect((await piezas(b)).map((p) => p.orden)).toEqual(lista.map((_, i) => i + 1));

    expect((await llamar('POST', `/piezas/${y.id}/mover`, b.cookie, { direccion: 'al-lado' })).status).toBe(400);
    expect((await llamar('POST', `/piezas/${y.id}/mover`, b.cookie, {})).status).toBe(400);
    expect((await llamar('POST', '/piezas/00000000-0000-4000-8000-000000000000/mover', b.cookie, { direccion: 'arriba' })).status).toBe(404);
  });
});

describe('combos', () => {
  let p1: Pieza;
  let p2: Pieza;
  let p3: Pieza;

  beforeAll(async () => {
    const nueva = async (n: string) => (await llamar('POST', '/piezas', b.cookie, { nombre: `Combo ${n}` })).json as Pieza;
    [p1, p2, p3] = [await nueva('p1'), await nueva('p2'), await nueva('p3')];
  });

  it('crea un combo con sus piezas, en el orden dado y sin repetir', async () => {
    const r = await llamar('POST', '/combos', b.cookie, { nombre: 'Frontal', piezaIds: [p2.id, p1.id, p2.id] });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ nombre: 'Frontal', activo: true });
    expect(r.json.piezas.map((p: { id: string }) => p.id)).toEqual([p2.id, p1.id]);
    expect((await llamar('POST', '/combos', b.cookie, { nombre: 'Vacio' })).json.piezas).toEqual([]);
  });

  it('valida los datos, y no repite el nombre', async () => {
    expect((await llamar('POST', '/combos', b.cookie, {})).status).toBe(400);
    expect((await llamar('POST', '/combos', b.cookie, { nombre: 'X', piezaIds: 'no' })).status).toBe(400);
    expect((await llamar('POST', '/combos', b.cookie, { nombre: 'X', piezaIds: ['no-es-un-id'] })).status).toBe(400);
    expect((await llamar('POST', '/combos', b.cookie, { nombre: 'X', piezaIds: ['00000000-0000-4000-8000-000000000000'] })).status).toBe(404);
    expect((await llamar('POST', '/combos', b.cookie, { nombre: 'Frontal' })).status).toBe(409);
    // Un combo que falla no deja nada a medias.
    const { rows } = await pool.query("SELECT 1 FROM combos WHERE taller_id = $1 AND nombre = 'X'", [b.tallerId]);
    expect(rows).toHaveLength(0);
  });

  it('edita nombre, estado y piezas; se puede desactivar o eliminar', async () => {
    const c = (await llamar('POST', '/combos', b.cookie, { nombre: 'Editable', piezaIds: [p1.id] })).json as Combo;
    const r = await llamar('PATCH', `/combos/${c.id}`, b.cookie, { nombre: 'Editado', activo: false, piezaIds: [p2.id, p3.id] });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ nombre: 'Editado', activo: false });
    expect(r.json.piezas.map((p: { id: string }) => p.id)).toEqual([p2.id, p3.id]);
    expect((await llamar('PATCH', `/combos/${c.id}`, b.cookie, { piezaIds: [] })).json.piezas).toEqual([]);
    expect((await llamar('PATCH', '/combos/00000000-0000-4000-8000-000000000000', b.cookie, { piezaIds: [] })).status).toBe(404);

    expect((await llamar('DELETE', `/combos/${c.id}`, b.cookie)).status).toBe(204);
    expect((await llamar('DELETE', `/combos/${c.id}`, b.cookie)).status).toBe(404);
    expect((await combos(b)).map((x) => x.id)).not.toContain(c.id);
  });

  it('desactivar una pieza no la saca de sus combos', async () => {
    const c = (await llamar('POST', '/combos', b.cookie, { nombre: 'Con inactiva', piezaIds: [p3.id] })).json as Combo;
    await llamar('PATCH', `/piezas/${p3.id}`, b.cookie, { activa: false });
    const despues = (await combos(b)).find((x) => x.id === c.id)!;
    expect(despues.piezas.map((p) => p.id)).toEqual([p3.id]);
  });
});

describe('aislamiento entre talleres', () => {
  it('cada taller ve solo sus piezas y combos', async () => {
    const idsA = (await piezas(a)).map((p) => p.id);
    const idsB = (await piezas(b)).map((p) => p.id);
    expect(idsA.some((id) => idsB.includes(id))).toBe(false);
    const combosA = (await combos(a)).map((c) => c.id);
    const combosB = (await combos(b)).map((c) => c.id);
    expect(combosA.some((id) => combosB.includes(id))).toBe(false);
  });

  it('no puede ver, editar, mover ni usar piezas y combos de otro', async () => {
    const piezaB = (await piezas(b))[0];
    const comboB = (await combos(b))[0];
    expect((await llamar('PATCH', `/piezas/${piezaB.id}`, a.cookie, { nombre: 'Hackeada' })).status).toBe(404);
    expect((await llamar('POST', `/piezas/${piezaB.id}/mover`, a.cookie, { direccion: 'abajo' })).status).toBe(404);
    expect((await llamar('PATCH', `/combos/${comboB.id}`, a.cookie, { nombre: 'Hackeado' })).status).toBe(404);
    expect((await llamar('DELETE', `/combos/${comboB.id}`, a.cookie)).status).toBe(404);
    // Un combo propio no puede incluir una pieza ajena.
    expect((await llamar('POST', '/combos', a.cookie, { nombre: 'Intruso', piezaIds: [piezaB.id] })).status).toBe(404);
    const { rows } = await pool.query('SELECT nombre FROM piezas WHERE id = $1', [piezaB.id]);
    expect(rows[0].nombre).not.toBe('Hackeada');
  });
});

describe('tarifa de pintura y montos rapidos del taller', () => {
  it('un taller parte con los montos rapidos de ejemplo y sin tarifa', async () => {
    const r = await llamar('GET', '/taller', b.cookie);
    expect(r.json).toMatchObject({ tarifaPintura: 0, montosDesabollado: [30000, 60000, 100000] });
  });

  it('guarda la tarifa por defecto y los montos (ordenados y sin repetir)', async () => {
    const r = await llamar('PATCH', '/taller', b.cookie, { tarifaPintura: 80000, montosDesabollado: [100000, 30000, 30000, 50000] });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ tarifaPintura: 80000, montosDesabollado: [30000, 50000, 100000] });
    expect((await llamar('GET', '/taller', b.cookie)).json.montosDesabollado).toEqual([30000, 50000, 100000]);
    expect((await llamar('PATCH', '/taller', b.cookie, { montosDesabollado: [] })).json.montosDesabollado).toEqual([]);
  });

  it('valida la tarifa y los montos', async () => {
    const malo = (cuerpo: unknown) => llamar('PATCH', '/taller', b.cookie, cuerpo);
    expect((await malo({ tarifaPintura: -5 })).status).toBe(400);
    expect((await malo({ tarifaPintura: 80000.5 })).status).toBe(400);
    expect((await malo({ tarifaPintura: '80000' })).status).toBe(400);
    expect((await malo({ montosDesabollado: 'muchos' })).status).toBe(400);
    expect((await malo({ montosDesabollado: [0] })).status).toBe(400);
    expect((await malo({ montosDesabollado: [1.5] })).status).toBe(400);
    expect((await malo({ montosDesabollado: ['30000'] })).status).toBe(400);
    expect((await malo({ montosDesabollado: Array.from({ length: 13 }, (_, i) => (i + 1) * 1000) })).status).toBe(400);
  });
});

describe('permisos de la base', () => {
  it('la app no puede modificar la plantilla estandar, solo leerla', async () => {
    const c = await pool.connect();
    try {
      for (const sql of [
        "INSERT INTO catalogo_piezas_base (nombre, usa_posicion, orden) VALUES ('X', true, 99)",
        'DELETE FROM catalogo_piezas_base',
        "UPDATE catalogo_combos_base SET nombre = 'Hackeado'",
      ]) {
        await c.query('BEGIN');
        await c.query('SET LOCAL ROLE taller_app');
        await expect(c.query(sql)).rejects.toThrow(/permission denied/i);
        await c.query('ROLLBACK');
      }
      await c.query('BEGIN');
      await c.query('SET LOCAL ROLE taller_app');
      expect((await c.query('SELECT count(*)::int AS n FROM catalogo_piezas_base')).rows[0].n).toBe(13);
      await c.query('ROLLBACK');
    } finally {
      c.release();
    }
  });
});
