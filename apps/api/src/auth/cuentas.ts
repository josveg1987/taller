import { ConflictException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

/**
 * El correo es el identificador de ingreso: no puede repetirse entre usuarios de taller ni
 * administradores de la app. Se consulta con la conexion administrativa porque el rol de la
 * aplicacion no ve a los administradores (ni a los usuarios de otros talleres).
 */
export async function asegurarCorreoLibre(
  db: DatabaseService,
  correo: string,
  excluirUsuarioId?: string,
): Promise<void> {
  const { rows } = await db.admin(
    `SELECT 1 FROM usuarios WHERE lower(email) = lower($1) AND ($2::uuid IS NULL OR id <> $2)
     UNION ALL
     SELECT 1 FROM administradores_app WHERE lower(email) = lower($1)`,
    [correo, excluirUsuarioId ?? null],
  );
  if (rows.length) throw new ConflictException('Ya existe una cuenta con ese correo');
}
