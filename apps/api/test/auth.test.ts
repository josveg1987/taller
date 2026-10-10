import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import type { INestApplication } from '@nestjs/common';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hashPassword } from '../src/auth/password';
import { AuthGuard, COOKIE_SESION } from '../src/auth/auth.guard';
import { SoloAdminApp } from '../src/auth/decoradores';
import type { AuthService } from '../src/auth/auth.service';
import type { Contexto } from '../src/auth/contexto';

// Escribe en la base: solo contra una base local.
const url = process.env.TEST_DATABASE_URL ?? 'postgresql://taller:taller@localhost:5432/taller';
if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error('Los tests de BD solo pueden correr contra una base local');

const CLAVE = 'clave-segura-1';
const sufijo = Math.random().toString(36).slice(2, 8);
const admin = new Pool({ connectionString: url, max: 2 });

let app: INestApplication;
let base: string;
let tallerId: string;
let usuarioId: string;
const emailUsuario = `usuario-${sufijo}@test.local`;
const emailAdmin = `admin-${sufijo}@test.local`;

async function post(ruta: string, body?: unknown, cookie?: string) {
  const res = await fetch(base + ruta, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.getSetCookie().find((c) => c.startsWith(`${COOKIE_SESION}=`));
  return { res, setCookie, cookie: setCookie?.split(';')[0] };
}

const get = (ruta: string, cookie?: string) => fetch(base + ruta, { headers: cookie ? { cookie } : {} });

async function entrar(email = emailUsuario) {
  const r = await post('/auth/login', { email, password: CLAVE });
  expect(r.res.status).toBe(200);
  return r.cookie as string;
}

beforeAll(async () => {
  process.env.DATABASE_URL = url;
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../src/app.module');
  app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  const dir = app.getHttpServer().address() as { port: number };
  base = `http://127.0.0.1:${dir.port}`;

  const hash = await hashPassword(CLAVE);
  tallerId = (await admin.query("INSERT INTO talleres (nombre) VALUES ('Taller Auth (test)') RETURNING id")).rows[0].id;
  usuarioId = (
    await admin.query(
      "INSERT INTO usuarios (taller_id, nombre, email, password_hash) VALUES ($1, 'Ana', $2, $3) RETURNING id",
      [tallerId, emailUsuario, hash],
    )
  ).rows[0].id;
  await admin.query("INSERT INTO administradores_app (nombre, email, password_hash) VALUES ('Root', $1, $2)", [
    emailAdmin,
    hash,
  ]);
});

afterAll(async () => {
  await admin.query('DELETE FROM talleres WHERE id = $1', [tallerId]);
  await admin.query('DELETE FROM administradores_app WHERE email = $1', [emailAdmin]);
  await admin.end();
  await app?.close();
});

describe('inicio de sesion', () => {
  it('con credenciales correctas entrega una cookie httpOnly y el perfil', async () => {
    const r = await post('/auth/login', { email: emailUsuario, password: CLAVE });
    expect(r.res.status).toBe(200);
    expect(r.setCookie).toMatch(/HttpOnly/i);
    expect(r.setCookie).toMatch(/SameSite=Lax/i);
    const perfil = await r.res.json();
    expect(perfil).toMatchObject({ tipo: 'taller', nombre: 'Ana', taller: { id: tallerId } });
    // El perfil nunca trae el hash ni una contraseña (solo el aviso de que la actual es temporal).
    expect(JSON.stringify(perfil)).not.toMatch(/hash|"password"/i);
    expect(perfil.debeCambiarPassword).toBe(false);
  });

  it('el email no distingue mayusculas', async () => {
    const r = await post('/auth/login', { email: emailUsuario.toUpperCase(), password: CLAVE });
    expect(r.res.status).toBe(200);
  });

  it('contraseña incorrecta y email inexistente responden lo mismo y no dan cookie', async () => {
    const mala = await post('/auth/login', { email: emailUsuario, password: 'otra-clave-1' });
    const noExiste = await post('/auth/login', { email: `nadie-${sufijo}@test.local`, password: CLAVE });
    expect(mala.res.status).toBe(401);
    expect(noExiste.res.status).toBe(401);
    expect(mala.setCookie).toBeUndefined();
    expect(noExiste.setCookie).toBeUndefined();
    expect((await mala.res.json()).message).toBe((await noExiste.res.json()).message);
  });

  it('rechaza cuerpos incompletos', async () => {
    expect((await post('/auth/login', {})).res.status).toBe(400);
    expect((await post('/auth/login', { email: emailUsuario })).res.status).toBe(400);
    expect((await post('/auth/login', { email: 1, password: 2 })).res.status).toBe(400);
  });

  it('despues de 5 intentos fallidos bloquea (429), incluso con la clave correcta', async () => {
    const email = `fuerza-bruta-${sufijo}@test.local`;
    for (let i = 0; i < 5; i++) {
      expect((await post('/auth/login', { email, password: 'incorrecta-1' })).res.status).toBe(401);
    }
    expect((await post('/auth/login', { email, password: CLAVE })).res.status).toBe(429);
  });
});

describe('sesion', () => {
  it('/auth/me exige sesion; /health es publico', async () => {
    expect((await get('/auth/me')).status).toBe(401);
    expect((await get('/health')).status).toBe(200);
  });

  it('con la cookie, /auth/me devuelve quien eres', async () => {
    const cookie = await entrar();
    const res = await get('/auth/me', cookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ tipo: 'taller', email: emailUsuario });
  });

  it('un token inventado o alterado no sirve', async () => {
    expect((await get('/auth/me', `${COOKIE_SESION}=inventado`)).status).toBe(401);
    const cookie = await entrar();
    expect((await get('/auth/me', cookie + 'x')).status).toBe(401);
  });

  it('cerrar sesion invalida la cookie', async () => {
    const cookie = await entrar();
    const salir = await post('/auth/logout', undefined, cookie);
    expect(salir.res.status).toBe(204);
    expect(salir.setCookie).toMatch(/Expires=Thu, 01 Jan 1970/i);
    expect((await get('/auth/me', cookie)).status).toBe(401);
  });

  it('una sesion vencida deja de servir', async () => {
    const cookie = await entrar();
    await admin.query("UPDATE sesiones SET expira_en = now() - interval '1 minute' WHERE usuario_id = $1", [usuarioId]);
    expect((await get('/auth/me', cookie)).status).toBe(401);
  });

  it('desactivar al usuario corta su sesion al instante y le impide volver a entrar', async () => {
    const cookie = await entrar();
    await admin.query('UPDATE usuarios SET activo = false WHERE id = $1', [usuarioId]);
    try {
      expect((await get('/auth/me', cookie)).status).toBe(401);
      expect((await post('/auth/login', { email: emailUsuario, password: CLAVE })).res.status).toBe(401);
    } finally {
      await admin.query('UPDATE usuarios SET activo = true WHERE id = $1', [usuarioId]);
    }
    expect((await get('/auth/me', cookie)).status).toBe(200);
  });

  it('desactivar el taller corta la sesion de todos sus usuarios', async () => {
    const cookie = await entrar();
    await admin.query('UPDATE talleres SET activo = false WHERE id = $1', [tallerId]);
    try {
      expect((await get('/auth/me', cookie)).status).toBe(401);
      expect((await post('/auth/login', { email: emailUsuario, password: CLAVE })).res.status).toBe(401);
    } finally {
      await admin.query('UPDATE talleres SET activo = true WHERE id = $1', [tallerId]);
    }
  });

  it('el token se guarda con hash: la base no contiene el valor de la cookie', async () => {
    const cookie = await entrar();
    const token = cookie.split('=')[1];
    const { rows } = await admin.query('SELECT 1 FROM sesiones WHERE token_hash = $1', [token]);
    expect(rows).toHaveLength(0);
  });
});

