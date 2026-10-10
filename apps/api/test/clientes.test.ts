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
const sufijo = Math.random().toString(36).slice(2, 8).toUpperCase();
const pool = new Pool({ connectionString: url, max: 2 });
const emailAdmin = `root-${sufijo}@test.local`;

interface Cuenta {
  tallerId: string;
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
  const email = `${nombre.toLowerCase()}-${sufijo}@test.local`;
  await pool.query('INSERT INTO usuarios (taller_id, nombre, email, password_hash) VALUES ($1, $2, $3, $4)', [
    t.rows[0].id,
    `Dueno ${nombre}`,
    email,
    await hashPassword(CLAVE),
  ]);
  return { tallerId: t.rows[0].id, cookie: await iniciar(email) };
}

const cliente = (cuenta: Cuenta, datos: object) => llamar('POST', '/clientes', cuenta.cookie, datos);
const idsDe = (lista: { id: string }[]) => lista.map((c) => c.id);

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

describe('acceso', () => {
  it('exige sesion y, para el administrador de la app, haber entrado a un taller', async () => {
    expect((await llamar('GET', '/clientes')).status).toBe(401);
    expect((await llamar('GET', '/vehiculos/patente/ABCD12')).status).toBe(401);
    await llamar('POST', '/admin/salir-taller', cookieAdmin);
    expect((await llamar('GET', '/clientes', cookieAdmin)).status).toBe(400);
  });

  it('el administrador de la app, dentro de un taller, crea clientes en ese taller', async () => {
    await llamar('POST', `/admin/talleres/${b.tallerId}/entrar`, cookieAdmin);
    try {
      const r = await llamar('POST', '/clientes', cookieAdmin, { nombre: 'Cliente de soporte', telefono: '+56 9 7000 0000' });
      expect(r.status).toBe(201);
      const { rows } = await pool.query('SELECT taller_id FROM clientes WHERE id = $1', [r.json.id]);
      expect(rows[0].taller_id).toBe(b.tallerId);
    } finally {
      await llamar('POST', '/admin/salir-taller', cookieAdmin);
    }
  });
});

describe('crear clientes', () => {
  it('guarda un cliente con solo nombre y telefono', async () => {
    const r = await cliente(a, { nombre: '  Juan Pérez  ', telefono: '+56 9 1234 5678' });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ nombre: 'Juan Pérez', telefono: '+56 9 1234 5678', rut: null, email: null, vehiculos: [] });
  });

  it('exige nombre y telefono validos', async () => {
    const malo = (extra: object) => cliente(a, { nombre: 'X', telefono: '912345678', ...extra });
    expect((await cliente(a, {})).status).toBe(400);
    expect((await malo({ nombre: '  ' })).status).toBe(400);
    expect((await malo({ nombre: 'x'.repeat(121) })).status).toBe(400);
    expect((await malo({ telefono: undefined })).status).toBe(400);
    expect((await malo({ telefono: '12345' })).status).toBe(400);
    expect((await malo({ telefono: 'llamar a juan' })).status).toBe(400);
    expect((await malo({ telefono: 912345678 })).status).toBe(400);
    expect((await llamar('POST', '/clientes', a.cookie, 'texto')).status).toBe(400);
  });

  it('valida y normaliza el RUT (digito verificador, con K y con puntos)', async () => {
    const con = (rut: string) => cliente(a, { nombre: 'Con RUT', telefono: '912345678', rut });
    expect((await con('12.345.678-5')).json.rut).toBe('12345678-5');
    expect((await con('10000013-k')).json.rut).toBe('10000013-K');
    expect((await con('11.111.111-1')).json.rut).toBe('11111111-1');
    expect((await con('12.345.678-9')).status).toBe(400); // digito verificador incorrecto
    expect((await con('abc')).status).toBe(400);
    expect((await con('123')).status).toBe(400);
  });

  it('valida el correo y deja vacios los datos opcionales que vienen en blanco', async () => {
    expect((await cliente(a, { nombre: 'X', telefono: '912345678', email: 'malo' })).status).toBe(400);
    const r = await cliente(a, { nombre: 'Opcionales', telefono: '912345678', email: '', rut: '', direccion: ' ' });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ email: null, rut: null, direccion: null });
    const ok = await cliente(a, { nombre: 'Completo', telefono: '912345678', email: 'c@test.cl', direccion: 'Maipú' });
    expect(ok.json).toMatchObject({ email: 'c@test.cl', direccion: 'Maipú' });
  });

  it('crea el cliente junto con su vehiculo, con la patente normalizada', async () => {
    const r = await cliente(a, {
      nombre: 'Con auto',
      telefono: '911112222',
      vehiculo: { patente: ' ab-cd 12 ', marca: 'Toyota', modelo: 'Yaris', anio: 2018, color: 'Rojo' },
    });
    expect(r.status).toBe(201);
    expect(r.json.vehiculos).toHaveLength(1);
    expect(r.json.vehiculos[0]).toMatchObject({ patente: 'ABCD12', marca: 'Toyota', anio: 2018, clienteId: r.json.id });
  });

  it('si el vehiculo falla, no se crea tampoco el cliente', async () => {
    expect((await cliente(a, { nombre: 'Auto malo', telefono: '911112222', vehiculo: { patente: '!!' } })).status).toBe(400);
    expect((await cliente(a, { nombre: 'Auto sin patente', telefono: '911112222', vehiculo: {} })).status).toBe(400);

    expect((await cliente(a, { nombre: 'Dueño original', telefono: '922223333', vehiculo: { patente: 'DUP123' } })).status).toBe(201);
    const repetido = await cliente(a, { nombre: 'No debe existir', telefono: '922223333', vehiculo: { patente: 'dup-123' } });
    expect(repetido.status).toBe(409);
    expect(repetido.json.message).toMatch(/patente/);
    const lista = await llamar('GET', '/clientes?q=No%20debe%20existir', a.cookie);
    expect(lista.json).toHaveLength(0);
  });
});

