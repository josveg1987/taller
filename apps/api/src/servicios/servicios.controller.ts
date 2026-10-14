import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { TallerActual } from '../auth/decoradores';
import { booleano, cuerpo, entero, idValido, opcion, opcional, texto, textoOpcional } from '../validacion';
import { ServiciosService } from './servicios.service';

const MAX_PRECIO = 100_000_000;

/** Servicios adicionales del taller: pulido y otros. */
@Controller('servicios')
export class ServiciosController {
  constructor(@Inject(ServiciosService) private readonly servicios: ServiciosService) {}

  /** Por defecto solo los activos (los que se ofrecen en un presupuesto); `?todos=1` incluye los desactivados. */
  @Get()
  listar(@TallerActual() tallerId: string, @Query('todos') todos?: string) {
    return this.servicios.listar(tallerId, todos === '1' || todos === 'true');
  }

  /** Agrega los servicios estandar que falten (se puede repetir sin duplicar). */
  @Post('estandar')
  estandar(@TallerActual() tallerId: string) {
    return this.servicios.agregarEstandar(tallerId);
  }

  @Post()
  crear(@TallerActual() tallerId: string, @Body() body: unknown) {
    const b = cuerpo(body);
    return this.servicios.crear(tallerId, {
      nombre: texto(b.nombre, 'El nombre del servicio', 80),
      precioSugerido: opcional(b.precioSugerido, (v) => entero(v, 'El precio', 0, MAX_PRECIO)) ?? null,
      descripcion: b.descripcion === undefined ? null : textoOpcional(b.descripcion, 'La descripción', 300),
    });
  }

  @Patch(':id')
  actualizar(@TallerActual() tallerId: string, @Param('id') id: string, @Body() body: unknown) {
    const b = cuerpo(body);
    return this.servicios.actualizar(tallerId, idValido(id), {
      nombre: b.nombre === undefined ? undefined : texto(b.nombre, 'El nombre del servicio', 80),
      // Vacio o null = sin precio sugerido.
      precioSugerido: opcional(b.precioSugerido, (v) => entero(v, 'El precio', 0, MAX_PRECIO)),
      descripcion: b.descripcion === undefined ? undefined : textoOpcional(b.descripcion, 'La descripción', 300),
      activo: b.activo === undefined ? undefined : booleano(b.activo, 'Activo'),
    });
  }

  @Delete(':id')
  @HttpCode(204)
  async eliminar(@TallerActual() tallerId: string, @Param('id') id: string): Promise<void> {
    await this.servicios.eliminar(tallerId, idValido(id));
  }

  @Post(':id/mover')
  mover(@TallerActual() tallerId: string, @Param('id') id: string, @Body() body: unknown) {
    return this.servicios.mover(tallerId, idValido(id), opcion(cuerpo(body).direccion, 'La dirección', ['arriba', 'abajo'] as const));
  }
}
