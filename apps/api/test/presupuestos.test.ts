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
const sufijo = Math.random().toString(36).slice(2, 7).toUpperCase();
const pool = new Pool({ connectionString: url, max: 2 });
const emailAdmin = `root-${sufijo.toLowerCase()}@test.local`;
const talleresCreados: string[] = [];

interface Cuenta {
  tallerId: string;
  usuarioId: string;
  cookie: string;
}

let app: INestApplication;
let base: string;
let a: Cuenta;
let b: Cuenta;
let cookieAdmin: string;
/** Piezas del taller A por nombre. */
let pieza: Record<string, string>;
let vehiculoA: { id: string; clienteId: string };

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
  const email = `${nombre.toLowerCase()}-${sufijo.toLowerCase()}@test.local`;
  const u = await pool.query(
    'INSERT INTO usuarios (taller_id, nombre, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id',
    [t.rows[0].id, `Dueno ${nombre}`, email, await hashPassword(CLAVE)],
  );
  return { tallerId: t.rows[0].id, usuarioId: u.rows[0].id, cookie: await iniciar(email) };
}

const presupuesto = (cuerpo: object, cuenta: Cuenta = a) => llamar('POST', '/presupuestos', cuenta.cookie, cuerpo);
const conVehiculoA = (lineas: object[], extra: object = {}) => presupuesto({ vehiculoId: vehiculoA.id, lineas, ...extra });
const linea = (nombrePieza: string, extra: object = {}) => ({ piezaId: pieza[nombrePieza], operacion: 'reparar', ...extra });

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

  // Configuracion del taller A: pintura $80.000, margen 25%, anticipo = repuestos, validez 15 dias.
  await llamar('PATCH', '/taller', a.cookie, {
    tarifaPintura: 80000,
    margenRepuestosPct: 25,
    anticipo: { tipo: 'repuestos' },
    validezDias: 15,
    condiciones: 'Condiciones de Alfa',
  });
  await llamar('POST', '/piezas/estandar', a.cookie);
  await llamar('POST', '/piezas/estandar', b.cookie);
  const lista = (await llamar('GET', '/piezas', a.cookie)).json as { id: string; nombre: string }[];
  pieza = Object.fromEntries(lista.map((p) => [p.nombre, p.id]));
  await llamar('PATCH', `/piezas/${pieza['Puerta delantera']}`, a.cookie, { desabolladoSugerido: 60000 });

  const c = await llamar('POST', '/clientes', a.cookie, {
    nombre: 'María José Pérez',
    telefono: '+56 9 8765 4321',
    vehiculo: { patente: `PA${sufijo}`.slice(0, 8), marca: 'Toyota', modelo: 'Yaris', anio: 2019 },
  });
  vehiculoA = { id: c.json.vehiculos[0].id, clienteId: c.json.id };
});

afterAll(async () => {
  await pool.query('DELETE FROM talleres WHERE id = ANY($1)', [talleresCreados]);
  await pool.query('DELETE FROM administradores_app WHERE email = $1', [emailAdmin]);
  await pool.end();
  await app?.close();
});

