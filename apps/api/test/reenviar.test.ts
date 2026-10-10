import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type IncomingMessage, type Server } from 'node:http';
// La funcion de Cloudflare Pages vive en la raiz del repositorio (functions/); se prueba aqui con un servidor falso.
import { reenviar } from '../../../functions/_reenviar';

interface Recibida {
  metodo: string;
  url: string;
  cabeceras: IncomingMessage['headers'];
  cuerpo: string;
}

let servidor: Server;
let urlApi: string;
let ultima: Recibida;
let respuesta: { estado: number; cabeceras: Record<string, string | string[]>; cuerpo: string };

beforeAll(async () => {
  servidor = createServer((req, res) => {
    const partes: Buffer[] = [];
    req.on('data', (c: Buffer) => partes.push(c));
    req.on('end', () => {
      ultima = { metodo: req.method ?? '', url: req.url ?? '', cabeceras: req.headers, cuerpo: Buffer.concat(partes).toString() };
      res.writeHead(respuesta.estado, respuesta.cabeceras);
      res.end(respuesta.cuerpo);
    });
  });
  await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r));
  urlApi = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
});

afterAll(() => new Promise<void>((r) => servidor.close(() => r())));

const ok = (cuerpo = '{"ok":true}', cabeceras: Record<string, string | string[]> = { 'content-type': 'application/json' }) => {
  respuesta = { estado: 200, cabeceras, cuerpo };
};

describe('reenvio de /api al servidor', () => {
  it('quita el prefijo /api y conserva la ruta y los parametros', async () => {
    ok();
    await reenviar(new Request('https://app.test/api/clientes?q=mar%C3%ADa&x=1'), urlApi);
    expect(ultima.url).toBe('/clientes?q=mar%C3%ADa&x=1');
    await reenviar(new Request('https://app.test/api/auth/login'), urlApi);
    expect(ultima.url).toBe('/auth/login');
    await reenviar(new Request('https://app.test/api'), urlApi);
    expect(ultima.url).toBe('/');
  });

  it('no confunde rutas que solo empiezan parecido a /api', async () => {
    ok();
    await reenviar(new Request('https://app.test/apix/algo'), urlApi);
    expect(ultima.url).toBe('/apix/algo');
  });

  it('reenvia el metodo, el cuerpo y las cookies, y entrega la respuesta con su estado', async () => {
    respuesta = { estado: 201, cabeceras: { 'content-type': 'application/json' }, cuerpo: '{"id":"1"}' };
    const r = await reenviar(
      new Request('https://app.test/api/clientes', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: 'taller_sesion=abc', host: 'app.test' },
        body: JSON.stringify({ nombre: 'María' }),
      }),
      urlApi,
    );
    expect(ultima.metodo).toBe('POST');
    expect(ultima.cuerpo).toBe('{"nombre":"María"}');
    expect(ultima.cabeceras.cookie).toBe('taller_sesion=abc');
    expect(ultima.cabeceras['content-type']).toBe('application/json');
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ id: '1' });
  });

  it('no manda al servidor el host de la web, sino el suyo', async () => {
    ok();
    await reenviar(new Request('https://app.test/api/health', { headers: { host: 'app.test' } }), urlApi);
    expect(ultima.cabeceras.host).toBe(urlApi.replace('http://', ''));
  });

  it('devuelve al navegador la cookie de sesion (Set-Cookie) tal como la envio el servidor', async () => {
    const cookie = 'taller_sesion=xyz; Max-Age=1209600; Path=/; HttpOnly; Secure; SameSite=Lax';
    ok('{}', { 'content-type': 'application/json', 'set-cookie': cookie });
    const r = await reenviar(new Request('https://app.test/api/auth/login', { method: 'POST', body: '{}' }), urlApi);
    expect(r.headers.getSetCookie()).toEqual([cookie]);
  });

  it('un GET no lleva cuerpo, y los errores del servidor llegan igual (401, 404)', async () => {
    respuesta = { estado: 401, cabeceras: { 'content-type': 'application/json' }, cuerpo: '{"message":"Sesión no válida"}' };
    const r = await reenviar(new Request('https://app.test/api/auth/me'), urlApi);
    expect(ultima.metodo).toBe('GET');
    expect(ultima.cuerpo).toBe('');
    expect(r.status).toBe(401);
    expect((await r.json()).message).toBe('Sesión no válida');
  });

  it('no sigue las redirecciones: se las entrega tal cual al navegador', async () => {
    respuesta = { estado: 302, cabeceras: { location: 'https://otro.test/' }, cuerpo: '' };
    const r = await reenviar(new Request('https://app.test/api/lo-que-sea'), urlApi);
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('https://otro.test/');
  });

  it('acepta la direccion del servidor con barra final', async () => {
    ok();
    await reenviar(new Request('https://app.test/api/health'), `${urlApi}/`);
    expect(ultima.url).toBe('/health');
  });

  it('el destino sale solo de la configuracion: una ruta rara no cambia de servidor', async () => {
    ok();
    await reenviar(new Request('https://app.test/api//evil.test/x'), urlApi);
    expect(ultima.cabeceras.host).toBe(urlApi.replace('http://', ''));
  });

  it('si el servidor no responde, avisa con un 502 en español', async () => {
    const r = await reenviar(new Request('https://app.test/api/health'), 'http://127.0.0.1:1');
    expect(r.status).toBe(502);
    expect((await r.json()).message).toMatch(/No se pudo contactar al servidor/);
  });

  it('sin API_URL, o con una invalida, avisa con un 500 claro', async () => {
    const sin = await reenviar(new Request('https://app.test/api/health'), undefined);
    expect(sin.status).toBe(500);
    expect((await sin.json()).message).toMatch(/API_URL/);
    const mala = await reenviar(new Request('https://app.test/api/health'), 'esto no es una direccion');
    expect(mala.status).toBe(500);
  });
});