describe('buscar clientes', () => {
  beforeAll(async () => {
    await cliente(a, { nombre: 'María José Pérez', telefono: '+56 9 8765 4321', vehiculo: { patente: 'KLMN34', marca: 'Kia' } });
    await cliente(a, { nombre: 'Pedro Soto', telefono: '(2) 2555 0000', vehiculo: { patente: 'WXYZ99' } });
    await cliente(b, { nombre: 'María Beta', telefono: '+56 9 8765 4321', vehiculo: { patente: 'KLMN34' } });
  });

  const buscar = async (q: string, cuenta = a) =>
    (await llamar('GET', `/clientes?q=${encodeURIComponent(q)}`, cuenta.cookie)).json as { id: string; nombre: string }[];
  const nombres = (l: { nombre: string }[]) => l.map((c) => c.nombre);

  it('por nombre, sin distinguir mayusculas ni tildes', async () => {
    expect(nombres(await buscar('maria jose'))).toContain('María José Pérez');
    expect(nombres(await buscar('PEREZ'))).toContain('María José Pérez');
    expect(nombres(await buscar('mar'))).toContain('María José Pérez');
    expect(nombres(await buscar('soto'))).toEqual(['Pedro Soto']);
  });

  it('por telefono, escrito con o sin formato', async () => {
    expect(nombres(await buscar('8765 4321'))).toContain('María José Pérez');
    expect(nombres(await buscar('+56987654321'))).toContain('María José Pérez');
    expect(nombres(await buscar('2555'))).toEqual(['Pedro Soto']);
    // Menos de 3 digitos no se busca en telefonos (evita coincidencias absurdas).
    expect(nombres(await buscar('55'))).not.toContain('Pedro Soto');
  });

  it('por patente (parcial, con guiones o espacios) y muestra todos los vehiculos del cliente', async () => {
    const r = (await buscar('klmn')) as unknown as { nombre: string; vehiculos: { patente: string }[] }[];
    expect(nombres(r)).toEqual(['María José Pérez']);
    expect(r[0].vehiculos.map((v) => v.patente)).toEqual(['KLMN34']);
    expect(nombres(await buscar('wx-yz 99'))).toEqual(['Pedro Soto']);
  });

  it('% y _ se buscan como texto, no como comodines', async () => {
    expect(await buscar('%')).toEqual([]);
    expect(await buscar('_')).toEqual([]);
  });

  it('sin texto devuelve los mas recientes, y sin resultados una lista vacia', async () => {
    const todos = await buscar('');
    expect(todos.length).toBeGreaterThan(3);
    expect(await buscar('zzzz-no-existe')).toEqual([]);
  });

  it('cada taller solo ve a sus clientes aunque se llamen igual', async () => {
    expect(nombres(await buscar('maria', b))).toEqual(['María Beta']);
    expect(nombres(await buscar('maria'))).not.toContain('María Beta');
    expect(nombres(await buscar('8765 4321', b))).toEqual(['María Beta']);
  });
});

