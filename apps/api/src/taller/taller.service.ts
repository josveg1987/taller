import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asegurarCorreoLibre } from '../auth/cuentas';
import { Contexto } from '../auth/contexto';
import { hashPassword, verifyPassword } from '../auth/password';
import { DatabaseService } from '../database/database.service';
import { traducirErrorBD } from '../validacion';
import { DETALLE_DESABOLLADO_ESTANDAR, DETALLE_PINTURA_ESTANDAR, detalleEfectivo, detalleParaGuardar } from '@taller/shared';

export type TipoAnticipo = 'ninguno' | 'repuestos' | 'porcentaje' | 'fijo';

export interface ConfigTaller {
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  datosTransferencia: string | null;
  margenRepuestosPct: number;
  /** Tarifa de pintura por defecto; cada pieza puede tener la suya. */
  tarifaPintura: number;
  /** Montos rapidos de desabollado (HU-33), de menor a mayor. */
  montosDesabollado: number[];
  anticipo: { tipo: TipoAnticipo; valor: number | null };
  validezDias: number;
  condiciones: string;
  /** Texto de "Que incluye el trabajo" (pintura) que sale en el PDF: el del taller o el estandar. Un paso por linea. */
  detallePintura: string;
  /** Idem para desabolladura. */
  detalleDesabollado: string;
  maxUsuarios: number;
  usuariosActivos: number;
}

export interface CambiosTaller {
  nombre?: string;
  direccion?: string | null;
  telefono?: string | null;
  datosTransferencia?: string | null;
  margenRepuestosPct?: number;
  tarifaPintura?: number;
  montosDesabollado?: number[];
  anticipo?: { tipo: TipoAnticipo; valor: number | null };
  validezDias?: number;
  condiciones?: string;
  /** Vacio o igual al estandar = vuelve a usar el estandar. */
  detallePintura?: string | null;
  detalleDesabollado?: string | null;
}

export interface UsuarioTaller {
  id: string;
  nombre: string;
  email: string;
  activo: boolean;
  creadoEn: string;
}

interface FilaUsuario {
  id: string;
  nombre: string;
  email: string;
  activo: boolean;
  creado_en: Date;
}

const aUsuario = (u: FilaUsuario): UsuarioTaller => ({
  id: u.id,
  nombre: u.nombre,
  email: u.email,
  activo: u.activo,
  creadoEn: u.creado_en.toISOString(),
});

/**
 * Datos, configuracion y usuarios del propio taller. Todas las consultas de negocio van por
 * conTaller(): el aislamiento lo garantiza la base de datos (RLS), no solo este codigo.
 */
