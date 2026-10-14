import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { hashPassword } from '../auth/password';
import { DatabaseService } from '../database/database.service';
import { sembrarCatalogo } from '../piezas/piezas.service';
import { sembrarServicios } from '../servicios/servicios.service';
import { asegurarCorreoLibre } from '../auth/cuentas';
import { traducirErrorBD } from '../validacion';

export interface TallerResumen {
  id: string;
  nombre: string;
  activo: boolean;
  maxUsuarios: number;
  usuariosActivos: number;
  creadoEn: string;
}

export interface UsuarioResumen {
  id: string;
  nombre: string;
  email: string;
  activo: boolean;
  creadoEn: string;
}

export interface TallerDetalle extends TallerResumen {
  usuarios: UsuarioResumen[];
  /** Logo SVG para fondo claro (el del PDF); null si no tiene. */
  logoClaroSvg: string | null;
}

export interface AdministradorResumen {
  id: string;
  nombre: string;
  email: string;
  activo: boolean;
  creadoEn: string;
}

interface FilaTaller {
  id: string;
  nombre: string;
  activo: boolean;
  max_usuarios: number;
  usuarios_activos: number;
  creado_en: Date;
}

const aTaller = (f: FilaTaller): TallerResumen => ({
  id: f.id,
  nombre: f.nombre,
  activo: f.activo,
  maxUsuarios: f.max_usuarios,
  usuariosActivos: Number(f.usuarios_activos),
  creadoEn: f.creado_en.toISOString(),
});

const SELECT_TALLER = `
  SELECT t.id, t.nombre, t.activo, t.max_usuarios, t.creado_en,
         count(u.id) FILTER (WHERE u.activo) AS usuarios_activos
    FROM talleres t LEFT JOIN usuarios u ON u.taller_id = t.id`;

/**
 * Administracion de la plataforma. Usa la conexion administrativa (sin RLS) a proposito: el
 * administrador de la app ve y gestiona todos los talleres. Solo se llega aqui desde rutas
 * marcadas con @SoloAdminApp().
 */
