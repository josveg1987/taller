import { randomBytes, scrypt as scryptCb, ScryptOptions, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  largo: number,
  opciones: ScryptOptions,
) => Promise<Buffer>;

// scrypt viene con Node (sin dependencias). Los parametros van dentro del hash, asi se pueden
// endurecer mas adelante sin invalidar las contrasenas ya guardadas.
const N = 16384;
const R = 8;
const P = 1;
const LARGO = 64;

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

export function passwordValida(p: unknown): p is string {
  return typeof p === 'string' && p.length >= PASSWORD_MIN && p.length <= PASSWORD_MAX;
}

/** Formato: scrypt$N$r$p$salt$hash (salt y hash en base64). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, LARGO, { N, r: R, p: P });
  return ['scrypt', N, R, P, salt.toString('base64'), hash.toString('base64')].join('$');
}

export async function verifyPassword(password: string, guardado: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = guardado.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const esperado = Buffer.from(hash, 'base64');
  try {
    const actual = await scrypt(password, Buffer.from(salt, 'base64'), esperado.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return actual.length === esperado.length && timingSafeEqual(actual, esperado);
  } catch {
    return false;
  }
}
