import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PASSWORD_MIN, passwordValida } from './auth/password';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Un id mal formado se trata como "no existe" (evita un error 500 de la base). */
export function idValido(v: string): string {
  if (!UUID.test(v)) throw new NotFoundException('No encontrado');
  return v;
}

export function cuerpo(v: unknown): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new BadRequestException('Datos inválidos');
  return v as Record<string, unknown>;
}

export function texto(v: unknown, campo: string, max = 120): string {
  if (typeof v !== 'string' || !v.trim()) throw new BadRequestException(`${campo} es obligatorio`);
  if (v.trim().length > max) throw new BadRequestException(`${campo} es demasiado largo (máximo ${max})`);
  return v.trim();
}

export function email(v: unknown): string {
  const e = texto(v, 'El correo', 254);
  if (!EMAIL.test(e)) throw new BadRequestException('El correo no es válido');
  return e;
}

export function password(v: unknown): string {
  if (!passwordValida(v)) {
    throw new BadRequestException(`La contraseña debe tener al menos ${PASSWORD_MIN} caracteres`);
  }
  return v;
}

export function entero(v: unknown, campo: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
    throw new BadRequestException(`${campo} debe ser un número entero entre ${min} y ${max}`);
  }
  return v;
}

export function booleano(v: unknown, campo: string): boolean {
  if (typeof v !== 'boolean') throw new BadRequestException(`${campo} debe ser verdadero o falso`);
  return v;
}

/** Texto opcional: vacio o null borra el valor (devuelve null). */
export function textoOpcional(v: unknown, campo: string, max: number): string | null {
  if (v === null || (typeof v === 'string' && !v.trim())) return null;
  if (typeof v !== 'string') throw new BadRequestException(`${campo} debe ser texto`);
  if (v.trim().length > max) throw new BadRequestException(`${campo} es demasiado largo (máximo ${max})`);
  return v.trim();
}

/** Numero con hasta 2 decimales dentro de un rango. */
export function decimal(v: unknown, campo: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || Math.round(v * 100) / 100 !== v) {
    throw new BadRequestException(`${campo} debe ser un número entre ${min} y ${max} (hasta 2 decimales)`);
  }
  return v;
}

export function opcion<T extends string>(v: unknown, campo: string, validas: readonly T[]): T {
  if (typeof v !== 'string' || !(validas as readonly string[]).includes(v)) {
    throw new BadRequestException(`${campo} no es válido`);
  }
  return v as T;
}

/** Campo opcional: ausente = sin cambio (undefined); vacio o null = borrar (null); si no, se valida. */
export function opcional<T>(v: unknown, validar: (x: unknown) => T): T | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || (typeof v === 'string' && !v.trim())) return null;
  return validar(v);
}

/** Patente normalizada: mayusculas, sin espacios, guiones ni puntos (ej. "ab-cd 12" -> "ABCD12"). */
export function normalizarPatente(v: string): string {
  return v.toUpperCase().replace(/[\s.\-]/g, '');
}

export function patente(v: unknown): string {
  if (typeof v !== 'string' || !v.trim()) throw new BadRequestException('La patente es obligatoria');
  const p = normalizarPatente(v);
  if (!/^[A-Z0-9]{4,8}$/.test(p)) throw new BadRequestException('La patente no es válida (de 4 a 8 letras o números)');
  return p;
}

export function telefono(v: unknown): string {
  const t = texto(v, 'El teléfono', 20);
  if (!/^[0-9+()\-\s.]+$/.test(t) || t.replace(/\D/g, '').length < 6) {
    throw new BadRequestException('El teléfono no es válido');
  }
  return t;
}

/** RUT chileno con digito verificador (modulo 11). Se guarda como "12345678-9". */
export function rut(v: unknown): string {
  const limpio = texto(v, 'El RUT', 20).replace(/[.\-\s]/g, '').toUpperCase();
  const m = /^(\d{6,9})([0-9K])$/.exec(limpio);
  if (m) {
    let suma = 0;
    [...m[1]].reverse().forEach((d, i) => (suma += Number(d) * ((i % 6) + 2)));
    const r = 11 - (suma % 11);
    const dv = r === 11 ? '0' : r === 10 ? 'K' : String(r);
    if (dv === m[2]) return `${m[1]}-${m[2]}`;
  }
  throw new BadRequestException('El RUT no es válido');
}

/** Escapa % y _ para usar texto del usuario dentro de un LIKE. */
export function escaparLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Traduce errores conocidos de PostgreSQL a respuestas HTTP entendibles. */
export function traducirErrorBD(e: unknown): never {
  const err = e as { code?: string; constraint?: string; message?: string };
  if (err.code === '23505' && err.constraint === 'usuarios_email_unico') {
    throw new ConflictException('Ya existe un usuario con ese correo');
  }
  if (err.code === '23505' && err.constraint === 'vehiculos_taller_id_patente_key') {
    throw new ConflictException('Ya existe un vehículo con esa patente');
  }
  const limite = /limite de (\d+) usuarios/.exec(err.message ?? '');
  if (err.code === '23514' && limite) {
    throw new ConflictException(
      `El taller alcanzó su límite de ${limite[1]} usuarios. Sube el límite o desactiva a otro usuario.`,
    );
  }
  throw e;
}
