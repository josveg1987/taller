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

interface Cuenta {
  tallerId: string;
  usuarioId: string;
  email: string;
  cookie: string;
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
  return { status: res.status, json: texto ? JSON.parse(texto) : null, res };
}

async function iniciar(email: string, password = CLAVE): Promise<string> {
  const r = await llamar('POST', '/auth/login', undefined, { email, password });
  expect(r.status).toBe(200);
  return r.res.headers.getSetCookie().find((c) => c.startsWith(`${COOKIE_SESION}=`))!.split(';')[0];
}

async function crearCuenta(nombre: string, maxUsuarios = 2): Promise<Cuenta> {
  const t = await pool.query('INSERT INTO talleres (nombre, max_usuarios) VALUES ($1, $2) RETURNING id', [
    `${nombre} (test ${sufijo})`,
    maxUsuarios,
  ]);
  const email = `${nombre.toLowerCase()}-${sufijo}@test.local`;
  const u = await pool.query(
    "INSERT INTO usuarios (taller_id, nombre, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id",
    [t.rows[0].id, `Dueno ${nombre}`, email, await hashPassword(CLAVE)],
  );
  return { tallerId: t.rows[0].id, usuarioId: u.rows[0].id, email, cookie: await iniciar(email) };
}

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
  await pool.query('DELETE FROM talleres WHERE id = ANY($1)', [[a?.tallerId, b?.tallerId].filter(Boolean)]);
  await pool.query('DELETE FROM administradores_app WHERE email = $1', [emailAdmin]);
  await pool.end();
  await app?.close();
});