describe('ver y editar un cliente', () => {
  it('el detalle trae sus vehiculos ordenados por patente', async () => {
    const c = (await cliente(a, { nombre: 'Dos autos', telefono: '933334444' })).json;
    await llamar('POST', '/vehiculos', a.cookie, { clienteId: c.id, patente: 'ZZZZ11' });
    await llamar('POST', '/vehiculos', a.cookie, { clienteId: c.id, patente: 'AAAA11' });
    const r = await llamar('GET', `/clientes/${c.id}`, a.cookie);
    expect(r.status).toBe(200);
    expect(r.json.vehiculos.map((v: { patente: string }) => v.patente)).toEqual(['AAAA11', 'ZZZZ11']);
  });

  it('edita datos y borra los opcionales enviandolos vacios', async () => {
    const c = (await cliente(a, { nombre: 'Editable', telefono: '944445555', email: 'e@test.cl', rut: '12345678-5' })).json;
    const r = await llamar('PATCH', `/clientes/${c.id}`, a.cookie, { nombre: 'Editado', telefono: '955556666', email: '', rut: null });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ nombre: 'Editado', telefono: '955556666', email: null, rut: null });
    expect((await llamar('PATCH', `/clientes/${c.id}`, a.cookie, {})).status).toBe(200); // sin cambios
    expect((await llamar('PATCH', `/clientes/${c.id}`, a.cookie, { nombre: '' })).status).toBe(400);
    expect((await llamar('PATCH', `/clientes/${c.id}`, a.cookie, { telefono: '1' })).status).toBe(400);
    expect((await llamar('PATCH', `/clientes/${c.id}`, a.cookie, { rut: '1-9' })).status).toBe(400);
  });

  it('un id mal formado o inexistente da 404', async () => {
    expect((await llamar('GET', '/clientes/no-es-un-id', a.cookie)).status).toBe(404);
    expect((await llamar('GET', '/clientes/00000000-0000-4000-8000-000000000000', a.cookie)).status).toBe(404);
    expect((await llamar('PATCH', '/clientes/00000000-0000-4000-8000-000000000000', a.cookie, { nombre: 'x' })).status).toBe(404);
  });
});

