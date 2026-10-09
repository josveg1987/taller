import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PASSWORD_MIN, passwordValida } from '../auth/password';

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

/** Traduce errores conocidos de PostgreSQL a respuestas HTTP entendibles. */
export function traducirErrorBD(e: unknown): never {
  const err = e as { code?: string; constraint?: string; message?: string };
  if (err.code === '23505' && err.constraint === 'usuarios_email_unico') {
    throw new ConflictException('Ya existe un usuario con ese correo');
  }
  const limite = /limite de (\d+) usuarios/.exec(err.message ?? '');
  if (err.code === '23514' && limite) {
    throw new ConflictException(
      `El taller alcanzó su límite de ${limite[1]} usuarios. Sube el límite o desactiva a otro usuario.`,
    );
  }
  throw e;
}