describe('datos y configuracion del taller', () => {
  it('exige sesion', async () => {
    expect((await llamar('GET', '/taller')).status).toBe(401);
    expect((await llamar('PATCH', '/taller', undefined, { nombre: 'x' })).status).toBe(401);
  });

  it('cada usuario ve la configuracion de su taller, con valores iniciales neutros', async () => {
    const r = await llamar('GET', '/taller', a.cookie);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({
      nombre: `Alfa (test ${sufijo})`,
      direccion: null,
      telefono: null,
      datosTransferencia: null,
      margenRepuestosPct: 0,
      anticipo: { tipo: 'repuestos', valor: null },
      validezDias: 15,
      condiciones: '',
      maxUsuarios: 2,
      usuariosActivos: 1,
    });
    expect((await llamar('GET', '/taller', b.cookie)).json.nombre).toBe(`Beta (test ${sufijo})`);
  });

  it('guarda los cambios y se pueden borrar los campos opcionales', async () => {
    const r = await llamar('PATCH', '/taller', a.cookie, {
      nombre: 'Alfa Pintura',
      direccion: 'Av. Pajaritos 123, Maipú',
      telefono: '+56 9 1111 2222',
      datosTransferencia: 'Banco X\nCuenta 123',
      margenRepuestosPct: 22.5,
      validezDias: 30,
      condiciones: 'Daños ocultos se cotizan aparte.',
      anticipo: { tipo: 'porcentaje', valor: 40 },
    });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({
      nombre: 'Alfa Pintura',
      direccion: 'Av. Pajaritos 123, Maipú',
      margenRepuestosPct: 22.5,
      validezDias: 30,
      anticipo: { tipo: 'porcentaje', valor: 40 },
    });
    expect((await llamar('GET', '/taller', a.cookie)).json.condiciones).toBe('Daños ocultos se cotizan aparte.');

    const limpio = await llamar('PATCH', '/taller', a.cookie, { direccion: '', telefono: null, condiciones: '' });
    expect(limpio.json).toMatchObject({ direccion: null, telefono: null, condiciones: '' });
    // Cambiar a un anticipo sin valor limpia el valor anterior.
    const sin = await llamar('PATCH', '/taller', a.cookie, { anticipo: { tipo: 'ninguno', valor: 99 } });
    expect(sin.json.anticipo).toEqual({ tipo: 'ninguno', valor: null });
  });

  it('un cuerpo vacio no cambia nada', async () => {
    const antes = (await llamar('GET', '/taller', b.cookie)).json;
    const r = await llamar('PATCH', '/taller', b.cookie, {});
    expect(r.status).toBe(200);
    expect(r.json).toEqual(antes);
  });

  it('rechaza datos invalidos', async () => {
    const malo = (cuerpo: unknown) => llamar('PATCH', '/taller', b.cookie, cuerpo);
    expect((await malo({ nombre: '  ' })).status).toBe(400);
    expect((await malo({ margenRepuestosPct: -1 })).status).toBe(400);
    expect((await malo({ margenRepuestosPct: 501 })).status).toBe(400);
    expect((await malo({ margenRepuestosPct: 10.123 })).status).toBe(400);
    expect((await malo({ margenRepuestosPct: '10' })).status).toBe(400);
    expect((await malo({ validezDias: 0 })).status).toBe(400);
    expect((await malo({ validezDias: 366 })).status).toBe(400);
    expect((await malo({ validezDias: 1.5 })).status).toBe(400);
    expect((await malo({ telefono: 12345 })).status).toBe(400);
    expect((await malo({ condiciones: 'x'.repeat(4001) })).status).toBe(400);
    expect((await malo({ anticipo: { tipo: 'regalo' } })).status).toBe(400);
    expect((await malo({ anticipo: { tipo: 'porcentaje' } })).status).toBe(400);
    expect((await malo({ anticipo: { tipo: 'porcentaje', valor: 101 } })).status).toBe(400);
    expect((await malo({ anticipo: { tipo: 'fijo', valor: -5 } })).status).toBe(400);
    expect((await malo({ anticipo: 'repuestos' })).status).toBe(400);
    expect((await malo('texto')).status).toBe(400);
  });

  it('el administrador de taller no puede cambiar su limite de usuarios ni su estado', async () => {
    const r = await llamar('PATCH', '/taller', b.cookie, { maxUsuarios: 50, activo: false, nombre: 'Beta 2' });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ nombre: 'Beta 2', maxUsuarios: 2 });
    const { rows } = await pool.query('SELECT max_usuarios, activo FROM talleres WHERE id = $1', [b.tallerId]);
    expect(rows[0]).toEqual({ max_usuarios: 2, activo: true });
  });

  it('aunque el codigo fallara, la base no deja al rol de la app cambiar el limite ni el estado', async () => {
    const c = await pool.connect();
    try {
      for (const sql of ['UPDATE talleres SET max_usuarios = 99', 'UPDATE talleres SET activo = false']) {
        await c.query('BEGIN');
        await c.query('SET LOCAL ROLE taller_app');
        await c.query("SELECT set_config('app.taller_id', $1, true)", [a.tallerId]);
        await expect(c.query(sql)).rejects.toThrow(/permission denied/i);
        await c.query('ROLLBACK');
      }
    } finally {
      c.release();
    }
  });
});