describe('crear un presupuesto', () => {
  it('calcula en el servidor con la configuracion del taller, numera y guarda en borrador', async () => {
    const r = await conVehiculoA([
      linea('Puerta delantera', { posicion: 'izquierda' }),
      linea('Capot', { operacion: 'reemplazar', repuestoCosto: 200000 }),
    ]);
    expect(r.status).toBe(201);
    const p = r.json;
    expect(p).toMatchObject({
      numero: 1,
      estado: 'borrador',
      cliente: { id: vehiculoA.clienteId, nombre: 'María José Pérez' },
      vehiculo: { id: vehiculoA.id, marca: 'Toyota', modelo: 'Yaris' },
      condiciones: 'Condiciones de Alfa',
      observaciones: null,
      descuento: 0,
    });
    // Puerta: pintura del taller 80.000 + desabollado sugerido 60.000 = 140.000.
    expect(p.lineas[0]).toMatchObject({
      nombre: 'Puerta delantera',
      posicion: 'izquierda',
      operacion: 'reparar',
      pintura: 80000,
      desabollado: 60000,
      repuestoCosto: 0,
      precioTotal: 140000,
    });
    // Capot: pintura 80.000 + repuesto 200.000 con 25% (250.000) = 330.000; no lleva lado.
    expect(p.lineas[1]).toMatchObject({
      nombre: 'Capot',
      posicion: 'no_aplica',
      operacion: 'reemplazar',
      desabollado: 0,
      repuestoCosto: 200000,
      margenPct: 25,
      repuestoPrecio: 250000,
      precioTotal: 330000,
    });
    expect(p).toMatchObject({
      subtotal: 470000,
      total: 470000,
      montoInicio: 250000, // anticipo = repuestos con margen
      costoRepuestos: 200000,
      precioRepuestos: 250000,
      gananciaRepuestos: 50000,
    });
    // Validez: fecha + 15 dias.
    const dias = (Date.parse(p.validoHasta) - Date.parse(p.fecha)) / 86_400_000;
    expect(dias).toBe(15);
  });

  it('ignora cualquier total o precio que mande la pantalla: manda el calculo del servidor', async () => {
    const r = await conVehiculoA([linea('Capot', { precioTotal: 1, total: 1 })], { total: 1, montoInicio: 999, subtotal: 5 });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ total: 80000, subtotal: 80000 });
    expect(r.json.lineas[0].precioTotal).toBe(80000);
  });

  it('numera correlativo por taller, y cada taller parte en 1', async () => {
    const x = await conVehiculoA([linea('Techo')]);
    const y = await conVehiculoA([linea('Techo')]);
    expect(y.json.numero).toBe(x.json.numero + 1);
    const cb = await llamar('POST', '/clientes', b.cookie, { nombre: 'Cliente Beta', telefono: '911112222', vehiculo: { patente: `PB${sufijo}`.slice(0, 8) } });
    const piezasB = (await llamar('GET', '/piezas', b.cookie)).json as { id: string; nombre: string }[];
    const enB = await presupuesto({ vehiculoId: cb.json.vehiculos[0].id, lineas: [{ piezaId: piezasB.find((p) => p.nombre === 'Capot')!.id, operacion: 'reparar' }] }, b);
    expect(enB.status).toBe(201);
    expect(enB.json.numero).toBe(1);
  });

  it('respeta los montos editados en la pantalla (pintura, desabollado, margen)', async () => {
    const r = await conVehiculoA([
      linea('Puerta delantera', { posicion: 'derecha', pintura: 95000, desabollado: 30000 }),
      linea('Capot', { operacion: 'reemplazar', repuestoCosto: 100000, margenPct: 0 }),
    ]);
    expect(r.json.lineas[0]).toMatchObject({ pintura: 95000, desabollado: 30000, precioTotal: 125000 });
    expect(r.json.lineas[1]).toMatchObject({ margenPct: 0, repuestoPrecio: 100000, precioTotal: 180000 });
    expect(r.json.gananciaRepuestos).toBe(0);
  });

  it('acepta items libres y piezas escritas a mano', async () => {
    const r = await conVehiculoA([
      { operacion: 'libre', nombre: 'Pulido de focos', precio: 25000 },
      { operacion: 'reparar', nombre: 'Moldura', desabollado: 10000 },
    ]);
    expect(r.status).toBe(201);
    expect(r.json.lineas[0]).toMatchObject({ nombre: 'Pulido de focos', operacion: 'libre', posicion: 'no_aplica', precioTotal: 25000, piezaId: null });
    expect(r.json.lineas[1]).toMatchObject({ nombre: 'Moldura', pintura: 80000, desabollado: 10000, precioTotal: 90000 });
    expect(r.json.total).toBe(115000);
  });

  it('aplica el descuento y no deja que supere el subtotal', async () => {
    const r = await conVehiculoA([linea('Capot')], { descuento: 5000, observaciones: 'Cliente frecuente', condiciones: 'Solo esta vez' });
    expect(r.json).toMatchObject({ subtotal: 80000, descuento: 5000, total: 75000, observaciones: 'Cliente frecuente', condiciones: 'Solo esta vez' });
    expect((await conVehiculoA([linea('Capot')], { descuento: 80001 })).status).toBe(400);
  });

  it('crea el cliente y el vehiculo nuevos en el mismo paso', async () => {
    const patente = `NV${sufijo}`.slice(0, 8);
    const r = await presupuesto({
      vehiculo: { patente: patente.toLowerCase(), marca: 'Kia', modelo: 'Morning' },
      cliente: { nombre: 'Pedro Nuevo', telefono: '+56 9 1111 2222' },
      lineas: [linea('Capot')],
    });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ cliente: { nombre: 'Pedro Nuevo' }, vehiculo: { patente, marca: 'Kia' } });
    const v = await llamar('GET', `/vehiculos/patente/${patente}`, a.cookie);
    expect(v.json.cliente.nombre).toBe('Pedro Nuevo');
  });

  it('un vehiculo nuevo puede ser de un cliente que ya existe', async () => {
    const r = await presupuesto({ vehiculo: { patente: `CE${sufijo}`.slice(0, 8) }, clienteId: vehiculoA.clienteId, lineas: [linea('Capot')] });
    expect(r.status).toBe(201);
    expect(r.json.cliente.id).toBe(vehiculoA.clienteId);
  });

  it('si algo falla no queda nada a medias, ni se consume un numero', async () => {
    const antes = (await llamar('GET', '/presupuestos', a.cookie)).json[0].numero;
    const patenteNueva = `XX${sufijo}`.slice(0, 8);
    // El vehiculo nuevo usa una patente que ya existe: falla todo, incluido el cliente nuevo.
    const r = await presupuesto({
      vehiculo: { patente: (await llamar('GET', `/vehiculos/${vehiculoA.id}`, a.cookie)).json.patente },
      cliente: { nombre: 'No debe quedar', telefono: '922223333' },
      lineas: [linea('Capot')],
    });
    expect(r.status).toBe(409);
    expect((await llamar('GET', '/clientes?q=No%20debe%20quedar', a.cookie)).json).toEqual([]);
    // Una pieza que no existe: tampoco se crea el vehiculo nuevo.
    const r2 = await presupuesto({
      vehiculo: { patente: patenteNueva },
      cliente: { nombre: 'Tampoco', telefono: '922223333' },
      lineas: [{ piezaId: '00000000-0000-4000-8000-000000000000', operacion: 'reparar' }],
    });
    expect(r2.status).toBe(404);
    expect((await llamar('GET', `/vehiculos/patente/${patenteNueva}`, a.cookie)).status).toBe(404);
    const despues = (await conVehiculoA([linea('Capot')])).json.numero;
    expect(despues).toBe(antes + 1);
  });

  it('deja un registro en el historial de estados', async () => {
    const r = await conVehiculoA([linea('Capot')]);
    const { rows } = await pool.query('SELECT estado, usuario_id FROM historial_estados WHERE presupuesto_id = $1', [r.json.id]);
    expect(rows).toEqual([{ estado: 'borrador', usuario_id: a.usuarioId }]);
  });
});

