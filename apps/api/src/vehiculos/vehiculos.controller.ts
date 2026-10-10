import { BadRequestException, Body, Controller, Get, Inject, Param, Patch, Post } from '@nestjs/common';
import { TallerActual } from '../auth/decoradores';
import { cuerpo, entero, idValido, opcional, patente, textoOpcional } from '../validacion';
import { DatosVehiculo, VehiculosService } from './vehiculos.service';

/** Campos del vehiculo que se pueden enviar al crear o editar (todos opcionales salvo la patente al crear). */
export function datosVehiculo(b: Record<string, unknown>): Partial<DatosVehiculo> {
  const d: Partial<DatosVehiculo> = {};
  if (b.patente !== undefined) d.patente = patente(b.patente);
  const marca = opcional(b.marca, (v) => textoOpcional(v, 'La marca', 60));
  const modelo = opcional(b.modelo, (v) => textoOpcional(v, 'El modelo', 60));
  const color = opcional(b.color, (v) => textoOpcional(v, 'El color', 40));
  const anio = opcional(b.anio, (v) => entero(v, 'El año', 1900, 2100));
  if (marca !== undefined) d.marca = marca;
  if (modelo !== undefined) d.modelo = modelo;
  if (color !== undefined) d.color = color;
  if (anio !== undefined) d.anio = anio;
  return d;
}

@Controller('vehiculos')
export class VehiculosController {
  constructor(@Inject(VehiculosService) private readonly vehiculos: VehiculosService) {}

  // Va antes que :id para que "patente" no se tome como un id.
  @Get('patente/:patente')
  porPatente(@TallerActual() tallerId: string, @Param('patente') p: string) {
    return this.vehiculos.porPatente(tallerId, patente(p));
  }

  @Get(':id')
  porId(@TallerActual() tallerId: string, @Param('id') id: string) {
    return this.vehiculos.porId(tallerId, idValido(id));
  }

  @Post()
  crear(@TallerActual() tallerId: string, @Body() body: unknown) {
    const b = cuerpo(body);
    if (typeof b.clienteId !== 'string' || !b.clienteId) throw new BadRequestException('El cliente es obligatorio');
    const datos = datosVehiculo({ ...b, patente: b.patente ?? '' });
    return this.vehiculos.crear(tallerId, idValido(b.clienteId), datos as DatosVehiculo);
  }

  @Patch(':id')
  actualizar(@TallerActual() tallerId: string, @Param('id') id: string, @Body() body: unknown) {
    const b = cuerpo(body);
    const clienteId = b.clienteId === undefined ? undefined : idValido(String(b.clienteId));
    return this.vehiculos.actualizar(tallerId, idValido(id), { ...datosVehiculo(b), clienteId });
  }
}