@Injectable()
export class TallerService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async obtener(tallerId: string): Promise<ConfigTaller> {
    const { rows } = await this.db.conTaller(tallerId, (c) =>
      c.query(`
        SELECT t.nombre, t.direccion, t.telefono, t.datos_transferencia, t.margen_repuestos_pct,
               t.tarifa_pintura, t.montos_desabollado, t.anticipo_tipo, t.anticipo_valor, t.validez_dias, t.condiciones, t.detalle_pintura, t.detalle_desabollado, t.max_usuarios,
               (SELECT count(*) FROM usuarios u WHERE u.activo)::int AS usuarios_activos
          FROM talleres t`),
    );
    const t = rows[0];
    if (!t) throw new NotFoundException('El taller no existe');
    return {
      nombre: t.nombre,
      direccion: t.direccion,
      telefono: t.telefono,
      datosTransferencia: t.datos_transferencia,
      margenRepuestosPct: Number(t.margen_repuestos_pct),
      tarifaPintura: t.tarifa_pintura,
      montosDesabollado: t.montos_desabollado,
      anticipo: { tipo: t.anticipo_tipo, valor: t.anticipo_valor },
      validezDias: t.validez_dias,
      condiciones: t.condiciones,
      detallePintura: detalleEfectivo(t.detalle_pintura, DETALLE_PINTURA_ESTANDAR),
      detalleDesabollado: detalleEfectivo(t.detalle_desabollado, DETALLE_DESABOLLADO_ESTANDAR),
      maxUsuarios: t.max_usuarios,
      usuariosActivos: t.usuarios_activos,
    };
  }

  async actualizar(tallerId: string, cambios: CambiosTaller): Promise<ConfigTaller> {
    const sets: string[] = [];
    const valores: unknown[] = [];
    const agregar = (columna: string, valor: unknown) => {
      valores.push(valor);
      sets.push(`${columna} = $${valores.length}`);
    };
    if (cambios.nombre !== undefined) agregar('nombre', cambios.nombre);
    if (cambios.direccion !== undefined) agregar('direccion', cambios.direccion);
    if (cambios.telefono !== undefined) agregar('telefono', cambios.telefono);
    if (cambios.datosTransferencia !== undefined) agregar('datos_transferencia', cambios.datosTransferencia);
    if (cambios.margenRepuestosPct !== undefined) agregar('margen_repuestos_pct', cambios.margenRepuestosPct);
    if (cambios.tarifaPintura !== undefined) agregar('tarifa_pintura', cambios.tarifaPintura);
    if (cambios.montosDesabollado !== undefined) agregar('montos_desabollado', cambios.montosDesabollado);
    if (cambios.validezDias !== undefined) agregar('validez_dias', cambios.validezDias);
    if (cambios.condiciones !== undefined) agregar('condiciones', cambios.condiciones);
    if (cambios.detallePintura !== undefined) agregar('detalle_pintura', detalleParaGuardar(cambios.detallePintura, DETALLE_PINTURA_ESTANDAR));
    if (cambios.detalleDesabollado !== undefined) agregar('detalle_desabollado', detalleParaGuardar(cambios.detalleDesabollado, DETALLE_DESABOLLADO_ESTANDAR));
    if (cambios.anticipo) {
      agregar('anticipo_tipo', cambios.anticipo.tipo);
      agregar('anticipo_valor', cambios.anticipo.valor);
    }
    if (sets.length) {
      await this.db.conTaller(tallerId, (c) =>
        c.query(`UPDATE talleres SET ${sets.join(', ')}, actualizado_en = now() WHERE id = taller_actual()`, valores),
      );
    }
    return this.obtener(tallerId);
  }

  async listarUsuarios(tallerId: string): Promise<UsuarioTaller[]> {
    const { rows } = await this.db.conTaller(tallerId, (c) =>
      c.query<FilaUsuario>('SELECT id, nombre, email, activo, creado_en FROM usuarios ORDER BY creado_en'),
    );
    return rows.map(aUsuario);
  }

  async crearUsuario(
    tallerId: string,
    datos: { nombre: string; email: string; password: string },
  ): Promise<UsuarioTaller> {
    await asegurarCorreoLibre(this.db, datos.email);
    const hash = await hashPassword(datos.password);
    try {
      const { rows } = await this.db.conTaller(tallerId, (c) =>
        c.query<FilaUsuario>(
          `INSERT INTO usuarios (taller_id, nombre, email, password_hash, debe_cambiar_password)
           VALUES ($1, $2, $3, $4, true) RETURNING id, nombre, email, activo, creado_en`,
          [tallerId, datos.nombre, datos.email, hash],
        ),
      );
      return aUsuario(rows[0]);
    } catch (e) {
      return traducirErrorBD(e);
    }
  }

  async actualizarUsuario(
    tallerId: string,
    id: string,
    cambios: { nombre?: string; email?: string; activo?: boolean },
    quien: Contexto,
  ): Promise<UsuarioTaller> {
    if (cambios.activo === false && quien.tipo === 'taller' && quien.usuarioId === id) {
      throw new BadRequestException('No puedes desactivar tu propia cuenta');
    }
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
      const { rows } = await this.db.conTaller(tallerId, (c) =>
        sets.length
          ? c.query<FilaUsuario>(
              `UPDATE usuarios SET ${sets.join(', ')} WHERE id = $${valores.length + 1}
               RETURNING id, nombre, email, activo, creado_en`,
              [...valores, id],
            )
          : c.query<FilaUsuario>('SELECT id, nombre, email, activo, creado_en FROM usuarios WHERE id = $1', [id]),
      );
      if (!rows[0]) throw new NotFoundException('El usuario no existe');
      return aUsuario(rows[0]);
    } catch (e) {
      return traducirErrorBD(e);
    }
  }

  /**
   * Cambia la contrasena y cierra las demas sesiones de ese usuario. Para cambiar la propia se
   * pide la actual, de modo que una sesion ajena abierta no baste para quedarse con la cuenta.
   */
  async cambiarPassword(
    tallerId: string,
    id: string,
    nueva: string,
    actual: unknown,
    quien: Contexto,
  ): Promise<void> {
    const existe = await this.db.conTaller(tallerId, (c) => c.query('SELECT 1 FROM usuarios WHERE id = $1', [id]));
    if (!existe.rowCount) throw new NotFoundException('El usuario no existe');

    if (quien.tipo === 'taller' && quien.usuarioId === id) {
      const { rows } = await this.db.admin<{ password_hash: string }>(
        'SELECT password_hash FROM usuarios WHERE id = $1',
        [id],
      );
      if (typeof actual !== 'string' || !(await verifyPassword(actual, rows[0].password_hash))) {
        throw new BadRequestException('La contraseña actual no es correcta');
      }
    }

    const hash = await hashPassword(nueva);
    // Si la cambia otra persona (administrador), queda como temporal: el usuario debe cambiarla al entrar.
    const propia = quien.tipo === 'taller' && quien.usuarioId === id;
    await this.db.conTaller(tallerId, (c) =>
      c.query('UPDATE usuarios SET password_hash = $1, debe_cambiar_password = $3 WHERE id = $2', [hash, id, !propia]),
    );
    // La sesion desde la que se hace el cambio se conserva; las demas de ese usuario se cierran.
    await this.db.admin('DELETE FROM sesiones WHERE usuario_id = $1 AND id <> $2', [id, quien.sesionId]);
  }
}
