import { BadRequestException, Body, Controller, Get, HttpCode, Inject, Param, Patch, Post } from '@nestjs/common';
import { Contexto } from '../auth/contexto';
import { SesionActual, TallerActual } from '../auth/decoradores';
import {
  booleano,
  cuerpo,
  decimal,
  email,
  entero,
  idValido,
  opcion,
  password,
  texto,
  textoOpcional,
} from '../validacion';
import { CambiosTaller, TallerService, TipoAnticipo } from './taller.service';

const TIPOS_ANTICIPO = ['ninguno', 'repuestos', 'porcentaje', 'fijo'] as const;

function anticipo(v: unknown): { tipo: TipoAnticipo; valor: number | null } {
  const a = cuerpo(v);
  const tipo = opcion(a.tipo, 'El tipo de anticipo', TIPOS_ANTICIPO);
  if (tipo === 'porcentaje') return { tipo, valor: entero(a.valor, 'El porcentaje de anticipo', 1, 100) };
  if (tipo === 'fijo') return { tipo, valor: entero(a.valor, 'El monto de anticipo', 0, 100_000_000) };
  return { tipo, valor: null };
}

/** Montos rapidos de desabollado: hasta 12, enteros positivos, sin repetir, de menor a mayor. */
function montos(v: unknown): number[] {
  if (!Array.isArray(v) || v.length > 12) throw new BadRequestException('Los montos rápidos no son válidos (máximo 12)');
  const lista = v.map((x) => entero(x, 'Cada monto rápido', 1, 100_000_000));
  return [...new Set(lista)].sort((a, b) => a - b);
}

/** Datos, configuracion y usuarios del taller en el que se esta (el propio, o el del admin de la app). */
@Controller('taller')
export class TallerController {
  constructor(@Inject(TallerService) private readonly taller: TallerService) {}

  @Get()
  obtener(@TallerActual() tallerId: string) {
    return this.taller.obtener(tallerId);
  }

  @Patch()
  actualizar(@TallerActual() tallerId: string, @Body() body: unknown) {
    const b = cuerpo(body);
    const cambios: CambiosTaller = {};
    if (b.nombre !== undefined) cambios.nombre = texto(b.nombre, 'El nombre del taller');
    if (b.direccion !== undefined) cambios.direccion = textoOpcional(b.direccion, 'La dirección', 200);
    if (b.telefono !== undefined) cambios.telefono = textoOpcional(b.telefono, 'El teléfono', 40);
    if (b.datosTransferencia !== undefined) {
      cambios.datosTransferencia = textoOpcional(b.datosTransferencia, 'Los datos de transferencia', 1000);
    }
    if (b.margenRepuestosPct !== undefined) {
      cambios.margenRepuestosPct = decimal(b.margenRepuestosPct, 'El margen de repuestos', 0, 500);
    }
    if (b.tarifaPintura !== undefined) {
      cambios.tarifaPintura = entero(b.tarifaPintura, 'La tarifa de pintura', 0, 100_000_000);
    }
    if (b.montosDesabollado !== undefined) cambios.montosDesabollado = montos(b.montosDesabollado);
    if (b.validezDias !== undefined) cambios.validezDias = entero(b.validezDias, 'La validez', 1, 365);
    if (b.condiciones !== undefined) {
      cambios.condiciones = textoOpcional(b.condiciones, 'Las condiciones', 4000) ?? '';
    }
    if (b.anticipo !== undefined) cambios.anticipo = anticipo(b.anticipo);
    return this.taller.actualizar(tallerId, cambios);
  }

  @Get('usuarios')
  listarUsuarios(@TallerActual() tallerId: string) {
    return this.taller.listarUsuarios(tallerId);
  }

  @Post('usuarios')
  crearUsuario(@TallerActual() tallerId: string, @Body() body: unknown) {
    const b = cuerpo(body);
    return this.taller.crearUsuario(tallerId, {
      nombre: texto(b.nombre, 'El nombre'),
      email: email(b.email),
      password: password(b.password),
    });
  }

  @Patch('usuarios/:id')
  actualizarUsuario(
    @TallerActual() tallerId: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @SesionActual() quien: Contexto,
  ) {
    const b = cuerpo(body);
    const cambios = {
      nombre: b.nombre === undefined ? undefined : texto(b.nombre, 'El nombre'),
      email: b.email === undefined ? undefined : email(b.email),
      activo: b.activo === undefined ? undefined : booleano(b.activo, 'Activo'),
    };
    return this.taller.actualizarUsuario(tallerId, idValido(id), cambios, quien);
  }

  @Post('usuarios/:id/password')
  @HttpCode(204)
  async cambiarPassword(
    @TallerActual() tallerId: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @SesionActual() quien: Contexto,
  ): Promise<void> {
    const b = cuerpo(body);
    if (b.actual !== undefined && typeof b.actual !== 'string') throw new BadRequestException('Datos inválidos');
    await this.taller.cambiarPassword(tallerId, idValido(id), password(b.password), b.actual, quien);
  }
}
