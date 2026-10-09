import { BadRequestException } from '@nestjs/common';

/** Quien hace la peticion, ya validado a partir de la cookie de sesion. */
export type Contexto =
  | {
      tipo: 'admin_app';
      sesionId: string;
      adminId: string;
      /** Taller en el que el administrador de la app esta "entrado" (null si ninguno). */
      tallerActivoId: string | null;
    }
  | { tipo: 'taller'; sesionId: string; usuarioId: string; tallerId: string };

/** Lo minimo que se usa de la peticion HTTP (evita depender de los tipos de express). */
export interface Solicitud {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  contexto?: Contexto;
}

export interface Respuesta {
  cookie(nombre: string, valor: string, opciones: Record<string, unknown>): void;
  clearCookie(nombre: string, opciones: Record<string, unknown>): void;
}

/**
 * Taller sobre el que operan las consultas de negocio. Un usuario de taller siempre opera en el
 * suyo; el administrador de la app debe haber entrado antes a un taller.
 */
export function tallerIdDe(c: Contexto): string {
  if (c.tipo === 'taller') return c.tallerId;
  if (c.tallerActivoId) return c.tallerActivoId;
  throw new BadRequestException('Elige primero un taller');
}
