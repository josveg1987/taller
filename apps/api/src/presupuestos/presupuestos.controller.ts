import { BadRequestException, Body, Controller, Get, Inject, Param, Patch, Post, Put, Query } from '@nestjs/common';
import type { Contexto } from '../auth/contexto';
import { SesionActual, TallerActual } from '../auth/decoradores';
import { cuerpo, decimal, entero, idValido, opcion, opcional, telefono, texto, textoOpcional } from '../validacion';
import { datosVehiculo } from '../vehiculos/vehiculos.controller';
import type { DatosVehiculo } from '../vehiculos/vehiculos.service';
import { EntradaPresupuesto, Estado, LineaEntrada, PresupuestosService } from './presupuestos.service';

const OPERACIONES = ['reparar', 'reemplazar', 'libre'] as const;
const POSICIONES = ['izquierda', 'derecha', 'no_aplica'] as const;
const ESTADOS = ['borrador', 'enviado', 'aceptado', 'rechazado', 'vencido'] as const;
const MAX_MONTO = 100_000_000;
const MAX_LINEAS = 50;

/** Id que viene en el cuerpo: si no tiene forma de id es un dato invalido (400), no un "no existe". */
function idDeCuerpo(v: unknown, campo: string): string {
  try {
    return idValido(String(v));
  } catch {
    throw new BadRequestException(`${campo} no es válido`);
  }
}

const monto = (v: unknown, campo: string) => opcional(v, (x) => entero(x, campo, 0, MAX_MONTO)) ?? undefined;

function linea(v: unknown, i: number): LineaEntrada {
  const l = cuerpo(v);
  const de = `de la línea ${i + 1}`;
  return {
    piezaId: l.piezaId === undefined || l.piezaId === null ? null : idDeCuerpo(l.piezaId, `La pieza ${de}`),
    nombre: l.nombre === undefined || l.nombre === null ? undefined : texto(l.nombre, `El nombre ${de}`, 80),
    posicion: l.posicion === undefined ? 'no_aplica' : opcion(l.posicion, `El lado ${de}`, POSICIONES),
    operacion: opcion(l.operacion, `La operación ${de}`, OPERACIONES),
    pintura: monto(l.pintura, `La pintura ${de}`),
    desabollado: monto(l.desabollado, `El desabollado ${de}`),
    repuestoCosto: monto(l.repuestoCosto, `El costo del repuesto ${de}`),
    margenPct: l.margenPct === undefined || l.margenPct === null ? undefined : decimal(l.margenPct, `El margen ${de}`, 0, 500),
    precio: monto(l.precio, `El precio ${de}`),
  };
}

/** Valida lo que manda la pantalla. Los totales que envie se ignoran: los calcula el servidor. */
function entrada(body: unknown): EntradaPresupuesto {
  const b = cuerpo(body);

  const vehiculoId = b.vehiculoId === undefined || b.vehiculoId === null ? undefined : idDeCuerpo(b.vehiculoId, 'El vehículo');
  let vehiculo: DatosVehiculo | undefined;
  if (!vehiculoId) {
    if (b.vehiculo === undefined || b.vehiculo === null) throw new BadRequestException('Indica el vehículo');
    const v = cuerpo(b.vehiculo);
    vehiculo = datosVehiculo({ ...v, patente: v.patente ?? '' }) as DatosVehiculo;
  }

  const clienteId = b.clienteId === undefined || b.clienteId === null ? undefined : idDeCuerpo(b.clienteId, 'El cliente');
  let cliente: EntradaPresupuesto['cliente'];
  if (!vehiculoId && !clienteId) {
    if (b.cliente === undefined || b.cliente === null) throw new BadRequestException('Indica el cliente (nombre y teléfono)');
    const c = cuerpo(b.cliente);
    cliente = { nombre: texto(c.nombre, 'El nombre del cliente', 120), telefono: telefono(c.telefono) };
  }

  if (!Array.isArray(b.lineas) || b.lineas.length === 0) throw new BadRequestException('Agrega al menos una pieza');
  if (b.lineas.length > MAX_LINEAS) throw new BadRequestException(`Un presupuesto puede tener hasta ${MAX_LINEAS} líneas`);

  return {
    vehiculoId,
    vehiculo,
    clienteId,
    cliente,
    lineas: b.lineas.map(linea),
    descuento: b.descuento === undefined || b.descuento === null ? 0 : entero(b.descuento, 'El descuento', 0, 2_000_000_000),
    observaciones: opcional(b.observaciones, (x) => textoOpcional(x, 'Las observaciones', 2000)) ?? null,
    plazoDias: opcional(b.plazoDias, (x) => entero(x, 'El plazo', 1, 365)) ?? null,
    condiciones: b.condiciones === undefined ? undefined : (textoOpcional(b.condiciones, 'Las condiciones', 4000) ?? ''),
  };
}

@Controller('presupuestos')
export class PresupuestosController {
  constructor(@Inject(PresupuestosService) private readonly presupuestos: PresupuestosService) {}

  @Get()
  listar(@TallerActual() tallerId: string, @Query('estado') estado?: string) {
    return this.presupuestos.listar(tallerId, estado === undefined || estado === '' ? undefined : (opcion(estado, 'El estado', ESTADOS) as Estado));
  }

  @Get(':id')
  obtener(@TallerActual() tallerId: string, @Param('id') id: string) {
    return this.presupuestos.obtener(tallerId, idValido(id));
  }

  @Post()
  crear(@TallerActual() tallerId: string, @SesionActual() quien: Contexto, @Body() body: unknown) {
    return this.presupuestos.crear(tallerId, quien, entrada(body));
  }

  @Patch(':id/estado')
  cambiarEstado(@TallerActual() tallerId: string, @SesionActual() quien: Contexto, @Param('id') id: string, @Body() body: unknown) {
    const estado = opcion(cuerpo(body).estado, 'El estado', ESTADOS) as Estado;
    return this.presupuestos.cambiarEstado(tallerId, quien, idValido(id), estado);
  }

  /** Reemplaza el contenido de un presupuesto en borrador. */
  @Put(':id')
  actualizar(@TallerActual() tallerId: string, @Param('id') id: string, @Body() body: unknown) {
    return this.presupuestos.actualizar(tallerId, idValido(id), entrada(body));
  }
}
