import { BadRequestException, Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { TallerActual } from '../auth/decoradores';
import { datosVehiculo } from '../vehiculos/vehiculos.controller';
import type { DatosVehiculo } from '../vehiculos/vehiculos.service';
import { cuerpo, email, idValido, opcional, rut, telefono, texto, textoOpcional } from '../validacion';
import { ClientesService, DatosCliente } from './clientes.service';

/** Datos opcionales del cliente (RUT, correo, direccion): ausente = sin cambio, vacio = borrar. */
function opcionales(b: Record<string, unknown>): Partial<DatosCliente> {
  const d: Partial<DatosCliente> = {};
  const r = opcional(b.rut, rut);
  const e = opcional(b.email, email);
  const dir = opcional(b.direccion, (v) => textoOpcional(v, 'La dirección', 200));
  if (r !== undefined) d.rut = r;
  if (e !== undefined) d.email = e;
  if (dir !== undefined) d.direccion = dir;
  return d;
}

@Controller('clientes')
export class ClientesController {
  constructor(@Inject(ClientesService) private readonly clientes: ClientesService) {}

  @Get()
  buscar(@TallerActual() tallerId: string, @Query('q') q?: string) {
    if (q !== undefined && typeof q !== 'string') throw new BadRequestException('Búsqueda inválida');
    return this.clientes.buscar(tallerId, q?.slice(0, 100));
  }

  /** Crea el cliente; si se envia `vehiculo`, crea tambien su primer vehiculo en el mismo paso. */
  @Post()
  crear(@TallerActual() tallerId: string, @Body() body: unknown) {
    const b = cuerpo(body);
    const datos: DatosCliente = {
      nombre: texto(b.nombre, 'El nombre', 120),
      telefono: telefono(b.telefono),
      ...opcionales(b),
    };
    let vehiculo: DatosVehiculo | undefined;
    if (b.vehiculo !== undefined && b.vehiculo !== null) {
      const v = cuerpo(b.vehiculo);
      vehiculo = datosVehiculo({ ...v, patente: v.patente ?? '' }) as DatosVehiculo;
    }
    return this.clientes.crear(tallerId, datos, vehiculo);
  }

  @Get(':id')
  obtener(@TallerActual() tallerId: string, @Param('id') id: string) {
    return this.clientes.obtener(tallerId, idValido(id));
  }

  @Patch(':id')
  actualizar(@TallerActual() tallerId: string, @Param('id') id: string, @Body() body: unknown) {
    const b = cuerpo(body);
    const cambios: Partial<DatosCliente> = { ...opcionales(b) };
    if (b.nombre !== undefined) cambios.nombre = texto(b.nombre, 'El nombre', 120);
    if (b.telefono !== undefined) cambios.telefono = telefono(b.telefono);
    return this.clientes.actualizar(tallerId, idValido(id), cambios);
  }
}