describe('validaciones', () => {
  it('exige vehiculo, cliente y al menos una linea', async () => {
    expect((await presupuesto({})).status).toBe(400);
    expect((await presupuesto({ vehiculo: { patente: 'ABCD12' }, lineas: [linea('Capot')] })).status).toBe(400); // sin cliente
    expect((await presupuesto({ vehiculoId: vehiculoA.id, lineas: [] })).status).toBe(400);
    expect((await presupuesto({ vehiculoId: vehiculoA.id })).status).toBe(400);
    expect((await presupuesto({ vehiculoId: 'no-es-un-id', lineas: [linea('Capot')] })).status).toBe(400);
    expect((await presupuesto({ vehiculo: { patente: 'AB' }, cliente: { nombre: 'X', telefono: '911112222' }, lineas: [linea('Capot')] })).status).toBe(400);
    expect((await presupuesto({ vehiculo: { patente: 'ABCD99' }, cliente: { nombre: 'X', telefono: '1' }, lineas: [linea('Capot')] })).status).toBe(400);
    expect((await conVehiculoA(Array.from({ length: 51 }, () => linea('Capot')))).status).toBe(400);
    expect((await llamar('POST', '/presupuestos', a.cookie, 'texto')).status).toBe(400);
  });

  it('valida cada linea', async () => {
    const mala = async (l: object) => (await conVehiculoA([l])).status;
    expect(await mala({ operacion: 'pintar', piezaId: pieza['Capot'] })).toBe(400);
    expect(await mala({ piezaId: pieza['Capot'] })).toBe(400); // sin operacion
    expect(await mala(linea('Capot', { pintura: -1 }))).toBe(400);
    expect(await mala(linea('Capot', { pintura: 80000.5 }))).toBe(400);
    expect(await mala(linea('Capot', { desabollado: '60000' }))).toBe(400);
    expect(await mala(linea('Capot', { operacion: 'reemplazar', margenPct: 501 }))).toBe(400);
    expect(await mala(linea('Puerta delantera', { posicion: 'arriba' }))).toBe(400);
    expect(await mala(linea('Puerta delantera'))).toBe(400); // pieza con lado, sin lado
    expect(await mala({ operacion: 'libre', nombre: 'Sin precio' })).toBe(400);
    expect(await mala({ operacion: 'libre', precio: 1000 })).toBe(400); // sin nombre
    expect(await mala({ operacion: 'reparar' })).toBe(400); // ni pieza ni nombre
    expect(await mala({ operacion: 'reparar', piezaId: 'no-es-un-id' })).toBe(400);
  });

  it('una pieza sin lado ignora el lado que le manden', async () => {
    const r = await conVehiculoA([linea('Capot', { posicion: 'izquierda' })]);
    expect(r.json.lineas[0].posicion).toBe('no_aplica');
  });

  it('no deja pasar un total absurdo', async () => {
    const r = await conVehiculoA(Array.from({ length: 30 }, () => linea('Capot', { operacion: 'reemplazar', repuestoCosto: 100_000_000, margenPct: 500 })));
    expect(r.status).toBe(400);
  });
});