describe('usuarios del taller', () => {
  it('cada taller ve solo a sus usuarios, sin datos de contraseña', async () => {
    const r = await llamar('GET', '/taller/usuarios', a.cookie);
    expect(r.status).toBe(200);
    expect(r.json.map((u: { id: string }) => u.id)).toEqual([a.usuarioId]);
    expect(JSON.stringify(r.json)).not.toMatch(/hash|password/i);
  });

  it('no puede ver, editar ni cambiar la contraseña de usuarios de otro taller (404)', async () => {
    expect((await llamar('PATCH', `/taller/usuarios/${b.usuarioId}`, a.cookie, { nombre: 'Hackeado' })).status).toBe(404);
    expect((await llamar('PATCH', `/taller/usuarios/${b.usuarioId}`, a.cookie, { activo: false })).status).toBe(404);
    expect(
      (await llamar('POST', `/taller/usuarios/${b.usuarioId}/password`, a.cookie, { password: 'otra-clave-99' })).status,
    ).toBe(404);
    const { rows } = await pool.query('SELECT nombre, activo FROM usuarios WHERE id = $1', [b.usuarioId]);
    expect(rows[0]).toEqual({ nombre: 'Dueno Beta', activo: true });
    expect((await iniciar(b.email)).length).toBeGreaterThan(0); // su clave sigue siendo la misma
  });

  it('crea usuarios hasta el limite y avisa con un mensaje claro', async () => {
    const nuevo = await llamar('POST', '/taller/usuarios', a.cookie, {
      nombre: 'Segundo',
      email: `segundo-${sufijo}@test.local`,
      password: CLAVE,
    });
    expect(nuevo.status).toBe(201);
    expect(nuevo.json).toMatchObject({ nombre: 'Segundo', activo: true });
    expect(JSON.stringify(nuevo.json)).not.toMatch(/hash|password/i);

    const tercero = await llamar('POST', '/taller/usuarios', a.cookie, {
      nombre: 'Tercero',
      email: `tercero-${sufijo}@test.local`,
      password: CLAVE,
    });
    expect(tercero.status).toBe(409);
    expect(tercero.json.message).toMatch(/límite de 2 usuarios/);
    expect((await iniciar(`segundo-${sufijo}@test.local`)).length).toBeGreaterThan(0);
  });

  it('valida los datos y no repite correos (ni de otro taller ni de un administrador)', async () => {
    const crear = (extra: object) =>
      llamar('POST', '/taller/usuarios', b.cookie, {
        nombre: 'X',
        email: `nuevo-${sufijo}@test.local`,
        password: CLAVE,
        ...extra,
      });
    expect((await crear({ password: 'corta' })).status).toBe(400);
    expect((await crear({ email: 'malo' })).status).toBe(400);
    expect((await crear({ nombre: '' })).status).toBe(400);
    expect((await crear({ email: a.email })).status).toBe(409); // de otro taller
    expect((await crear({ email: emailAdmin })).status).toBe(409); // de un administrador de la app
    expect((await crear({ email: b.email.toUpperCase() })).status).toBe(409); // el suyo, en mayusculas
  });

  it('puede desactivar a otro usuario, pero no a si mismo', async () => {
    const segundo = (await llamar('GET', '/taller/usuarios', a.cookie)).json.find(
      (u: { email: string }) => u.email === `segundo-${sufijo}@test.local`,
    );
    const cookieSegundo = await iniciar(segundo.email);

    expect((await llamar('PATCH', `/taller/usuarios/${a.usuarioId}`, a.cookie, { activo: false })).status).toBe(400);
    const off = await llamar('PATCH', `/taller/usuarios/${segundo.id}`, a.cookie, { activo: false });
    expect(off.status).toBe(200);
    expect(off.json.activo).toBe(false);
    expect((await llamar('GET', '/auth/me', cookieSegundo)).status).toBe(401); // su sesion se corto

    // Libero el cupo, lleno el taller con otro y compruebo que reactivar ya no cabe.
    const otro = await llamar('POST', '/taller/usuarios', a.cookie, {
      nombre: 'Otro',
      email: `otro-${sufijo}@test.local`,
      password: CLAVE,
    });
    expect(otro.status).toBe(201);
    expect((await llamar('PATCH', `/taller/usuarios/${segundo.id}`, a.cookie, { activo: true })).status).toBe(409);
  });

  it('edita nombre y correo de un usuario', async () => {
    const lista = (await llamar('GET', '/taller/usuarios', b.cookie)).json;
    const r = await llamar('PATCH', `/taller/usuarios/${lista[0].id}`, b.cookie, { nombre: 'Nombre nuevo' });
    expect(r.json.nombre).toBe('Nombre nuevo');
    expect((await llamar('PATCH', `/taller/usuarios/${lista[0].id}`, b.cookie, { email: a.email })).status).toBe(409);
    expect((await llamar('PATCH', '/taller/usuarios/no-es-un-id', b.cookie, { nombre: 'x' })).status).toBe(404);
  });
});

