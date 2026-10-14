import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import type { INestApplication } from '@nestjs/common';
import { DETALLE_DESABOLLADO_ESTANDAR, DETALLE_PINTURA_ESTANDAR } from '@taller/shared';
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

  const emailAdmin = `root-cs-${sufijo}@test.local`;
  const r = await pool.query("INSERT INTO administradores_app (nombre, email, password_hash) VALUES ('Root', $1, $2) RETURNING id", [emailAdmin, await hashPassword(CLAVE)]);
  adminId = r.rows[0].id;
  cookieAdmin = await entrar(emailAdmin);
  a = await crearTaller('Alfa');
  b = await crearTaller('Beta');
});

afterAll(async () => {
  await pool.query('DELETE FROM sesiones WHERE usuario_id IN (SELECT id FROM usuarios WHERE taller_id = ANY($1)) OR admin_id = $2', [talleres, adminId]);
  await pool.query('DELETE FROM usuarios WHERE taller_id = ANY($1)', [talleres]);
  await pool.query('DELETE FROM talleres WHERE id = ANY($1)', [talleres]);
  await pool.query('DELETE FROM administradores_app WHERE id = $1', [adminId]);
  await pool.end();
  await app.close();
});

const falabella = { titular: 'Luis humberto Vega', rut: '126474199', banco: 'Banco Falabella', tipoCuenta: 'corriente', numero: '1-980-432549-6', email: 'luisvega1912@gmail.com' };
const mercadoPago = { titular: 'Luis Humberto Vega Pozo', rut: '12.647.419-9', banco: 'Mercado Pago', tipoCuenta: 'vista', numero: '1003355333', email: 'luisvega1912@gmail.com' };

describe('cuentas para transferir', () => {
  let idFalabella: string;
  let idMercado: string;

  it('crea varias cuentas (RUT normalizado), en orden, y las lista', async () => {
    const r1 = await llamar('POST', '/cuentas', a.cookie, falabella);
    expect(r1.status).toBe(201);
    expect(r1.json).toMatchObject({ titular: 'Luis humberto Vega', rut: '12647419-9', banco: 'Banco Falabella', tipoCuenta: 'corriente', numero: '1-980-432549-6', activa: true, orden: 1 });
    idFalabella = r1.json.id;
    const r2 = await llamar('POST', '/cuentas', a.cookie, mercadoPago);
    expect(r2.json).toMatchObject({ rut: '12647419-9', tipoCuenta: 'vista', orden: 2 });
    idMercado = r2.json.id;
    const lista = (await llamar('GET', '/cuentas', a.cookie)).json as { id: string }[];
    expect(lista.map((c) => c.id)).toEqual([idFalabella, idMercado]);
  });

  it('el correo es opcional y se valida', async () => {
    const sinCorreo = await llamar('POST', '/cuentas', a.cookie, { ...falabella, email: undefined, numero: '555-1' });
    expect(sinCorreo.status).toBe(201);
    expect(sinCorreo.json.email).toBeNull();
    await llamar('DELETE', `/cuentas/${sinCorreo.json.id}`, a.cookie);
    expect((await llamar('POST', '/cuentas', a.cookie, { ...falabella, email: 'no-es-correo' })).status).toBe(400);
  });

  it('rechaza datos mal formados', async () => {
    const malos: object[] = [
      { ...falabella, titular: '' },
      { ...falabella, rut: '12.345.678-0' }, // digito verificador incorrecto
      { ...falabella, banco: '   ' },
      { ...falabella, tipoCuenta: 'ahorros-raros' },
      { ...falabella, numero: 'abc' },
      { ...falabella, numero: '12' },
      { ...falabella, numero: '1'.repeat(31) },
    ];
    for (const m of malos) expect((await llamar('POST', '/cuentas', a.cookie, m)).status, JSON.stringify(m)).toBe(400);
    expect((await llamar('POST', '/cuentas', a.cookie, 'texto')).status).toBe(400);
  });

  it('edita, desactiva (sale de la lista por defecto), reordena y elimina', async () => {
    const e = await llamar('PATCH', `/cuentas/${idMercado}`, a.cookie, { titular: 'Otro Titular', numero: '999-9' });
    expect(e.json).toMatchObject({ titular: 'Otro Titular', numero: '999-9' });
    expect((await llamar('PATCH', `/cuentas/${idMercado}`, a.cookie, { rut: '1-9' })).status).toBe(400);

    expect((await llamar('PATCH', `/cuentas/${idFalabella}`, a.cookie, { activa: false })).json.activa).toBe(false);
    expect(((await llamar('GET', '/cuentas', a.cookie)).json as { id: string }[]).map((c) => c.id)).toEqual([idMercado]);
    expect(((await llamar('GET', '/cuentas?todas=1', a.cookie)).json as { id: string }[]).length).toBe(2);
    await llamar('PATCH', `/cuentas/${idFalabella}`, a.cookie, { activa: true });

    const movida = (await llamar('POST', `/cuentas/${idMercado}/mover`, a.cookie, { direccion: 'arriba' })).json as { id: string }[];
    expect(movida.map((c) => c.id)).toEqual([idMercado, idFalabella]);
    expect((await llamar('POST', `/cuentas/${idMercado}/mover`, a.cookie, { direccion: 'lado' })).status).toBe(400);

    expect((await llamar('DELETE', `/cuentas/${idMercado}`, a.cookie)).status).toBe(204);
    expect((await llamar('DELETE', `/cuentas/${idMercado}`, a.cookie)).status).toBe(404);
    expect((await llamar('PATCH', `/cuentas/${idMercado}`, a.cookie, { titular: 'x' })).status).toBe(404);
  });

  it('cada taller ve solo las suyas; sin sesion no se accede; maximo 10', async () => {
    expect((await llamar('GET', '/cuentas?todas=1', b.cookie)).json).toEqual([]);
    expect((await llamar('PATCH', `/cuentas/${idFalabella}`, b.cookie, { titular: 'hack' })).status).toBe(404);
    expect((await llamar('DELETE', `/cuentas/${idFalabella}`, b.cookie)).status).toBe(404);
    expect((await llamar('GET', '/cuentas')).status).toBe(401);
    expect((await llamar('POST', '/cuentas', undefined, falabella)).status).toBe(401);

    for (let i = 0; i < 9; i++) expect((await llamar('POST', '/cuentas', b.cookie, { ...falabella, numero: `100${i}` })).status).toBe(201);
    expect((await llamar('POST', '/cuentas', b.cookie, { ...falabella, numero: '9999' })).status).toBe(201); // la 10
    expect((await llamar('POST', '/cuentas', b.cookie, { ...falabella, numero: '11111' })).status).toBe(400); // la 11
  });

  it('la base aisla las cuentas aunque se consulte directo con el rol de la aplicacion', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query('SET LOCAL ROLE taller_app');
      await c.query("SELECT set_config('app.taller_id', $1, true)", [b.tallerId]);
      const { rows } = await c.query('SELECT DISTINCT taller_id FROM cuentas_bancarias');
      expect(rows.map((r) => r.taller_id)).toEqual([b.tallerId]);
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  });
});