@Injectable()
export class AdminService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async listarTalleres(): Promise<TallerResumen[]> {
    const { rows } = await this.db.admin<FilaTaller>(`${SELECT_TALLER} GROUP BY t.id ORDER BY lower(t.nombre)`);
    return rows.map(aTaller);
  }

  async crearTaller(nombre: string, maxUsuarios: number): Promise<TallerResumen> {
    const { rows } = await this.db.admin<{ id: string }>(
      'INSERT INTO talleres (nombre, max_usuarios) VALUES ($1, $2) RETURNING id',
      [nombre, maxUsuarios],
    );
    // El taller nace con las piezas estandar y el combo de ejemplo, que despues edita a su gusto.
    await sembrarCatalogo((sql, p) => this.db.admin(sql, p), rows[0].id);
    await sembrarServicios((sql, p) => this.db.admin(sql, p), rows[0].id);
    return (await this.obtenerResumen(rows[0].id))!;
  }

  private async obtenerResumen(id: string): Promise<TallerResumen | null> {
    const { rows } = await this.db.admin<FilaTaller>(`${SELECT_TALLER} WHERE t.id = $1 GROUP BY t.id`, [id]);
    return rows[0] ? aTaller(rows[0]) : null;
  }

  async obtenerTaller(id: string): Promise<TallerDetalle> {
    const taller = await this.obtenerResumen(id);
    if (!taller) throw new NotFoundException('El taller no existe');
    const { rows } = await this.db.admin<{
      id: string;
      nombre: string;
      email: string;
      activo: boolean;
      creado_en: Date;
    }>('SELECT id, nombre, email, activo, creado_en FROM usuarios WHERE taller_id = $1 ORDER BY creado_en', [id]);
    const logo = await this.db.admin<{ logo_claro_svg: string | null }>('SELECT logo_claro_svg FROM talleres WHERE id = $1', [id]);
    return {
      ...taller,
      logoClaroSvg: logo.rows[0]?.logo_claro_svg ?? null,
      usuarios: rows.map((u) => ({
        id: u.id,
        nombre: u.nombre,
        email: u.email,
        activo: u.activo,
        creadoEn: u.creado_en.toISOString(),
      })),
    };
  }

  async actualizarTaller(
    id: string,
    cambios: { nombre?: string; maxUsuarios?: number; activo?: boolean },
  ): Promise<TallerResumen> {
    const sets: string[] = [];
    const valores: unknown[] = [];
    const agregar = (columna: string, valor: unknown) => {
      valores.push(valor);
      sets.push(`${columna} = $${valores.length}`);
    };
    if (cambios.nombre !== undefined) agregar('nombre', cambios.nombre);
    if (cambios.maxUsuarios !== undefined) agregar('max_usuarios', cambios.maxUsuarios);
    if (cambios.activo !== undefined) agregar('activo', cambios.activo);
    if (sets.length) {
      sets.push('actualizado_en = now()');
      valores.push(id);
      const r = await this.db.admin(`UPDATE talleres SET ${sets.join(', ')} WHERE id = $${valores.length}`, valores);
      if (!r.rowCount) throw new NotFoundException('El taller no existe');
    }
    const taller = await this.obtenerResumen(id);
    if (!taller) throw new NotFoundException('El taller no existe');
    return taller;
  }

  async crearUsuario(
    tallerId: string,
    datos: { nombre: string; email: string; password: string },
  ): Promise<UsuarioResumen> {
    if (!(await this.obtenerResumen(tallerId))) throw new NotFoundException('El taller no existe');
    await asegurarCorreoLibre(this.db, datos.email);
    try {
      const { rows } = await this.db.admin<{ id: string; creado_en: Date }>(
        `INSERT INTO usuarios (taller_id, nombre, email, password_hash, debe_cambiar_password)
         VALUES ($1, $2, $3, $4, true) RETURNING id, creado_en`,
        [tallerId, datos.nombre, datos.email, await hashPassword(datos.password)],
      );
      return {
        id: rows[0].id,
        nombre: datos.nombre,
        email: datos.email,
        activo: true,
        creadoEn: rows[0].creado_en.toISOString(),
      };
    } catch (e) {
      return traducirErrorBD(e);
    }
  }

  async actualizarUsuario(
    id: string,
    cambios: { nombre?: string; email?: string; activo?: boolean },
  ): Promise<UsuarioResumen> {
    if (cambios.email !== undefined) await asegurarCorreoLibre(this.db, cambios.email, id);
    const sets: string[] = [];
    const valores: unknown[] = [];
    const agregar = (columna: string, valor: unknown) => {
      valores.push(valor);
      sets.push(`${columna} = $${valores.length}`);
    };
    if (cambios.nombre !== undefined) agregar('nombre', cambios.nombre);
    if (cambios.email !== undefined) agregar('email', cambios.email);
    if (cambios.activo !== undefined) agregar('activo', cambios.activo);
    try {
      if (sets.length) {
        valores.push(id);
        await this.db.admin(`UPDATE usuarios SET ${sets.join(', ')} WHERE id = $${valores.length}`, valores);
      }
    } catch (e) {
      return traducirErrorBD(e);
    }
    const { rows } = await this.db.admin<{
      id: string;
      nombre: string;
      email: string;
      activo: boolean;
      creado_en: Date;
    }>('SELECT id, nombre, email, activo, creado_en FROM usuarios WHERE id = $1', [id]);
    const u = rows[0];
    if (!u) throw new NotFoundException('El usuario no existe');
    return { id: u.id, nombre: u.nombre, email: u.email, activo: u.activo, creadoEn: u.creado_en.toISOString() };
  }

  /**
   * Pone una contrasena (temporal: la persona debe cambiarla al entrar) y cierra todas las
   * sesiones abiertas de ese usuario.
   */
  async cambiarPassword(id: string, nueva: string): Promise<void> {
    const r = await this.db.admin('UPDATE usuarios SET password_hash = $1, debe_cambiar_password = true WHERE id = $2', [
      await hashPassword(nueva),
      id,
    ]);
    if (!r.rowCount) throw new NotFoundException('El usuario no existe');
    await this.db.admin('DELETE FROM sesiones WHERE usuario_id = $1', [id]);
  }

  /** Guarda (o quita, con null) el logo del PDF del taller. El SVG ya viene saneado. */
  async cambiarLogo(id: string, svg: string | null): Promise<void> {
    const r = await this.db.admin('UPDATE talleres SET logo_claro_svg = $1, actualizado_en = now() WHERE id = $2', [svg, id]);
    if (!r.rowCount) throw new NotFoundException('El taller no existe');
  }

  // --- Administradores de la app (los duenos de la plataforma) ---

  async listarAdministradores(): Promise<AdministradorResumen[]> {
    const { rows } = await this.db.admin<{ id: string; nombre: string; email: string; activo: boolean; creado_en: Date }>(
      'SELECT id, nombre, email, activo, creado_en FROM administradores_app ORDER BY creado_en',
    );
    return rows.map((a) => ({ id: a.id, nombre: a.nombre, email: a.email, activo: a.activo, creadoEn: a.creado_en.toISOString() }));
  }

  /** Nuevo administrador de la app con una contrasena temporal (debe cambiarla al entrar). */
  async crearAdministrador(datos: { nombre: string; email: string; password: string }): Promise<AdministradorResumen> {
    await asegurarCorreoLibre(this.db, datos.email);
    const { rows } = await this.db.admin<{ id: string; creado_en: Date }>(
      `INSERT INTO administradores_app (nombre, email, password_hash, debe_cambiar_password)
       VALUES ($1, $2, $3, true) RETURNING id, creado_en`,
      [datos.nombre, datos.email, await hashPassword(datos.password)],
    );
    return { id: rows[0].id, nombre: datos.nombre, email: datos.email, activo: true, creadoEn: rows[0].creado_en.toISOString() };
  }

  /** Activa o desactiva a otro administrador. No puede desactivarse a si mismo (siempre queda al menos uno). */
  async cambiarEstadoAdministrador(id: string, activo: boolean, quienId: string): Promise<AdministradorResumen> {
    if (!activo && id === quienId) throw new BadRequestException('No puedes desactivar tu propia cuenta');
    const { rows } = await this.db.admin<{ id: string; nombre: string; email: string; activo: boolean; creado_en: Date }>(
      'UPDATE administradores_app SET activo = $1 WHERE id = $2 RETURNING id, nombre, email, activo, creado_en',
      [activo, id],
    );
    const a = rows[0];
    if (!a) throw new NotFoundException('El administrador no existe');
    return { id: a.id, nombre: a.nombre, email: a.email, activo: a.activo, creadoEn: a.creado_en.toISOString() };
  }

  /** Contrasena temporal para OTRO administrador (la propia se cambia desde la cuenta, pidiendo la actual). */
  async cambiarPasswordAdministrador(id: string, nueva: string, quienId: string): Promise<void> {
    if (id === quienId) throw new BadRequestException('Tu propia contraseña se cambia desde tu cuenta');
    const r = await this.db.admin('UPDATE administradores_app SET password_hash = $1, debe_cambiar_password = true WHERE id = $2', [
      await hashPassword(nueva),
      id,
    ]);
    if (!r.rowCount) throw new NotFoundException('El administrador no existe');
    await this.db.admin('DELETE FROM sesiones WHERE admin_id = $1', [id]);
  }

  async entrarTaller(sesionId: string, tallerId: string): Promise<void> {
    if (!(await this.obtenerResumen(tallerId))) throw new NotFoundException('El taller no existe');
    await this.db.admin('UPDATE sesiones SET taller_activo_id = $1 WHERE id = $2', [tallerId, sesionId]);
  }

  async salirTaller(sesionId: string): Promise<void> {
    await this.db.admin('UPDATE sesiones SET taller_activo_id = NULL WHERE id = $1', [sesionId]);
  }
}
