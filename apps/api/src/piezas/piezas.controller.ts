import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { TallerActual } from '../auth/decoradores';
import { booleano, cuerpo, entero, idValido, opcional, opcion, texto } from '../validacion';
import { CombosService } from './combos.service';
import { PiezasService } from './piezas.service';

const MAX_TARIFA = 100_000_000;

/** Lista de ids de piezas del cuerpo de la peticion (400 si algo no es un id). */
function listaIds(v: unknown): string[] {
  if (!Array.isArray(v) || v.length > 100) throw new BadRequestException('La lista de piezas no es válida');
  return v.map((x) => {
    try {
      return idValido(String(x));
    } catch {
      throw new BadRequestException('Alguna pieza no es válida');
    }
  });
}

/** Catalogo de piezas del taller (HU-16). */
@Controller('piezas')
export class PiezasController {
  constructor(@Inject(PiezasService) private readonly piezas: PiezasService) {}

  /** Por defecto solo las activas (las que se ofrecen en un presupuesto); `?todas=1` incluye las desactivadas. */
  @Get()
  listar(@TallerActual() tallerId: string, @Query('todas') todas?: string) {
    return this.piezas.listar(tallerId, todas === '1' || todas === 'true');
  }

  /** Agrega las piezas estandar que falten (se puede repetir sin duplicar). */
  @Post('estandar')
  estandar(@TallerActual() tallerId: string) {
    return this.piezas.agregarEstandar(tallerId);
  }

  @Post()
  crear(@TallerActual() tallerId: string, @Body() body: unknown) {
    const b = cuerpo(body);
    return this.piezas.crear(tallerId, {
      nombre: texto(b.nombre, 'El nombre de la pieza', 80),
      usaPosicion: b.usaPosicion === undefined ? true : booleano(b.usaPosicion, 'Usa posición'),
      tarifaPintura: opcional(b.tarifaPintura, (v) => entero(v, 'La tarifa de pintura', 0, MAX_TARIFA)) ?? null,
    });
  }

  @Patch(':id')
  actualizar(@TallerActual() tallerId: string, @Param('id') id: string, @Body() body: unknown) {
    const b = cuerpo(body);
    return this.piezas.actualizar(tallerId, idValido(id), {
      nombre: b.nombre === undefined ? undefined : texto(b.nombre, 'El nombre de la pieza', 80),
      usaPosicion: b.usaPosicion === undefined ? undefined : booleano(b.usaPosicion, 'Usa posición'),
      // Vacio o null = vuelve a usar la tarifa del taller.
      tarifaPintura: opcional(b.tarifaPintura, (v) => entero(v, 'La tarifa de pintura', 0, MAX_TARIFA)),
      activa: b.activa === undefined ? undefined : booleano(b.activa, 'Activa'),
    });
  }

  @Post(':id/mover')
  mover(@TallerActual() tallerId: string, @Param('id') id: string, @Body() body: unknown) {
    return this.piezas.mover(tallerId, idValido(id), opcion(cuerpo(body).direccion, 'La dirección', ['arriba', 'abajo'] as const));
  }
}

/** Combos de piezas del taller (HU-38). */
@Controller('combos')
export class CombosController {
  constructor(@Inject(CombosService) private readonly combos: CombosService) {}

  @Get()
  listar(@TallerActual() tallerId: string) {
    return this.combos.listar(tallerId);
  }

  @Post()
  crear(@TallerActual() tallerId: string, @Body() body: unknown) {
    const b = cuerpo(body);
    return this.combos.crear(tallerId, {
      nombre: texto(b.nombre, 'El nombre del combo', 80),
      piezaIds: b.piezaIds === undefined ? [] : listaIds(b.piezaIds),
    });
  }

  @Patch(':id')
  actualizar(@TallerActual() tallerId: string, @Param('id') id: string, @Body() body: unknown) {
    const b = cuerpo(body);
    return this.combos.actualizar(tallerId, idValido(id), {
      nombre: b.nombre === undefined ? undefined : texto(b.nombre, 'El nombre del combo', 80),
      activo: b.activo === undefined ? undefined : booleano(b.activo, 'Activo'),
      piezaIds: b.piezaIds === undefined ? undefined : listaIds(b.piezaIds),
    });
  }

  @Delete(':id')
  @HttpCode(204)
  async eliminar(@TallerActual() tallerId: string, @Param('id') id: string): Promise<void> {
    await this.combos.eliminar(tallerId, idValido(id));
  }
}