describe('administrador de la app', () => {
  it('inicia sesion como admin_app y aun no esta en ningun taller', async () => {
    const r = await post('/auth/login', { email: emailAdmin, password: CLAVE });
    expect(r.res.status).toBe(200);
    expect(await r.res.json()).toMatchObject({ tipo: 'admin_app', nombre: 'Root', taller: null });
  });

  it('@SoloAdminApp deja pasar al admin y rechaza al usuario de taller', async () => {
    class Rutas {
      solo() {}
    }
    // Equivale a escribir @SoloAdminApp() sobre el metodo.
    SoloAdminApp()(Rutas.prototype, 'solo', Object.getOwnPropertyDescriptor(Rutas.prototype, 'solo')!);
    const contexto = (c: Contexto) => {
      const req: { headers: Record<string, string>; contexto?: Contexto } = {
        headers: { cookie: `${COOKIE_SESION}=t` },
      };
      const ctx = {
        getHandler: () => Rutas.prototype.solo,
        getClass: () => Rutas,
        switchToHttp: () => ({ getRequest: () => req }),
      } as unknown as ExecutionContext;
      const auth = { validar: async (t: string) => (t === 't' ? c : null) } as unknown as AuthService;
      return new AuthGuard(new Reflector(), auth).canActivate(ctx);
    };
    await expect(contexto({ tipo: 'admin_app', sesionId: 's', adminId: 'a', tallerActivoId: null })).resolves.toBe(true);
    await expect(contexto({ tipo: 'taller', sesionId: 's', usuarioId: 'u', tallerId: 't' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('sin sesion el guard responde 401', async () => {
    const ctx = {
      getHandler: () => () => undefined,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
    } as unknown as ExecutionContext;
    const auth = { validar: async () => null } as unknown as AuthService;
    await expect(new AuthGuard(new Reflector(), auth).canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('limite de usuarios por taller', () => {
  it('no deja superar max_usuarios, y se puede ampliar o liberar un cupo', async () => {
    const agregar = (n: number) =>
      admin.query("INSERT INTO usuarios (taller_id, nombre, email, password_hash) VALUES ($1, 'X', $2, 'h')", [
        tallerId,
        `extra${n}-${sufijo}@test.local`,
      ]);

    await agregar(1); // con Ana son 2 = el maximo por defecto
    await expect(agregar(2)).rejects.toThrow(/limite de 2 usuarios/);

    await admin.query('UPDATE talleres SET max_usuarios = 3 WHERE id = $1', [tallerId]);
    await agregar(2);
    await expect(agregar(3)).rejects.toThrow(/limite de 3 usuarios/);

    await admin.query("UPDATE usuarios SET activo = false WHERE email = $1", [`extra1-${sufijo}@test.local`]);
    await agregar(3);
    // Reactivar a alguien cuando el taller esta lleno tambien se rechaza.
    await expect(
      admin.query('UPDATE usuarios SET activo = true WHERE email = $1', [`extra1-${sufijo}@test.local`]),
    ).rejects.toThrow(/limite de 3 usuarios/);
  });
});

describe('permisos del rol de la aplicacion', () => {
  async function comoTallerApp(sql: string) {
    const c = await admin.connect();
    try {
      await c.query('BEGIN');
      await c.query('SET LOCAL ROLE taller_app');
      await c.query("SELECT set_config('app.taller_id', $1, true)", [tallerId]);
      return await c.query(sql);
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  }

  it('no puede leer sesiones ni administradores de la app', async () => {
    await expect(comoTallerApp('SELECT * FROM sesiones')).rejects.toThrow(/permission denied/i);
    await expect(comoTallerApp('SELECT * FROM administradores_app')).rejects.toThrow(/permission denied/i);
  });

  it('no puede leer el hash de contraseña de los usuarios, pero si lo demas', async () => {
    await expect(comoTallerApp('SELECT password_hash FROM usuarios')).rejects.toThrow(/permission denied/i);
    await expect(comoTallerApp('SELECT * FROM usuarios')).rejects.toThrow(/permission denied/i);
    const r = await comoTallerApp('SELECT id, nombre, email, rol, activo FROM usuarios');
    expect(r.rows.length).toBeGreaterThan(0);
  });
});
