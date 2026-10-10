// Cloudflare Pages Function: todo lo que llegue a /api/* se reenvia a la API (variable API_URL).
import { reenviar } from '../_reenviar';

export const onRequest = ({ request, env }: { request: Request; env: { API_URL?: string } }) =>
  reenviar(request, env.API_URL);
