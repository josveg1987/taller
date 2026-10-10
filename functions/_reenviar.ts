// Reenvia las llamadas de la web (/api/...) al servidor (API en Render). Asi el navegador habla con UN solo
// sitio (el de Cloudflare Pages): la cookie de sesion es de ese sitio y funciona en Brave, Safari y Chrome,
// sin necesidad de comprar un dominio propio. Ver "Cloudflare Pages Functions" en el CLAUDE.md.
//
// Este archivo no es una ruta (no exporta onRequest): lo usa functions/api/[[ruta]].ts y los tests.

const SIN_CUERPO = new Set(['GET', 'HEAD']);

function json(estado: number, mensaje: string): Response {
  return new Response(JSON.stringify({ message: mensaje }), {
    status: estado,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Pasa la peticion a `apiUrl` quitando el prefijo /api ("/api/auth/login?x=1" -> "/auth/login?x=1").
 * Conserva metodo, cuerpo, cookies y la respuesta completa (incluida Set-Cookie). El destino sale
 * siempre de `apiUrl` (configuracion), nunca de lo que envie el visitante.
 */
export async function reenviar(
  peticion: Request,
  apiUrl: string | undefined,
  enviar: typeof fetch = fetch,
): Promise<Response> {
  if (!apiUrl) return json(500, 'Falta configurar API_URL en Cloudflare Pages');

  let destino: URL;
  try {
    const entrada = new URL(peticion.url);
    destino = new URL(apiUrl);
    destino.pathname = entrada.pathname.replace(/^\/api(?=\/|$)/, '') || '/';
    destino.search = entrada.search;
  } catch {
    return json(500, 'API_URL no es una dirección válida');
  }

  const cabeceras = new Headers(peticion.headers);
  cabeceras.delete('host'); // la toma del destino

  try {
    return await enviar(
      new Request(destino, {
        method: peticion.method,
        headers: cabeceras,
        body: SIN_CUERPO.has(peticion.method) ? undefined : await peticion.arrayBuffer(),
        redirect: 'manual', // un redireccionamiento se le entrega tal cual al navegador
      }),
    );
  } catch {
    return json(502, 'No se pudo contactar al servidor. Si estaba dormido, espera un minuto e inténtalo de nuevo.');
  }
}