describe('vehiculos', () => {
  let duenoA: string;
  let duenoA2: string;
  let ajeno: string; // cliente del taller B

  beforeAll(async () => {
    duenoA = (await cliente(a, { nombre: 'Dueño de vehiculos', telefono: '966667777' })).json.id;
    duenoA2 = (await cliente(a, { nombre: 'Otro dueño', telefono: '977778888' })).json.id;
    ajeno = (await cliente(b, { nombre: 'Cliente ajeno', telefono: '988889999' })).json.id;
  });

  const crear = (extra: object, cuenta = a) => llamar('POST', '/vehiculos', cuenta.cookie, { clienteId: duenoA, ...extra });

  it('agrega un vehiculo a un cliente', async () => {
    const r = await crear({ patente: 'ab 12 cd', marca: ' Suzuki ', modelo: 'Swift', anio: 2020, color: 'Azul' });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ clienteId: duenoA, patente: 'AB12CD', marca: 'Suzuki', modelo: 'Swift', anio: 2020 });
  });

  it('valida patente, año y cliente', async () => {
    expect((await crear({})).status).toBe(400);
    expect((await crear({ patente: '' })).status).toBe(400);
    expect((await crear({ patente: 'AB' })).status).toBe(400);
    expect((await crear({ patente: 'ABCD-12-34-56' })).status).toBe(400);
    expect((await crear({ patente: 'ñandú1' })).status).toBe(400);
    expect((await crear({ patente: 'VAL001', anio: 1800 })).status).toBe(400);
    expect((await crear({ patente: 'VAL002', anio: 2020.5 })).status).toBe(400);
    expect((await crear({ patente: 'VAL003', marca: 'x'.repeat(61) })).status).toBe(400);
    expect((await llamar('POST', '/vehiculos', a.cookie, { patente: 'VAL004' })).status).toBe(400); // sin cliente
    expect((await crear({ patente: 'VAL005', clienteId: 'no-es-un-id' })).status).toBe(404);
    expect((await crear({ patente: 'VAL006', clienteId: '00000000-0000-4000-8000-000000000000' })).status).toBe(404);
  });

  it('no repite patentes dentro de un taller, pero otro taller puede tener la misma', async () => {
    expect((await crear({ patente: 'REP111' })).status).toBe(201);
    const otra = await crear({ patente: 'rep-111', clienteId: duenoA2 });
    expect(otra.status).toBe(409);
    expect(otra.json.message).toMatch(/Ya existe un vehículo con esa patente/);
    expect((await crear({ patente: 'REP111', clienteId: ajeno }, b)).status).toBe(201);
  });

  it('se busca por patente exacta (con cualquier formato) y devuelve a su dueño', async () => {
    await crear({ patente: 'FIN222', marca: 'Mazda' });
    const r = await llamar('GET', '/vehiculos/patente/fin-222', a.cookie);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ patente: 'FIN222', marca: 'Mazda', cliente: { id: duenoA, nombre: 'Dueño de vehiculos' } });
    expect((await llamar('GET', '/vehiculos/patente/NOEXISTE', a.cookie)).status).toBe(404);
    expect((await llamar('GET', '/vehiculos/patente/!!', a.cookie)).status).toBe(400);
  });

  it('un taller no ve, ni usa, ni modifica los vehiculos y clientes de otro', async () => {
    const ajenoVeh = (await llamar('POST', '/vehiculos', b.cookie, { clienteId: ajeno, patente: 'AJE333' })).json;
    expect((await llamar('GET', '/vehiculos/patente/AJE333', a.cookie)).status).toBe(404);
    expect((await llamar('GET', `/vehiculos/${ajenoVeh.id}`, a.cookie)).status).toBe(404);
    expect((await llamar('PATCH', `/vehiculos/${ajenoVeh.id}`, a.cookie, { marca: 'Hackeada' })).status).toBe(404);
    expect((await crear({ patente: 'INT444', clienteId: ajeno })).status).toBe(404); // dueño de otro taller
    expect((await llamar('GET', `/clientes/${ajeno}`, a.cookie)).status).toBe(404);
    expect((await llamar('PATCH', `/clientes/${ajeno}`, a.cookie, { nombre: 'Hackeado' })).status).toBe(404);
    const { rows } = await pool.query('SELECT marca FROM vehiculos WHERE id = $1', [ajenoVeh.id]);
    expect(rows[0].marca).toBeNull();
  });

  it('edita un vehiculo, borra opcionales y cambia de dueño solo dentro del taller', async () => {
    const v = (await crear({ patente: 'EDI555', marca: 'Fiat', anio: 2015 })).json;
    const r = await llamar('PATCH', `/vehiculos/${v.id}`, a.cookie, { marca: '', modelo: 'Uno', anio: null, patente: 'edi-556' });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ patente: 'EDI556', marca: null, modelo: 'Uno', anio: null });

    const cambio = await llamar('PATCH', `/vehiculos/${v.id}`, a.cookie, { clienteId: duenoA2 });
    expect(cambio.json.cliente.id).toBe(duenoA2);
    // El dueño anterior ya no lo tiene.
    const anterior = await llamar('GET', `/clientes/${duenoA}`, a.cookie);
    expect(anterior.json.vehiculos.map((x: { id: string }) => x.id)).not.toContain(v.id);

    expect((await llamar('PATCH', `/vehiculos/${v.id}`, a.cookie, { clienteId: ajeno })).status).toBe(404);
    expect((await llamar('PATCH', `/vehiculos/${v.id}`, a.cookie, { patente: 'REP111' })).status).toBe(409);
    expect((await llamar('PATCH', `/vehiculos/${v.id}`, a.cookie, { anio: 3000 })).status).toBe(400);
    expect((await llamar('PATCH', '/vehiculos/00000000-0000-4000-8000-000000000000', a.cookie, { marca: 'x' })).status).toBe(404);
    expect((await llamar('GET', '/vehiculos/no-es-un-id', a.cookie)).status).toBe(404);
  });
});
