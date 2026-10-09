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
const emailAdmin = `root-${sufijo}@test.local`;
const pool = new Pool({ connectionString: url, max: 2 });
const talleresCreados: string[] = [];

let app: INestApplication;
let base: string;
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

async function crearTaller(nombre: string, extra: object = {}) {
  const r = await llamar('POST', '/admin/talleres', cookieAdmin, { nombre: `${nombre} (test ${sufijo})`, ...extra });
  expect(r.status).toBe(201);
  talleresCreados.push(r.json.id);
  return r.json as { id: string; nombre: string; maxUsuarios: number; usuariosActivos: number; activo: boolean };
}

const nuevoUsuario = (tallerId: string, n: string, extra: object = {}) =>
  llamar('POST', `/admin/talleres/${tallerId}/usuarios`, cookieAdmin, {
    nombre: `Usuario ${n}`,
    email: `${n}-${sufijo}@test.local`,
    password: CLAVE,
    ...extra,
  });

beforeAll(async () => {
  process.env.DATABASE_URL = url;
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../src/app.module');
  app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
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

describe('acceso a los mantenedores', () => {
  it('sin sesion responde 401', async () => {
    expect((await llamar('GET', '/admin/talleres')).status).toBe(401);
  });

  it('un usuario de taller no puede usarlos (403)', async () => {
    const t = await crearTaller('Taller acceso');
    expect((await nuevoUsuario(t.id, 'acceso')).status).toBe(201);
    const cookie = await iniciar(`acceso-${sufijo}@test.local`);
    expect((await llamar('GET', '/admin/talleres', cookie)).status).toBe(403);
    expect((await llamar('POST', '/admin/talleres', cookie, { nombre: 'Intruso' })).status).toBe(403);
    expect((await llamar('POST', `/admin/talleres/${t.id}/entrar`, cookie)).status).toBe(403);
    expect((await llamar('PATCH', `/admin/talleres/${t.id}`, cookie, { activo: false })).status).toBe(403);
  });
});

describe('talleres', () => {
  it('crea un taller con 2 usuarios como maximo por defecto y aparece en el listado', async () => {
    const t = await crearTaller('Taller nuevo');
    expect(t).toMatchObject({ maxUsuarios: 2, usuariosActivos: 0, activo: true });
    const lista = await llamar('GET', '/admin/talleres', cookieAdmin);
    expect(lista.status).toBe(200);
    expect(lista.json.map((x: { id: string }) => x.id)).toContain(t.id);
  });

  it('valida los datos al crear', async () => {
    const malo = (cuerpo: unknown) => llamar('POST', '/admin/talleres', cookieAdmin, cuerpo);
    expect((await malo({})).status).toBe(400);
    expect((await malo({ nombre: '   ' })).status).toBe(400);
    expect((await malo({ nombre: 'x', maxUsuarios: 0 })).status).toBe(400);
    expect((await malo({ nombre: 'x', maxUsuarios: 51 })).status).toBe(400);
    expect((await malo({ nombre: 'x', maxUsuarios: 1.5 })).status).toBe(400);
    expect((await malo({ nombre: 'x', maxUsuarios: '3' })).status).toBe(400);
    expect((await malo('texto')).status).toBe(400);
  });

  it('obtiene el detalle; un id mal formado o inexistente da 404', async () => {
    const t = await crearTaller('Taller detalle');
    const r = await llamar('GET', `/admin/talleres/${t.id}`, cookieAdmin);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ id: t.id, usuarios: [] });
    expect((await llamar('GET', '/admin/talleres/no-es-un-id', cookieAdmin)).status).toBe(404);
    expect((await llamar('GET', '/admin/talleres/00000000-0000-4000-8000-000000000000', cookieAdmin)).status).toBe(404);
  });

  it('edita nombre, limite y estado', async () => {
    const t = await crearTaller('Taller edicion');
    const r = await llamar('PATCH', `/admin/talleres/${t.id}`, cookieAdmin, {
      nombre: 'Nombre nuevo',
      maxUsuarios: 5,
      activo: false,
    });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ nombre: 'Nombre nuevo', maxUsuarios: 5, activo: false });
    expect((await llamar('PATCH', `/admin/talleres/${t.id}`, cookieAdmin, { activo: 'no' })).status).toBe(400);
    expect((await llamar('PATCH', `/admin/talleres/${t.id}`, cookieAdmin, { maxUsuarios: -1 })).status).toBe(400);
    expect((await llamar('PATCH', '/admin/talleres/00000000-0000-4000-8000-000000000000', cookieAdmin, { nombre: 'x' })).status).toBe(404);
  });

  it('suspender un taller corta la sesion de sus usuarios; reactivarlo la devuelve', async () => {
    const t = await crearTaller('Taller suspendido');
    await nuevoUsuario(t.id, 'susp');
    const cookie = await iniciar(`susp-${sufijo}@test.local`);
    expect((await llamar('GET', '/auth/me', cookie)).status).toBe(200);

    await llamar('PATCH', `/admin/talleres/${t.id}`, cookieAdmin, { activo: false });
    expect((await llamar('GET', '/auth/me', cookie)).status).toBe(401);
    expect((await llamar('POST', '/auth/login', undefined, { email: `susp-${sufijo}@test.local`, password: CLAVE })).status).toBe(401);

    await llamar('PATCH', `/admin/talleres/${t.id}`, cookieAdmin, { activo: true });
    expect((await llamar('GET', '/auth/me', cookie)).status).toBe(200);
  });
});