describe('cambio de contraseña', () => {
  it('la propia exige la actual y conserva la sesion desde la que se cambia', async () => {
    const email = `clave-${sufijo}@test.local`;
    const t = await pool.query('INSERT INTO talleres (nombre) VALUES ($1) RETURNING id', [`Gamma (test ${sufijo})`]);
    const u = await pool.query(
      'INSERT INTO usuarios (taller_id, nombre, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id',
      [t.rows[0].id, 'Gamma', email, await hashPassword(CLAVE)],
    );
    try {
      const actual = await iniciar(email);
      const otraSesion = await iniciar(email);
      const ruta = `/taller/usuarios/${u.rows[0].id}/password`;

      expect((await llamar('POST', ruta, actual, { password: 'nueva-clave-99' })).status).toBe(400); // sin la actual
      expect((await llamar('POST', ruta, actual, { password: 'nueva-clave-99', actual: 'incorrecta-1' })).status).toBe(400);
      expect((await llamar('POST', ruta, actual, { password: 'corta', actual: CLAVE })).status).toBe(400);
      expect((await llamar('POST', ruta, actual, { password: 'nueva-clave-99', actual: CLAVE })).status).toBe(204);

      expect((await llamar('GET', '/auth/me', actual)).status).toBe(200); // esta sesion sigue
      expect((await llamar('GET', '/auth/me', otraSesion)).status).toBe(401); // las demas se cerraron
      expect((await llamar('POST', '/auth/login', undefined, { email, password: CLAVE })).status).toBe(401);
      expect((await iniciar(email, 'nueva-clave-99')).length).toBeGreaterThan(0);
    } finally {
      await pool.query('DELETE FROM talleres WHERE id = $1', [t.rows[0].id]);
    }
  });

  it('la de otro usuario del taller no pide la actual y cierra sus sesiones', async () => {
    const creado = await llamar('POST', '/taller/usuarios', b.cookie, {
      nombre: 'Ayudante',
      email: `ayudante-${sufijo}@test.local`,
      password: CLAVE,
    });
    expect(creado.status).toBe(201);
    const cookieAyudante = await iniciar(`ayudante-${sufijo}@test.local`);

    const r = await llamar('POST', `/taller/usuarios/${creado.json.id}/password`, b.cookie, { password: 'clave-nueva-77' });
    expect(r.status).toBe(204);
    expect((await llamar('GET', '/auth/me', cookieAyudante)).status).toBe(401);
    expect((await iniciar(`ayudante-${sufijo}@test.local`, 'clave-nueva-77')).length).toBeGreaterThan(0);
    expect((await llamar('GET', '/auth/me', b.cookie)).status).toBe(200); // la sesion de quien cambia sigue
  });
});

describe('administrador de la app dentro de un taller', () => {
  it('sin haber entrado a un taller no hay taller sobre el cual operar', async () => {
    await llamar('POST', '/admin/salir-taller', cookieAdmin);
    const r = await llamar('GET', '/taller', cookieAdmin);
    expect(r.status).toBe(400);
    expect(r.json.message).toMatch(/Elige primero un taller/);
  });

  it('al entrar ve y edita los datos de ese taller, y deja de poder al salir', async () => {
    await llamar('POST', `/admin/talleres/${a.tallerId}/entrar`, cookieAdmin);
    const ver = await llamar('GET', '/taller', cookieAdmin);
    expect(ver.status).toBe(200);
    expect(ver.json.nombre).toBe('Alfa Pintura');

    const cambio = await llamar('PATCH', '/taller', cookieAdmin, { telefono: '+56 2 2222 3333' });
    expect(cambio.json.telefono).toBe('+56 2 2222 3333');
    expect((await llamar('GET', '/taller/usuarios', cookieAdmin)).json.length).toBeGreaterThan(0);

    await llamar('POST', '/admin/salir-taller', cookieAdmin);
    expect((await llamar('GET', '/taller', cookieAdmin)).status).toBe(400);
  });

  it('el administrador puede cambiar la contraseña de un usuario sin pedir la actual', async () => {
    await llamar('POST', `/admin/talleres/${a.tallerId}/entrar`, cookieAdmin);
    try {
      const r = await llamar('POST', `/taller/usuarios/${a.usuarioId}/password`, cookieAdmin, { password: 'definida-por-admin-1' });
      expect(r.status).toBe(204);
      expect((await iniciar(a.email, 'definida-por-admin-1')).length).toBeGreaterThan(0);
    } finally {
      await llamar('POST', '/admin/salir-taller', cookieAdmin);
    }
  });
});