describe('anticipo segun la regla del taller', () => {
  const lineas = () => [linea('Capot', { operacion: 'reemplazar', repuestoCosto: 200000 }), linea('Techo')];
  // Subtotal: (80.000 + 250.000) + 80.000 = 410.000; repuestos con margen: 250.000.
  it.each([
    [{ tipo: 'ninguno' }, 0],
    [{ tipo: 'repuestos' }, 250000],
    [{ tipo: 'porcentaje', valor: 50 }, 205000],
    [{ tipo: 'fijo', valor: 100000 }, 100000],
    [{ tipo: 'fijo', valor: 900000 }, 410000], // nunca mas que el total
  ])('%j -> %i', async (anticipo, esperado) => {
    await llamar('PATCH', '/taller', a.cookie, { anticipo });
    const r = await conVehiculoA(lineas());
    expect(r.json.total).toBe(410000);
    expect(r.json.montoInicio).toBe(esperado);
  });

  afterAll(async () => {
    await llamar('PATCH', '/taller', a.cookie, { anticipo: { tipo: 'repuestos' } });
  });
});

describe('la foto de cada linea', () => {
  it('cambiar despues la pieza o las tarifas no altera un presupuesto ya guardado', async () => {
    const r = await conVehiculoA([linea('Espejo', { posicion: 'izquierda' })]);
    await llamar('PATCH', `/piezas/${pieza['Espejo']}`, a.cookie, { nombre: 'Espejo retrovisor', tarifaPintura: 99000 });
    await llamar('PATCH', '/taller', a.cookie, { tarifaPintura: 70000 });
    try {
      const otra = await llamar('GET', `/presupuestos/${r.json.id}`, a.cookie);
      expect(otra.json.lineas[0]).toMatchObject({ nombre: 'Espejo', pintura: 80000, precioTotal: 80000 });
      expect(otra.json.total).toBe(80000);
    } finally {
      await llamar('PATCH', '/taller', a.cookie, { tarifaPintura: 80000 });
      await llamar('PATCH', `/piezas/${pieza['Espejo']}`, a.cookie, { nombre: 'Espejo', tarifaPintura: null });
    }
  });
});