describe('usuarios de un taller', () => {
  it('crea un usuario que puede iniciar sesion, sin exponer la contraseña', async () => {
    const t = await crearTaller('Taller usuarios');
    const r = await nuevoUsuario(t.id, 'ana');
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ nombre: 'Usuario ana', activo: true });
    expect(JSON.stringify(r.json)).not.toMatch(/hash|password/i);

    const perfil = await llamar('GET', '/auth/me', await iniciar(`ana-${sufijo}@test.local`));
    expect(perfil.json).toMatchObject({ tipo: 'taller', taller: { id: t.id } });

    const detalle = await llamar('GET', `/admin/talleres/${t.id}`, cookieAdmin);
    expect(detalle.json.usuariosActivos).toBe(1);
    expect(JSON.stringify(detalle.json)).not.toMatch(/hash|password/i);
  });

  it('valida los datos al crear un usuario', async () => {
    const t = await crearTaller('Taller validacion');
    expect((await nuevoUsuario(t.id, 'v1', { password: 'corta' })).status).toBe(400);
    expect((await nuevoUsuario(t.id, 'v2', { email: 'no-es-correo' })).status).toBe(400);
    expect((await nuevoUsuario(t.id, 'v3', { nombre: '' })).status).toBe(400);
    expect((await nuevoUsuario('00000000-0000-4000-8000-000000000000', 'v4')).status).toBe(404);
  });

  it('no permite repetir el correo (sin distinguir mayusculas) ni usar el de un administrador', async () => {
    const t = await crearTaller('Taller correos');
    expect((await nuevoUsuario(t.id, 'dup')).status).toBe(201);
    const repetido = await nuevoUsuario(t.id, 'dup2', { email: `DUP-${sufijo}@test.local` });
    expect(repetido.status).toBe(409);
    expect((await nuevoUsuario(t.id, 'otro', { email: emailAdmin })).status).toBe(409);
  });

  it('respeta el limite de usuarios del taller', async () => {
    const t = await crearTaller('Taller limite');
    expect((await nuevoUsuario(t.id, 'l1')).status).toBe(201);
    expect((await nuevoUsuario(t.id, 'l2')).status).toBe(201);
    const tercero = await nuevoUsuario(t.id, 'l3');
    expect(tercero.status).toBe(409);
    expect(tercero.json.message).toMatch(/límite de 2 usuarios/);

    await llamar('PATCH', `/admin/talleres/${t.id}`, cookieAdmin, { maxUsuarios: 3 });
    expect((await nuevoUsuario(t.id, 'l3')).status).toBe(201);
  });

  it('desactivar a un usuario corta su sesion y libera un cupo; reactivar con el taller lleno falla', async () => {
    const t = await crearTaller('Taller desactivar');
    const a = (await nuevoUsuario(t.id, 'd1')).json;
    await nuevoUsuario(t.id, 'd2');
    const cookie = await iniciar(`d1-${sufijo}@test.local`);

    const off = await llamar('PATCH', `/admin/usuarios/${a.id}`, cookieAdmin, { activo: false });
    expect(off.status).toBe(200);
    expect(off.json.activo).toBe(false);
    expect((await llamar('GET', '/auth/me', cookie)).status).toBe(401);

    expect((await nuevoUsuario(t.id, 'd3')).status).toBe(201); // el cupo quedo libre
    const on = await llamar('PATCH', `/admin/usuarios/${a.id}`, cookieAdmin, { activo: true });
    expect(on.status).toBe(409);
  });

  it('edita nombre y correo, y valida el correo nuevo', async () => {
    const t = await crearTaller('Taller edicion usuario');
    const u = (await nuevoUsuario(t.id, 'e1')).json;
    await nuevoUsuario(t.id, 'e2');
    const r = await llamar('PATCH', `/admin/usuarios/${u.id}`, cookieAdmin, {
      nombre: 'Nombre editado',
      email: `nuevo-${sufijo}@test.local`,
    });
    expect(r.json).toMatchObject({ nombre: 'Nombre editado', email: `nuevo-${sufijo}@test.local` });
    expect((await llamar('PATCH', `/admin/usuarios/${u.id}`, cookieAdmin, { email: `e2-${sufijo}@test.local` })).status).toBe(409);
    expect((await llamar('PATCH', `/admin/usuarios/${u.id}`, cookieAdmin, { email: 'malo' })).status).toBe(400);
    expect((await llamar('PATCH', '/admin/usuarios/00000000-0000-4000-8000-000000000000', cookieAdmin, { nombre: 'x' })).status).toBe(404);
  });

  it('cambiar la contraseña cierra sus sesiones y la anterior deja de servir', async () => {
    const t = await crearTaller('Taller clave');
    const u = (await nuevoUsuario(t.id, 'c1')).json;
    const email = `c1-${sufijo}@test.local`;
    const cookie = await iniciar(email);

    expect((await llamar('POST', `/admin/usuarios/${u.id}/password`, cookieAdmin, { password: 'corta' })).status).toBe(400);
    const r = await llamar('POST', `/admin/usuarios/${u.id}/password`, cookieAdmin, { password: 'otra-clave-99' });
    expect(r.status).toBe(204);

    expect((await llamar('GET', '/auth/me', cookie)).status).toBe(401);
    expect((await llamar('POST', '/auth/login', undefined, { email, password: CLAVE })).status).toBe(401);
    expect((await iniciar(email, 'otra-clave-99')).length).toBeGreaterThan(0);
  });
});

describe('entrar a un taller', () => {
  it('el administrador entra a un taller y sale; /auth/me lo refleja', async () => {
    const t = await crearTaller('Taller entrar');
    const antes = await llamar('GET', '/auth/me', cookieAdmin);
    expect(antes.json.taller).toBeNull();

    expect((await llamar('POST', `/admin/talleres/${t.id}/entrar`, cookieAdmin)).status).toBe(204);
    const dentro = await llamar('GET', '/auth/me', cookieAdmin);
    expect(dentro.json).toMatchObject({ tipo: 'admin_app', taller: { id: t.id, nombre: t.nombre } });

    expect((await llamar('POST', '/admin/salir-taller', cookieAdmin)).status).toBe(204);
    expect((await llamar('GET', '/auth/me', cookieAdmin)).json.taller).toBeNull();
  });

  it('no deja entrar a un taller que no existe', async () => {
    expect((await llamar('POST', '/admin/talleres/00000000-0000-4000-8000-000000000000/entrar', cookieAdmin)).status).toBe(404);
    expect((await llamar('POST', '/admin/talleres/no-es-un-id/entrar', cookieAdmin)).status).toBe(404);
  });
});
