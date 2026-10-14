import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { TallerActual } from '../auth/decoradores';
import { booleano, cuerpo, email, idValido, opcion, opcional, rut, texto } from '../validacion';
import { CuentasService, TIPOS_CUENTA } from './cuentas.service';

/** Numero de cuenta: digitos, guiones y espacios (p. ej. 1-980-432549-6). */
function numeroCuenta(v: unknown): string {
  const s = texto(v, 'El número de cuenta', 30);
  if (!/^[0-9][0-9\- ]{2,29}$/.test(s)) throw new BadRequestException('El número de cuenta solo puede llevar números y guiones');
  return s;
}

/** Cuentas para transferir del taller (salen en el PDF las activas). */
@Controller('cuentas')
export class CuentasController {
  constructor(@Inject(CuentasService) private readonly cuentas: CuentasService) {}

  /** Por defecto solo las activas; `?todas=1` incluye las desactivadas (para administrarlas). */
  @Get()
  listar(@TallerActual() tallerId: string, @Query('todas') todas?: string) {
    return this.cuentas.listar(tallerId, todas === '1' || todas === 'true');
  }

  @Post()
  crear(@TallerActual() tallerId: string, @Body() body: unknown) {
    const b = cuerpo(body);
    return this.cuentas.crear(tallerId, {
      titular: texto(b.titular, 'El titular', 120),
      rut: rut(b.rut),
      banco: texto(b.banco, 'El banco', 60),
      tipoCuenta: opcion(b.tipoCuenta, 'El tipo de cuenta', TIPOS_CUENTA),
      numero: numeroCuenta(b.numero),
      email: opcional(b.email, email) ?? null,
    });
  }

  @Patch(':id')
  actualizar(@TallerActual() tallerId: string, @Param('id') id: string, @Body() body: unknown) {
    const b = cuerpo(body);
    return this.cuentas.actualizar(tallerId, idValido(id), {
      titular: b.titular === undefined ? undefined : texto(b.titular, 'El titular', 120),
      rut: b.rut === undefined ? undefined : rut(b.rut),
      banco: b.banco === undefined ? undefined : texto(b.banco, 'El banco', 60),
      tipoCuenta: b.tipoCuenta === undefined ? undefined : opcion(b.tipoCuenta, 'El tipo de cuenta', TIPOS_CUENTA),
      numero: b.numero === undefined ? undefined : numeroCuenta(b.numero),
      email: b.email === undefined ? undefined : (opcional(b.email, email) ?? null),
      activa: b.activa === undefined ? undefined : booleano(b.activa, 'Activa'),
    });
  }

  @Delete(':id')
  @HttpCode(204)
  async eliminar(@TallerActual() tallerId: string, @Param('id') id: string): Promise<void> {
    await this.cuentas.eliminar(tallerId, idValido(id));
  }

  @Post(':id/mover')
  mover(@TallerActual() tallerId: string, @Param('id') id: string, @Body() body: unknown) {
    return this.cuentas.mover(tallerId, idValido(id), opcion(cuerpo(body).direccion, 'La dirección', ['arriba', 'abajo'] as const));
  }
}