describe('ver, listar y editar', () => {
  it('lista solo los del taller, del mas nuevo al mas antiguo, con cliente y vehiculo', async () => {
    const lista = (await llamar('GET', '/presupuestos', a.cookie)).json as { numero: number; cliente: { nombre: string }; vehiculo: { patente: string } }[];
    expect(lista.length).toBeGreaterThan(3);
    const numeros = lista.map((p) => p.numero);
    expect(numeros).toEqual([...numeros].sort((x, y) => y - x));
    expect(lista.some((p) => p.cliente.nombre === 'María José Pérez')).toBe(true);
    const deB = (await llamar('GET', '/presupuestos', b.cookie)).json;
    expect(deB.every((p: { cliente: { nombre: string } }) => p.cliente.nombre === 'Cliente Beta')).toBe(true);
    expect((await llamar('GET', '/presupuestos?estado=borrador', a.cookie)).json.length).toBe(lista.length);
    expect((await llamar('GET', '/presupuestos?estado=aceptado', a.cookie)).json).toEqual([]);
    expect((await llamar('GET', '/presupuestos?estado=perdido', a.cookie)).status).toBe(400);
  });

  it('edita un borrador: recalcula y conserva el numero', async () => {
    const r = await conVehiculoA([linea('Capot')]);
    const e = await llamar('PUT', `/presupuestos/${r.json.id}`, a.cookie, {
      vehiculoId: vehiculoA.id,
      lineas: [linea('Capot'), linea('Puerta trasera', { posicion: 'izquierda' })],
      descuento: 10000,
    });
    expect(e.status).toBe(200);
    expect(e.json).toMatchObject({ id: r.json.id, numero: r.json.numero, subtotal: 160000, total: 150000 });
    expect(e.json.lineas).toHaveLength(2);
    expect((await llamar('GET', `/presupuestos/${r.json.id}`, a.cookie)).json.total).toBe(150000);
  });

  it('no se puede editar un presupuesto que ya no esta en borrador', async () => {
    const r = await conVehiculoA([linea('Capot')]);
    await pool.query("UPDATE presupuestos SET estado = 'enviado' WHERE id = $1", [r.json.id]);
    const e = await llamar('PUT', `/presupuestos/${r.json.id}`, a.cookie, { vehiculoId: vehiculoA.id, lineas: [linea('Techo')] });
    expect(e.status).toBe(409);
  });

  it('un id mal formado o inexistente da 404', async () => {
    expect((await llamar('GET', '/presupuestos/no-es-un-id', a.cookie)).status).toBe(404);
    expect((await llamar('GET', '/presupuestos/00000000-0000-4000-8000-000000000000', a.cookie)).status).toBe(404);
    expect((await llamar('PUT', '/presupuestos/00000000-0000-4000-8000-000000000000', a.cookie, { vehiculoId: vehiculoA.id, lineas: [linea('Capot')] })).status).toBe(404);
  });
});

describe('aislamiento y acceso', () => {
  it('exige sesion y, al administrador de la app, haber entrado a un taller', async () => {
    expect((await llamar('GET', '/presupuestos')).status).toBe(401);
    await llamar('POST', '/admin/salir-taller', cookieAdmin);
    expect((await llamar('GET', '/presupuestos', cookieAdmin)).status).toBe(400);
  });

  it('otro taller no ve, ni edita, ni usa vehiculos, clientes o piezas ajenas', async () => {
    const r = await conVehiculoA([linea('Capot')]);
    expect((await llamar('GET', `/presupuestos/${r.json.id}`, b.cookie)).status).toBe(404);
    expect((await llamar('PUT', `/presupuestos/${r.json.id}`, b.cookie, { vehiculoId: vehiculoA.id, lineas: [linea('Capot')] })).status).toBe(404);
    const piezasB = (await llamar('GET', '/piezas', b.cookie)).json as { id: string; nombre: string }[];
    const capotB = piezasB.find((p) => p.nombre === 'Capot')!.id;
    // B usando el vehiculo, el cliente o una pieza de A.
    expect((await presupuesto({ vehiculoId: vehiculoA.id, lineas: [{ piezaId: capotB, operacion: 'reparar' }] }, b)).status).toBe(404);
    expect((await presupuesto({ vehiculo: { patente: `ZB${sufijo}`.slice(0, 8) }, clienteId: vehiculoA.clienteId, lineas: [{ piezaId: capotB, operacion: 'reparar' }] }, b)).status).toBe(404);
    const cb = (await llamar('GET', '/clientes', b.cookie)).json[0];
    const vb = (await llamar('GET', `/clientes/${cb.id}`, b.cookie)).json.vehiculos[0];
    expect((await presupuesto({ vehiculoId: vb.id, lineas: [linea('Capot')] }, b)).status).toBe(404);
  });

  it('el administrador de la app, dentro de un taller, crea presupuestos en ese taller (sin autor de taller)', async () => {
    await llamar('POST', `/admin/talleres/${a.tallerId}/entrar`, cookieAdmin);
    try {
      const r = await llamar('POST', '/presupuestos', cookieAdmin, { vehiculoId: vehiculoA.id, lineas: [linea('Capot')] });
      expect(r.status).toBe(201);
      const { rows } = await pool.query('SELECT taller_id, creado_por FROM presupuestos WHERE id = $1', [r.json.id]);
      expect(rows[0]).toEqual({ taller_id: a.tallerId, creado_por: null });
    } finally {
      await llamar('POST', '/admin/salir-taller', cookieAdmin);
    }
  });
});