describe('servicios (pulido y otros)', () => {
  it('un taller nuevo recibe la plantilla (pulido general y de focos), sin precio', async () => {
    const lista = (await llamar('GET', '/servicios', a.cookie)).json as { nombre: string; precioSugerido: number | null; descripcion: string | null; activo: boolean }[];
    expect(lista.map((s) => s.nombre)).toEqual(['Pulido general del auto', 'Pulido de focos']);
    expect(lista.every((s) => s.precioSugerido === null && s.activo && !!s.descripcion)).toBe(true);
  });

  let id: string;
  it('crea, edita (precio y descripcion), desactiva y elimina', async () => {
    const r = await llamar('POST', '/servicios', a.cookie, { nombre: 'Lavado completo', precioSugerido: 15000, descripcion: 'Lavado exterior e interior.' });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ nombre: 'Lavado completo', precioSugerido: 15000, descripcion: 'Lavado exterior e interior.', activo: true });
    id = r.json.id;
    expect((await llamar('POST', '/servicios', a.cookie, { nombre: 'lavado completo' })).status).toBe(201); // el nombre distingue mayusculas: otro servicio
    expect((await llamar('POST', '/servicios', a.cookie, { nombre: 'Lavado completo' })).status).toBe(409); // repetido
    const sin = await llamar('POST', '/servicios', a.cookie, { nombre: 'Polarizado' });
    expect(sin.json).toMatchObject({ precioSugerido: null, descripcion: null });

    const e = await llamar('PATCH', `/servicios/${id}`, a.cookie, { precioSugerido: 20000, descripcion: null });
    expect(e.json).toMatchObject({ precioSugerido: 20000, descripcion: null });
    expect((await llamar('PATCH', `/servicios/${id}`, a.cookie, { precioSugerido: null })).json.precioSugerido).toBeNull();
    expect((await llamar('PATCH', `/servicios/${id}`, a.cookie, { activo: false })).json.activo).toBe(false);
    expect(((await llamar('GET', '/servicios', a.cookie)).json as { id: string }[]).map((s) => s.id)).not.toContain(id);
    expect(((await llamar('GET', '/servicios?todos=1', a.cookie)).json as { id: string }[]).map((s) => s.id)).toContain(id);
  });

  it('valida los datos, reordena y elimina', async () => {
    for (const malo of [{ nombre: '' }, { nombre: 'X', precioSugerido: -1 }, { nombre: 'X', precioSugerido: 1.5 }, { nombre: 'X', descripcion: 'x'.repeat(301) }]) {
      expect((await llamar('POST', '/servicios', a.cookie, malo)).status, JSON.stringify(malo)).toBe(400);
    }
    const antes = ((await llamar('GET', '/servicios?todos=1', a.cookie)).json as { id: string }[]).map((s) => s.id);
    const despues = ((await llamar('POST', `/servicios/${antes[1]}/mover`, a.cookie, { direccion: 'arriba' })).json as { id: string }[]).map((s) => s.id);
    expect(despues.slice(0, 2)).toEqual([antes[1], antes[0]]);
    expect((await llamar('DELETE', `/servicios/${id}`, a.cookie)).status).toBe(204);
    expect((await llamar('DELETE', `/servicios/${id}`, a.cookie)).status).toBe(404);
  });

  it('"agregar los estandar" repone los que falten sin duplicar ni pisar cambios', async () => {
    const lista = (await llamar('GET', '/servicios?todos=1', a.cookie)).json as { id: string; nombre: string }[];
    const focos = lista.find((s) => s.nombre === 'Pulido de focos')!;
    await llamar('PATCH', `/servicios/${focos.id}`, a.cookie, { precioSugerido: 30000 });
    await llamar('DELETE', `/servicios/${lista.find((s) => s.nombre === 'Pulido general del auto')!.id}`, a.cookie);
    const r = await llamar('POST', '/servicios/estandar', a.cookie);
    expect(r.json.agregados).toBe(1);
    const despues = r.json.servicios as { nombre: string; precioSugerido: number | null }[];
    expect(despues.filter((s) => s.nombre === 'Pulido de focos')).toHaveLength(1);
    expect(despues.find((s) => s.nombre === 'Pulido de focos')!.precioSugerido).toBe(30000); // no se pisa
    expect((await llamar('POST', '/servicios/estandar', a.cookie)).json.agregados).toBe(0);
  });

  it('cada taller ve solo los suyos; sin sesion no se accede', async () => {
    const deB = ((await llamar('GET', '/servicios?todos=1', b.cookie)).json as { nombre: string }[]).map((s) => s.nombre);
    expect(deB).toEqual(['Pulido general del auto', 'Pulido de focos']);
    const idA = ((await llamar('GET', '/servicios?todos=1', a.cookie)).json as { id: string }[])[0].id;
    expect((await llamar('PATCH', `/servicios/${idA}`, b.cookie, { nombre: 'hack' })).status).toBe(404);
    expect((await llamar('DELETE', `/servicios/${idA}`, b.cookie)).status).toBe(404);
    expect((await llamar('GET', '/servicios')).status).toBe(401);
  });
});

