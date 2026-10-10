import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { Contexto } from './contexto';
import { hashPassword, verifyPassword } from './password';

export const SESION_DIAS = 14;

const sha256 = (t: string) => createHash('sha256').update(t).digest('hex');

export interface Perfil {
  tipo: 'admin_app' | 'taller';
  /** Id del usuario (o del administrador de la app). */
  id: string;
  nombre: string;
  email: string;
  taller: { id: string; nombre: string } | null;
  /** true si la cuenta tiene una contrasena temporal: debe cambiarla antes de usar la app. */
  debeCambiarPassword: boolean;
}

@Injectable()
export class AuthService {
  // Hash de relleno: si el email no existe igual se calcula uno, para no delatar por tiempo
  // que cuentas existen.
  private readonly hashFalso = hashPassword('relleno-sin-uso');

  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  /** Devuelve el token de sesion (para la cookie) o null si las credenciales no sirven. */
  async login(email: string, password: string): Promise<{ token: string; expiraEn: Date } | null> {
    const admin = await this.db.admin<{ id: string; password_hash: string; activo: boolean }>(
      'SELECT id, password_hash, activo FROM administradores_app WHERE lower(email) = lower($1)',
      [email],
    );
    if (admin.rows[0]) {
      const a = admin.rows[0];
      const ok = await verifyPassword(password, a.password_hash);
      return ok && a.activo ? this.crearSesion({ adminId: a.id }) : null;
    }

    const usuario = await this.db.admin<{
      id: string;
      password_hash: string;
      activo: boolean;
      taller_activo: boolean;
    }>(
      `SELECT u.id, u.password_hash, u.activo, t.activo AS taller_activo
         FROM usuarios u JOIN talleres t ON t.id = u.taller_id
        WHERE lower(u.email) = lower($1)`,
      [email],
    );
    const u = usuario.rows[0];
    if (!u) {
      await verifyPassword(password, await this.hashFalso);
      return null;
    }
    const ok = await verifyPassword(password, u.password_hash);
    return ok && u.activo && u.taller_activo ? this.crearSesion({ usuarioId: u.id }) : null;
  }

  private async crearSesion(quien: { adminId: string } | { usuarioId: string }) {
    const token = randomBytes(32).toString('base64url');
    const expiraEn = new Date(Date.now() + SESION_DIAS * 24 * 60 * 60 * 1000);
    // Limpieza de sesiones vencidas aprovechando el login (evita un proceso aparte).
    await this.db.admin('DELETE FROM sesiones WHERE expira_en < now()');
    await this.db.admin(
      'INSERT INTO sesiones (token_hash, usuario_id, admin_id, expira_en) VALUES ($1, $2, $3, $4)',
      [
        sha256(token),
        'usuarioId' in quien ? quien.usuarioId : null,
        'adminId' in quien ? quien.adminId : null,
        expiraEn,
      ],
    );
    return { token, expiraEn };
  }

  /**
   * Valida el token en cada peticion y revisa que la cuenta (y el taller) sigan activos, asi
   * desactivar a alguien corta su sesion de inmediato.
   */
  async validar(token: string): Promise<Contexto | null> {
    const { rows } = await this.db.admin<{
      id: string;
      usuario_id: string | null;
      admin_id: string | null;
      taller_activo_id: string | null;
      taller_id: string | null;
      usuario_activo: boolean | null;
      taller_activo: boolean | null;
      admin_activo: boolean | null;
    }>(
      `SELECT s.id, s.usuario_id, s.admin_id, s.taller_activo_id, u.taller_id,
              u.activo AS usuario_activo, t.activo AS taller_activo, a.activo AS admin_activo
         FROM sesiones s
         LEFT JOIN usuarios u ON u.id = s.usuario_id
         LEFT JOIN talleres t ON t.id = u.taller_id
         LEFT JOIN administradores_app a ON a.id = s.admin_id
        WHERE s.token_hash = $1 AND s.expira_en > now()`,
      [sha256(token)],
    );
    const s = rows[0];
    if (!s) return null;
    if (s.admin_id) {
      return s.admin_activo
        ? { tipo: 'admin_app', sesionId: s.id, adminId: s.admin_id, tallerActivoId: s.taller_activo_id }
        : null;
    }
    if (s.usuario_id && s.taller_id && s.usuario_activo && s.taller_activo) {
      return { tipo: 'taller', sesionId: s.id, usuarioId: s.usuario_id, tallerId: s.taller_id };
    }
    return null;
  }

  async cerrarSesion(token: string): Promise<void> {
    await this.db.admin('DELETE FROM sesiones WHERE token_hash = $1', [sha256(token)]);
  }

  async perfil(c: Contexto): Promise<Perfil> {
    if (c.tipo === 'admin_app') {
      const { rows } = await this.db.admin<{ nombre: string; email: string; debe_cambiar_password: boolean }>(
        'SELECT nombre, email, debe_cambiar_password FROM administradores_app WHERE id = $1',
        [c.adminId],
      );
      let taller: Perfil['taller'] = null;
      if (c.tallerActivoId) {
        const t = await this.db.admin<{ id: string; nombre: string }>(
          'SELECT id, nombre FROM talleres WHERE id = $1',
          [c.tallerActivoId],
        );
        taller = t.rows[0] ?? null;
      }
      return {
        tipo: 'admin_app',
        id: c.adminId,
        nombre: rows[0].nombre,
        email: rows[0].email,
        taller,
        debeCambiarPassword: rows[0].debe_cambiar_password,
      };
    }
    const { rows } = await this.db.admin<{
      nombre: string;
      email: string;
      taller_id: string;
      taller_nombre: string;
      debe_cambiar_password: boolean;
    }>(
      `SELECT u.nombre, u.email, u.debe_cambiar_password, t.id AS taller_id, t.nombre AS taller_nombre
         FROM usuarios u JOIN talleres t ON t.id = u.taller_id WHERE u.id = $1`,
      [c.usuarioId],
    );
    const r = rows[0];
    return {
      tipo: 'taller',
      id: c.usuarioId,
      nombre: r.nombre,
      email: r.email,
      taller: { id: r.taller_id, nombre: r.taller_nombre },
      debeCambiarPassword: r.debe_cambiar_password,
    };
  }

  /**
   * Cambia la contrasena de la propia cuenta (pide la actual), apaga el aviso de contrasena temporal y
   * cierra las demas sesiones de esa cuenta; la sesion desde la que se cambia se conserva.
   */
  async cambiarPasswordPropia(c: Contexto, actual: string, nueva: string): Promise<void> {
    const esAdmin = c.tipo === 'admin_app';
    const id = esAdmin ? c.adminId : c.usuarioId;
    const tabla = esAdmin ? 'administradores_app' : 'usuarios';
    const { rows } = await this.db.admin<{ password_hash: string }>(`SELECT password_hash FROM ${tabla} WHERE id = $1`, [id]);
    if (!rows[0] || !(await verifyPassword(actual, rows[0].password_hash))) {
      throw new BadRequestException('La contraseña actual no es correcta');
    }
    if (actual === nueva) throw new BadRequestException('La contraseña nueva debe ser distinta de la actual');
    await this.db.admin(`UPDATE ${tabla} SET password_hash = $1, debe_cambiar_password = false WHERE id = $2`, [
      await hashPassword(nueva),
      id,
    ]);
    await this.db.admin(`DELETE FROM sesiones WHERE ${esAdmin ? 'admin_id' : 'usuario_id'} = $1 AND id <> $2`, [id, c.sesionId]);
  }
}
