import { BadRequestException, Controller, Get, Inject, Query } from '@nestjs/common';
import { TallerActual } from '../auth/decoradores';
import { CatalogoService } from './catalogo.service';

/** Entero positivo que llega como texto en la URL; si no viene, undefined. */
function numero(v: unknown, campo: string, min: number, max: number): number | undefined {
  if (v === undefined || v === '') return undefined;
  const n = typeof v === 'string' && /^\d{1,9}$/.test(v) ? Number(v) : NaN;
  if (!Number.isInteger(n) || n < min || n > max) throw new BadRequestException(`${campo} no es válido`);
  return n;
}

const textoBusqueda = (v: unknown): string | undefined => (typeof v === 'string' ? v.slice(0, 60) : undefined);

@Controller('catalogo')
export class CatalogoController {
  constructor(@Inject(CatalogoService) private readonly catalogo: CatalogoService) {}

  @Get('marcas')
  marcas(@Query('q') q?: string) {
    return this.catalogo.marcas(textoBusqueda(q));
  }

  /** Marcas (o modelos de `marca`) que este taller ya registro en sus vehiculos, aunque no esten en el catalogo. */
  @Get('propios')
  propios(@TallerActual() tallerId: string, @Query('marca') marca?: string, @Query('q') q?: string) {
    return this.catalogo.propias(tallerId, textoBusqueda(marca), textoBusqueda(q));
  }

  /** Modelos de una marca (marcaId obligatorio). Con `anio` solo los que existieron ese año. */
  @Get('modelos')
  modelos(@Query('marcaId') marcaId?: string, @Query('q') q?: string, @Query('anio') anio?: string) {
    const id = numero(marcaId, 'La marca', 1, 2_000_000_000);
    if (id === undefined) throw new BadRequestException('Indica la marca');
    return this.catalogo.modelos(id, textoBusqueda(q), numero(anio, 'El año', 1900, 2100));
  }

  /** Años de un modelo (modeloId) o de toda una marca (marcaId). */
  @Get('anios')
  anios(@Query('modeloId') modeloId?: string, @Query('marcaId') marcaId?: string) {
    const modelo = numero(modeloId, 'El modelo', 1, 2_000_000_000);
    if (modelo !== undefined) return this.catalogo.anios({ modeloId: modelo });
    const marca = numero(marcaId, 'La marca', 1, 2_000_000_000);
    if (marca !== undefined) return this.catalogo.anios({ marcaId: marca });
    throw new BadRequestException('Indica la marca o el modelo');
  }
}
