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
const NUEVA = 'otra-clave-nueva-2';
const sufijo = Math.random().toString(36).slice(2, 7).toLowerCase();
const pool = new Pool({ connectionString: url, max: 2 });
const talleresCreados: string[] = [];
const adminsCreados: string[] = [];

let app: INestApplication;
let base: string;
let tallerId: string;
let duenoId: string;
let emailDueno: string;
let adminId: string;
let emailAdmin: string;
let cookieAdmin: string;
let cookieDueno: string;

async function llamar(metodo: string, ruta: string, cookie?: string, cuerpo?: unknown) {
  const res = await fetch(base + ruta, {
    method: metodo,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await res.text();
  return { status: res.status, json: texto ? JSON.parse(texto) : null };
}

async function entrar(email: string, password = CLAVE): Promise<{ status: number; cookie: string }> {
  const res = await fetch(base + '/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith(`${COOKIE_SESION}=`))?.split(';')[0] ?? '';
  return { status: res.status, cookie };
}

const yo = async (cookie: string) => (await llamar('GET', '/auth/me', cookie)).json;

beforeAll(async () => {
  process.env.DATABASE_URL = url;
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../src/app.module');
  app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;

  const t = await pool.query('INSERT INTO talleres (nombre, max_usuarios) VALUES ($1, 5) RETURNING id', [`Cuentas (test ${sufijo})`]);
  tallerId = t.rows[0].id;
  talleresCreados.push(tallerId);
  emailDueno = `dueno-${sufijo}@test.local`;
  const u = await pool.query('INSERT INTO usuarios (taller_id, nombre, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id', [
    tallerId,
    'Dueno Cuentas',
    emailDueno,
    await hashPassword(CLAVE),
  ]);
  duenoId = u.rows[0].id;
  emailAdmin = `root-${sufijo}@test.local`;
  const a = await pool.query('INSERT INTO administradores_app (nombre, email, password_hash) VALUES ($1, $2, $3) RETURNING id', [
    'Root Cuentas',
    emailAdmin,
    await hashPassword(CLAVE),
  ]);
  adminId = a.rows[0].id;
  adminsCreados.push(adminId);
  cookieAdmin = (await entrar(emailAdmin)).cookie;
  cookieDueno = (await entrar(emailDueno)).cookie;
});

afterAll(async () => {
  await pool.query('DELETE FROM sesiones WHERE usuario_id IN (SELECT id FROM usuarios WHERE taller_id = ANY($1)) OR admin_id = ANY($2)', [talleresCreados, adminsCreados]);
  await pool.query('DELETE FROM usuarios WHERE taller_id = ANY($1)', [talleresCreados]);
  await pool.query('DELETE FROM talleres WHERE id = ANY($1)', [talleresCreados]);
  await pool.query('DELETE FROM administradores_app WHERE id = ANY($1)', [adminsCreados]);
  await pool.end();
  await app.close();
});

describe('contraseña temporal de los usuarios de un taller', () => {
  it('una cuenta normal no pide cambiar la contraseña', async () => {
    expect((await yo(cookieDueno)).debeCambiarPassword).toBe(false);
  });

  it('el administrador de la APP que crea un usuario o le pone una clave lo obliga a cambiarla', async () => {
    const email = `nuevo-${sufijo}@test.local`;
    const r = await llamar('POST', `/admin/talleres/${tallerId}/usuarios`, cookieAdmin, { nombre: 'Nuevo', email, password: CLAVE });
    expect(r.status).toBe(201);
    const sesion = await entrar(email);
    expect((await yo(sesion.cookie)).debeCambiarPassword).toBe(true);

    // La cambia: se apaga el aviso y la clave vieja deja de servir.
    expect((await llamar('POST', '/auth/password', sesion.cookie, { actual: CLAVE, nueva: NUEVA })).status).toBe(204);
    expect((await yo(sesion.cookie)).debeCambiarPassword).toBe(false);
    expect((await entrar(email, CLAVE)).status).toBe(401);
    expect((await entrar(email, NUEVA)).status).toBe(200);

    // El administrador le pone otra temporal: vuelve a pedir el cambio y cierra su sesion.
    expect((await llamar('POST', `/admin/usuarios/${r.json.id}/password`, cookieAdmin, { password: 'temporal-nueva-3' })).status).toBe(204);
    expect((await llamar('GET', '/auth/me', sesion.cookie)).status).toBe(401);
    expect((await yo((await entrar(email, 'temporal-nueva-3')).cookie)).debeCambiarPassword).toBe(true);
  });

  it('el administrador del taller crea usuarios y pone claves temporales; su propio cambio la apaga', async () => {
    const email = `otro-${sufijo}@test.local`;
    const r = await llamar('POST', '/taller/usuarios', cookieDueno, { nombre: 'Otro', email, password: CLAVE });
    expect(r.status).toBe(201);
    expect((await yo((await entrar(email)).cookie)).debeCambiarPassword).toBe(true);

    // El dueno cambia la clave de otro: queda temporal.
    await pool.query('UPDATE usuarios SET debe_cambiar_password = false WHERE id = $1', [r.json.id]);
    expect((await llamar('POST', `/taller/usuarios/${r.json.id}/password`, cookieDueno, { password: 'temporal-del-dueno' })).status).toBe(204);
    expect((await yo((await entrar(email, 'temporal-del-dueno')).cookie)).debeCambiarPassword).toBe(true);

    // El dueno cambia la suya (pidiendo la actual): no queda como temporal.
    await pool.query('UPDATE usuarios SET debe_cambiar_password = true WHERE id = $1', [duenoId]);
    expect((await llamar('POST', `/taller/usuarios/${duenoId}/password`, cookieDueno, { actual: CLAVE, password: CLAVE })).status).toBe(204);
    expect((await yo(cookieDueno)).debeCambiarPassword).toBe(false);
  });

  it('cambiar la propia contraseña valida la actual, la nueva y limita los intentos', async () => {
    const sesion = (await entrar(emailDueno)).cookie;
    expect((await llamar('POST', '/auth/password', sesion, { actual: 'incorrecta-1', nueva: NUEVA })).status).toBe(400);
    expect((await llamar('POST', '/auth/password', sesion, { actual: CLAVE, nueva: CLAVE })).status).toBe(400); // igual a la actual
    expect((await llamar('POST', '/auth/password', sesion, { actual: CLAVE, nueva: 'corta' })).status).toBe(400);
    expect((await llamar('POST', '/auth/password', sesion, { nueva: NUEVA })).status).toBe(400);
    expect((await llamar('POST', '/auth/password', undefined, { actual: CLAVE, nueva: NUEVA })).status).toBe(401);

    // Tras varios intentos fallidos desde la misma sesion, se frena (incluso con la clave correcta).
    for (let i = 0; i < 5; i++) await llamar('POST', '/auth/password', sesion, { actual: `mala-${i}-clave`, nueva: NUEVA });
    expect((await llamar('POST', '/auth/password', sesion, { actual: CLAVE, nueva: NUEVA })).status).toBe(429);
  });
});

describe('administradores de la APP', () => {
  let segundoId: string;
  const emailSegundo = `segundo-${sufijo}@test.local`;

  it('solo los administradores de la APP los ven y los gestionan', async () => {
    expect((await llamar('GET', '/admin/administradores')).status).toBe(401);
    expect((await llamar('GET', '/admin/administradores', cookieDueno)).status).toBe(403);
    expect((await llamar('POST', '/admin/administradores', cookieDueno, { nombre: 'X', email: 'x@x.cl', password: CLAVE })).status).toBe(403);
    const lista = await llamar('GET', '/admin/administradores', cookieAdmin);
    expect(lista.status).toBe(200);
    expect((lista.json as { id: string }[]).map((a) => a.id)).toContain(adminId);
  });

  it('crea un segundo administrador con clave temporal; el correo no puede repetirse con nadie', async () => {
    const r = await llamar('POST', '/admin/administradores', cookieAdmin, { nombre: 'Segundo', email: emailSegundo, password: CLAVE });
    expect(r.status).toBe(201);
    segundoId = r.json.id;
    adminsCreados.push(segundoId);
    const sesion = await entrar(emailSegundo);
    expect(sesion.status).toBe(200);
    const perfil = await yo(sesion.cookie);
    expect(perfil).toMatchObject({ tipo: 'admin_app', debeCambiarPassword: true });

    expect((await llamar('POST', '/admin/administradores', cookieAdmin, { nombre: 'Rep', email: emailSegundo.toUpperCase(), password: CLAVE })).status).toBe(409);
    expect((await llamar('POST', '/admin/administradores', cookieAdmin, { nombre: 'Rep', email: emailDueno, password: CLAVE })).status).toBe(409);
    expect((await llamar('POST', '/admin/administradores', cookieAdmin, { nombre: 'Corta', email: `c-${sufijo}@test.local`, password: 'corta' })).status).toBe(400);

    // Al cambiar su clave, la suya propia deja de ser temporal.
    expect((await llamar('POST', '/auth/password', sesion.cookie, { actual: CLAVE, nueva: NUEVA })).status).toBe(204);
    expect((await yo(sesion.cookie)).debeCambiarPassword).toBe(false);
  });

  it('pone una clave temporal a otro administrador (cierra sus sesiones) pero no a si mismo', async () => {
    const sesion = (await entrar(emailSegundo, NUEVA)).cookie;
    expect((await llamar('POST', `/admin/administradores/${segundoId}/password`, cookieAdmin, { password: 'temporal-admin-4' })).status).toBe(204);
    expect((await llamar('GET', '/auth/me', sesion)).status).toBe(401);
    expect((await yo((await entrar(emailSegundo, 'temporal-admin-4')).cookie)).debeCambiarPassword).toBe(true);
    expect((await llamar('POST', `/admin/administradores/${adminId}/password`, cookieAdmin, { password: 'temporal-propia-5' })).status).toBe(400);
  });

  it('desactiva y reactiva a otro administrador, nunca a si mismo', async () => {
    const sesion = (await entrar(emailSegundo, 'temporal-admin-4')).cookie;
    expect((await llamar('PATCH', `/admin/administradores/${segundoId}`, cookieAdmin, { activo: false })).json.activo).toBe(false);
    expect((await llamar('GET', '/auth/me', sesion)).status).toBe(401); // su sesion se corta al instante
    expect((await entrar(emailSegundo, 'temporal-admin-4')).status).toBe(401);
    expect((await llamar('PATCH', `/admin/administradores/${segundoId}`, cookieAdmin, { activo: true })).json.activo).toBe(true);
    expect((await entrar(emailSegundo, 'temporal-admin-4')).status).toBe(200);
    expect((await llamar('PATCH', `/admin/administradores/${adminId}`, cookieAdmin, { activo: false })).status).toBe(400);
    expect((await llamar('PATCH', `/admin/administradores/${segundoId}`, cookieAdmin, { activo: 'si' })).status).toBe(400);
  });
});

describe('logo del taller', () => {
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40"><rect width="100" height="40" fill="#11223D"/><path d="M10 10h80v20H10z" fill="#DE4B20"/></svg>';

  it('solo el administrador de la APP lo sube; se limpia, se ve en el detalle y se puede quitar', async () => {
    expect((await llamar('PUT', `/admin/talleres/${tallerId}/logo`, cookieDueno, { svg: SVG })).status).toBe(403);
    expect((await llamar('PUT', `/admin/talleres/${tallerId}/logo`, undefined, { svg: SVG })).status).toBe(401);
    expect((await llamar('GET', `/admin/talleres/${tallerId}`, cookieAdmin)).json.logoClaroSvg).toBeNull();

    expect((await llamar('PUT', `/admin/talleres/${tallerId}/logo`, cookieAdmin, { svg: SVG })).status).toBe(204);
    expect((await llamar('GET', `/admin/talleres/${tallerId}`, cookieAdmin)).json.logoClaroSvg).toBe(SVG);

    for (const malo of ['<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>', '<html></html>', 123, SVG.replace(' viewBox="0 0 100 40"', '')]) {
      expect((await llamar('PUT', `/admin/talleres/${tallerId}/logo`, cookieAdmin, { svg: malo })).status).toBe(400);
    }
    expect((await llamar('GET', `/admin/talleres/${tallerId}`, cookieAdmin)).json.logoClaroSvg).toBe(SVG); // el malo no pisó al bueno
    expect((await llamar('PUT', `/admin/talleres/00000000-0000-4000-8000-000000000000/logo`, cookieAdmin, { svg: SVG })).status).toBe(404);

    // El rol de la aplicacion no puede cambiar el logo ni aun con SQL directo.
    const cliente = await pool.connect();
    try {
      await cliente.query('BEGIN');
      await cliente.query('SET LOCAL ROLE taller_app');
      await expect(cliente.query('UPDATE talleres SET logo_claro_svg = $1', ['<svg/>'])).rejects.toThrow();
    } finally {
      await cliente.query('ROLLBACK');
      cliente.release();
    }

    expect((await llamar('PUT', `/admin/talleres/${tallerId}/logo`, cookieAdmin, { svg: null })).status).toBe(204);
    expect((await llamar('GET', `/admin/talleres/${tallerId}`, cookieAdmin)).json.logoClaroSvg).toBeNull();
  });

  it('el logo para fondo oscuro (encabezado del PDF) se guarda aparte del claro', async () => {
    expect((await llamar('PUT', `/admin/talleres/${tallerId}/logo`, cookieAdmin, { svg: SVG, fondo: 'oscuro' })).status).toBe(204);
    const t = (await llamar('GET', `/admin/talleres/${tallerId}`, cookieAdmin)).json;
    expect(t.logoOscuroSvg).toBe(SVG);
    expect(t.logoClaroSvg).toBeNull();
    expect((await llamar('PUT', `/admin/talleres/${tallerId}/logo`, cookieAdmin, { svg: SVG, fondo: 'gris' })).status).toBe(400);
    const cliente = await pool.connect();
    try {
      await cliente.query('BEGIN');
      await cliente.query('SET LOCAL ROLE taller_app');
      await expect(cliente.query('UPDATE talleres SET logo_oscuro_svg = $1', ['<svg/>'])).rejects.toThrow();
    } finally {
      await cliente.query('ROLLBACK');
      cliente.release();
    }
    expect((await llamar('PUT', `/admin/talleres/${tallerId}/logo`, cookieAdmin, { svg: null, fondo: 'oscuro' })).status).toBe(204);
    expect((await llamar('GET', `/admin/talleres/${tallerId}`, cookieAdmin)).json.logoOscuroSvg).toBeNull();
  });
});