describe('detalle del trabajo (configuracion del taller)', () => {
  it('parte con el texto estandar', async () => {
    const t = (await llamar('GET', '/taller', a.cookie)).json;
    expect(t.detallePintura).toBe(DETALLE_PINTURA_ESTANDAR);
    expect(t.detalleDesabollado).toBe(DETALLE_DESABOLLADO_ESTANDAR);
  });

  it('el taller lo cambia; vacio o igual al estandar vuelve al estandar; se guarda null en la base', async () => {
    const propio = 'Lijar\nPintar\nBarnizar';
    expect((await llamar('PATCH', '/taller', a.cookie, { detallePintura: propio })).json.detallePintura).toBe(propio);
    expect((await pool.query('SELECT detalle_pintura FROM talleres WHERE id = $1', [a.tallerId])).rows[0].detalle_pintura).toBe(propio);
    // El otro detalle no cambia.
    expect((await llamar('GET', '/taller', a.cookie)).json.detalleDesabollado).toBe(DETALLE_DESABOLLADO_ESTANDAR);
    // Vacio: vuelve al estandar.
    expect((await llamar('PATCH', '/taller', a.cookie, { detallePintura: '' })).json.detallePintura).toBe(DETALLE_PINTURA_ESTANDAR);
    expect((await pool.query('SELECT detalle_pintura FROM talleres WHERE id = $1', [a.tallerId])).rows[0].detalle_pintura).toBeNull();
    // Igual al estandar: tambien null.
    await llamar('PATCH', '/taller', a.cookie, { detalleDesabollado: `${DETALLE_DESABOLLADO_ESTANDAR}\n` });
    expect((await pool.query('SELECT detalle_desabollado FROM talleres WHERE id = $1', [a.tallerId])).rows[0].detalle_desabollado).toBeNull();
    expect((await llamar('PATCH', '/taller', a.cookie, { detallePintura: 'x'.repeat(1501) })).status).toBe(400);
  });

  it('un taller no ve ni cambia el detalle de otro', async () => {
    await llamar('PATCH', '/taller', a.cookie, { detallePintura: 'Solo de Alfa' });
    expect((await llamar('GET', '/taller', b.cookie)).json.detallePintura).toBe(DETALLE_PINTURA_ESTANDAR);
  });
});
