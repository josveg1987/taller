import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  calcularLinea,
  calcularMontoInicio,
  calcularPresupuesto,
  type LineaInput,
  type Operacion,
  type ReglaAnticipo,
} from '@taller/shared';
import type { Zona } from '@taller/shared/plano';
import type { PoolClient } from 'pg';
import type { Contexto } from '../auth/contexto';
import { DatabaseService } from '../database/database.service';
import { escaparLike, normalizarPatente } from '../validacion';
import { insertarVehiculo, type DatosVehiculo } from '../vehiculos/vehiculos.service';

export type Posicion = 'izquierda' | 'derecha' | 'no_aplica';
export type Estado = 'borrador' | 'enviado' | 'aceptado' | 'rechazado' | 'vencido';

/** Una linea tal como llega de la pantalla. Los montos que falten se completan con la configuracion. */
export interface LineaEntrada {
  piezaId: string | null;
  nombre?: string;
  posicion: Posicion;
  operacion: Operacion;
  pintura?: number;
  desabollado?: number;
  repuestoCosto?: number;
  margenPct?: number;
  precio?: number;
  /** Solo items libres y servicios: texto que sale bajo el nombre en el PDF. */
  descripcion?: string;
}

export interface EntradaPresupuesto {
  /** Vehiculo existente (su dueño actual queda como cliente del presupuesto)… */
  vehiculoId?: string;
  /** …o uno nuevo, de un cliente existente (clienteId) o nuevo (cliente). */
  vehiculo?: DatosVehiculo;
  clienteId?: string;
  cliente?: { nombre: string; telefono: string };
  lineas: LineaEntrada[];
  descuento: number;
  observaciones: string | null;
  /** Plazo total estimado en dias habiles (opcional). */
  plazoDias: number | null;
  /** Si no viene, se copian las del taller. */
  condiciones?: string;
  /** Pedir el anticipo que indica la configuracion del taller. Si no viene: si el taller tiene anticipo configurado. */
  solicitaAnticipo?: boolean;
}

export interface LineaPresupuesto {
  id: string;
  piezaId: string | null;
  nombre: string;
  posicion: Posicion;
  operacion: Operacion;
  pintura: number;
  desabollado: number;
  repuestoCosto: number;
  margenPct: number;
  /** Precio del repuesto con margen (vista interna). */
  repuestoPrecio: number;
  /** Lo que ve el cliente por esta linea. */
  precioTotal: number;
  /** Texto bajo el nombre en el PDF (servicios e items libres); null si no tiene. */
  descripcion: string | null;
  /** Zona del plano del auto (foto de la de la pieza al guardar); null si no esta en el dibujo. */
  zona: Zona | null;
}

export interface Presupuesto {
  id: string;
  numero: number;
  fecha: string;
  validoHasta: string;
  estado: Estado;
  cliente: { id: string; nombre: string; telefono: string };
  vehiculo: { id: string; patente: string; marca: string | null; modelo: string | null; anio: number | null };
  lineas: LineaPresupuesto[];
  subtotal: number;
  descuento: number;
  total: number;
  /** Anticipo: 0 si no se solicita en este presupuesto. */
  montoInicio: number;
  /** Si este presupuesto solicita el anticipo de la configuracion del taller. */
  solicitaAnticipo: boolean;
  /** Vista interna: nunca va al PDF. */
  costoRepuestos: number;
  precioRepuestos: number;
  gananciaRepuestos: number;
  observaciones: string | null;
  /** Plazo total estimado, en dias habiles. */
  plazoDias: number | null;
  condiciones: string;
}

/** Filtros de la lista (todos opcionales) y paginacion por numero: "antes" pide los de numero menor. */
export interface FiltrosLista {
  /** Texto: numero, patente o nombre del cliente. */
  q?: string;
  estado?: Estado;
  /** Fecha minima del presupuesto (YYYY-MM-DD). */
  desde?: string;
  /** Solo los de numero menor a este (para "Ver mas"). */
  antes?: number;
  limite: number;
}

export interface ListaPresupuestos {
  presupuestos: PresupuestoResumen[];
  /** true si hay mas presupuestos despues del ultimo de esta pagina. */
  hayMas: boolean;
}

export interface PresupuestoResumen {
  id: string;
  numero: number;
  fecha: string;
  estado: Estado;
  total: number;
  cliente: { id: string; nombre: string };
  vehiculo: { id: string; patente: string; marca: string | null; modelo: string | null };
}

interface Config {
  tarifa_pintura: number;
  margen_repuestos_pct: string;
  anticipo_tipo: ReglaAnticipo['tipo'];
  anticipo_valor: number | null;
  validez_dias: number;
  condiciones: string;
}

interface PiezaCatalogo {
  id: string;
  nombre: string;
  usa_posicion: boolean;
  tarifa_pintura: number | null;
  desabollado_sugerido: number | null;
  zona: Zona | null;
}

/** Lo que se guarda: lineas ya resueltas (la "foto") y los montos oficiales calculados aqui. */
interface Calculo {
  clienteId: string;
  vehiculoId: string;
  lineas: (Required<Omit<LineaEntrada, 'precio' | 'nombre' | 'descripcion'>> & { nombre: string; precioTotal: number; descripcion: string | null; zona: Zona | null })[];
  descuento: number;
  total: number;
  montoInicio: number;
  solicitaAnticipo: boolean;
  costoRepuestos: number;
  condiciones: string;
}

/** Un presupuesto enviado cuya validez ya pasó se muestra como vencido (no se guarda: depende de la fecha). */
const ESTADO_EFECTIVO = "CASE WHEN p.estado = 'enviado' AND p.valido_hasta < current_date THEN 'vencido' ELSE p.estado END";

// Pasos permitidos entre estados guardados. Enviado = ya salió hacia el cliente: desde ahí no se edita.
const TRANSICIONES: Record<string, Estado[]> = {
  borrador: ['enviado'],
  enviado: ['aceptado', 'rechazado'],
  aceptado: ['enviado'],
  rechazado: ['enviado'],
};

// La columna total es integer: se corta mucho antes de su limite para no desbordar.
const MAX_TOTAL = 2_000_000_000;

function reglaDe(c: Config): ReglaAnticipo {
  if (c.anticipo_tipo === 'porcentaje') return { tipo: 'porcentaje', valor: c.anticipo_valor ?? 0 };
  if (c.anticipo_tipo === 'fijo') return { tipo: 'fijo', valor: c.anticipo_valor ?? 0 };
  return { tipo: c.anticipo_tipo };
}

/**
 * Presupuestos (Fase 5). El servidor manda en el calculo: los montos oficiales se calculan aqui con
 * @taller/shared a partir de las lineas, ignorando cualquier total que envie la pantalla. Cada linea
 * guarda una "foto" (nombre y montos) para que cambiar tarifas o piezas no altere lo ya cotizado.
 */
@Injectable()
export class PresupuestosService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  /** Resuelve vehiculo/cliente (creandolos si son nuevos), completa las lineas y calcula los montos. */
  private async preparar(c: PoolClient, tallerId: string, e: EntradaPresupuesto): Promise<Calculo> {
    const { rows: cfg } = await c.query<Config>(
      `SELECT tarifa_pintura, margen_repuestos_pct, anticipo_tipo, anticipo_valor, validez_dias, condiciones FROM talleres`,
    );
    const config = cfg[0];
    if (!config) throw new NotFoundException('El taller no existe');

    // Vehiculo y cliente. Con RLS, uno de otro taller responde igual que uno inexistente.
    let vehiculoId: string;
    let clienteId: string;
    if (e.vehiculoId) {
      const { rows } = await c.query<{ id: string; cliente_id: string }>('SELECT id, cliente_id FROM vehiculos WHERE id = $1', [
        e.vehiculoId,
      ]);
      if (!rows[0]) throw new NotFoundException('El vehículo no existe');
      vehiculoId = rows[0].id;
      clienteId = rows[0].cliente_id;
    } else {
      if (!e.vehiculo) throw new BadRequestException('Indica el vehículo');
      if (e.clienteId) {
        const existe = await c.query('SELECT 1 FROM clientes WHERE id = $1', [e.clienteId]);
        if (!existe.rowCount) throw new NotFoundException('El cliente no existe');
        clienteId = e.clienteId;
      } else {
        if (!e.cliente) throw new BadRequestException('Indica el cliente (nombre y teléfono)');
        const { rows } = await c.query<{ id: string }>(
          'INSERT INTO clientes (taller_id, nombre, telefono) VALUES ($1, $2, $3) RETURNING id',
          [tallerId, e.cliente.nombre, e.cliente.telefono],
        );
        clienteId = rows[0].id;
      }
      vehiculoId = (await insertarVehiculo(c, tallerId, clienteId, e.vehiculo)).id;
    }

    // Piezas del catalogo que se usan (para completar montos y tomar su nombre).
    const ids = [...new Set(e.lineas.map((l) => l.piezaId).filter((x): x is string => !!x))];
    const piezas = new Map<string, PiezaCatalogo>();
    if (ids.length) {
      const { rows } = await c.query<PiezaCatalogo>(
        'SELECT id, nombre, usa_posicion, tarifa_pintura, desabollado_sugerido, zona FROM piezas WHERE id = ANY($1::uuid[])',
        [ids],
      );
      for (const p of rows) piezas.set(p.id, p);
      if (piezas.size !== ids.length) throw new NotFoundException('Alguna de las piezas no existe');
    }

    const margenTaller = Number(config.margen_repuestos_pct);
    const lineas = e.lineas.map((l, i) => {
      const pieza = l.piezaId ? piezas.get(l.piezaId)! : null;
      const nombre = l.nombre?.trim() || pieza?.nombre;
      if (!nombre) throw new BadRequestException(`A la línea ${i + 1} le falta el nombre`);

      if (l.operacion === 'libre') {
        if (l.precio === undefined) throw new BadRequestException(`Indica el precio de “${nombre}”`);
        return {
          piezaId: pieza?.id ?? null,
          nombre,
          posicion: 'no_aplica' as Posicion,
          operacion: l.operacion,
          pintura: 0,
          desabollado: 0,
          repuestoCosto: 0,
          margenPct: 0,
          precio: l.precio,
          descripcion: l.descripcion?.trim() || null,
          zona: null,
        };
      }

      let posicion = l.posicion;
      if (pieza && !pieza.usa_posicion) posicion = 'no_aplica';
      if (pieza?.usa_posicion && posicion === 'no_aplica') {
        throw new BadRequestException(`Indica el lado (izquierdo o derecho) de “${nombre}”`);
      }
      const repara = l.operacion === 'reparar';
      return {
        piezaId: pieza?.id ?? null,
        nombre,
        posicion,
        operacion: l.operacion,
        pintura: l.pintura ?? pieza?.tarifa_pintura ?? config.tarifa_pintura,
        desabollado: repara ? (l.desabollado ?? pieza?.desabollado_sugerido ?? 0) : 0,
        repuestoCosto: repara ? 0 : (l.repuestoCosto ?? 0),
        margenPct: repara ? 0 : (l.margenPct ?? margenTaller),
        precio: 0,
        descripcion: null,
        zona: pieza?.zona ?? null,
      };
    });

    const entradas: LineaInput[] = lineas.map((l) => ({
      operacion: l.operacion,
      pintura: l.pintura,
      desabollado: l.desabollado,
      repuestoCosto: l.repuestoCosto,
      margenPct: l.margenPct,
      precio: l.precio,
    }));
    const solicita = e.solicitaAnticipo ?? config.anticipo_tipo !== 'ninguno';
    const calc = calcularPresupuesto(entradas, e.descuento);
    if (calc.subtotal > MAX_TOTAL) throw new BadRequestException('El total del presupuesto es demasiado alto');
    if (e.descuento > calc.subtotal) throw new BadRequestException('El descuento no puede ser mayor que el subtotal');

    return {
      clienteId,
      vehiculoId,
      lineas: lineas.map((l, i) => {
        const { precio: _precio, ...resto } = l;
        return { ...resto, precioTotal: calc.lineas[i].precioTotal };
      }),
      descuento: e.descuento,
      total: calc.total,
      // El anticipo se pide si el presupuesto lo indica; por defecto, si la configuracion del taller tiene uno.
      solicitaAnticipo: solicita,
      montoInicio: solicita ? calcularMontoInicio(calc, reglaDe(config)) : 0,
      costoRepuestos: calc.costoRepuestos,
      condiciones: e.condiciones ?? config.condiciones,
    };
  }

  private async guardarLineas(c: PoolClient, tallerId: string, presupuestoId: string, calc: Calculo): Promise<void> {
    for (const [i, l] of calc.lineas.entries()) {
      await c.query(
        `INSERT INTO presupuesto_lineas (taller_id, presupuesto_id, pieza_id, nombre_pieza, posicion, operacion,
                                         pintura, desabollado, repuesto_costo, margen_pct, precio_total, orden, descripcion, zona)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [tallerId, presupuestoId, l.piezaId, l.nombre, l.posicion, l.operacion, l.pintura, l.desabollado, l.repuestoCosto, l.margenPct, l.precioTotal, i + 1, l.descripcion, l.zona],
      );
    }
  }

  async crear(tallerId: string, quien: Contexto, e: EntradaPresupuesto): Promise<Presupuesto> {
    const usuarioId = quien.tipo === 'taller' ? quien.usuarioId : null;
    return this.db.conTaller(tallerId, async (c) => {
      const calc = await this.preparar(c, tallerId, e);
      // El numero se toma en la misma transaccion: si algo falla, no se consume.
      const { rows: num } = await c.query<{ n: number }>('SELECT siguiente_numero_presupuesto() AS n');
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO presupuestos (taller_id, numero, cliente_id, vehiculo_id, valido_hasta, estado, descuento, total,
                                   monto_inicio, costo_repuestos, observaciones, plazo_dias, condiciones, creado_por, solicita_anticipo)
         VALUES ($1, $2, $3, $4, current_date + (SELECT validez_dias FROM talleres), 'borrador', $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING id`,
        [tallerId, num[0].n, calc.clienteId, calc.vehiculoId, calc.descuento, calc.total, calc.montoInicio, calc.costoRepuestos, e.observaciones, e.plazoDias, calc.condiciones, usuarioId, calc.solicitaAnticipo],
      );
      const id = rows[0].id;
      await this.guardarLineas(c, tallerId, id, calc);
      await c.query(
        "INSERT INTO historial_estados (taller_id, presupuesto_id, estado, usuario_id) VALUES ($1, $2, 'borrador', $3)",
        [tallerId, id, usuarioId],
      );
      return this.leer(c, id);
    });
  }

  /** Reemplaza el contenido de un presupuesto en borrador (mantiene su numero, fecha y validez). */
  async actualizar(tallerId: string, id: string, e: EntradaPresupuesto): Promise<Presupuesto> {
    return this.db.conTaller(tallerId, async (c) => {
      const { rows } = await c.query<{ estado: Estado }>(
        'SELECT estado FROM presupuestos WHERE id = $1 AND eliminado_en IS NULL FOR UPDATE',
        [id],
      );
      if (!rows[0]) throw new NotFoundException('El presupuesto no existe');
      if (rows[0].estado !== 'borrador') throw new ConflictException('Solo se puede editar un presupuesto en borrador');
      const calc = await this.preparar(c, tallerId, e);
      await c.query(
        `UPDATE presupuestos SET cliente_id = $1, vehiculo_id = $2, descuento = $3, total = $4, monto_inicio = $5,
                costo_repuestos = $6, observaciones = $7, plazo_dias = $8, condiciones = $9, solicita_anticipo = $10, actualizado_en = now()
          WHERE id = $11`,
        [calc.clienteId, calc.vehiculoId, calc.descuento, calc.total, calc.montoInicio, calc.costoRepuestos, e.observaciones, e.plazoDias, calc.condiciones, calc.solicitaAnticipo, id],
      );
      await c.query('DELETE FROM presupuesto_lineas WHERE presupuesto_id = $1', [id]);
      await this.guardarLineas(c, tallerId, id, calc);
      return this.leer(c, id);
    });
  }

  /** Cambia el estado: borrador → enviado → aceptado o rechazado. Queda en el historial. "Vencido" no se elige: es automático. */
  async cambiarEstado(tallerId: string, quien: Contexto, id: string, nuevo: Estado): Promise<Presupuesto> {
    const usuarioId = quien.tipo === 'taller' ? quien.usuarioId : null;
    return this.db.conTaller(tallerId, async (c) => {
      const { rows } = await c.query<{ estado: Estado }>(
        'SELECT estado FROM presupuestos WHERE id = $1 AND eliminado_en IS NULL FOR UPDATE',
        [id],
      );
      if (!rows[0]) throw new NotFoundException('El presupuesto no existe');
      if (!(TRANSICIONES[rows[0].estado] ?? []).includes(nuevo)) {
        throw new ConflictException(`No se puede pasar un presupuesto de "${rows[0].estado}" a "${nuevo}"`);
      }
      await c.query('UPDATE presupuestos SET estado = $1, actualizado_en = now() WHERE id = $2', [nuevo, id]);
      await c.query('INSERT INTO historial_estados (taller_id, presupuesto_id, estado, usuario_id) VALUES ($1, $2, $3, $4)', [
        tallerId,
        id,
        nuevo,
        usuarioId,
      ]);
      return this.leer(c, id);
    });
  }

  async obtener(tallerId: string, id: string): Promise<Presupuesto> {
    return this.db.conTaller(tallerId, (c) => this.leer(c, id));
  }

  private async leer(c: PoolClient, id: string): Promise<Presupuesto> {
    const { rows } = await c.query<{
      id: string;
      numero: number;
      fecha: string;
      valido_hasta: string;
      estado: Estado;
      descuento: number;
      total: number;
      monto_inicio: number;
      solicita_anticipo: boolean;
      costo_repuestos: number;
      observaciones: string | null;
      plazo_dias: number | null;
      condiciones: string;
      cliente_id: string;
      cliente_nombre: string;
      cliente_telefono: string;
      vehiculo_id: string;
      patente: string;
      marca: string | null;
      modelo: string | null;
      anio: number | null;
    }>(
      `SELECT p.id, p.numero, to_char(p.fecha, 'YYYY-MM-DD') AS fecha, to_char(p.valido_hasta, 'YYYY-MM-DD') AS valido_hasta,
              ${ESTADO_EFECTIVO} AS estado, p.descuento, p.total, p.monto_inicio, p.solicita_anticipo, p.costo_repuestos, p.observaciones, p.plazo_dias, p.condiciones,
              c.id AS cliente_id, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono,
              v.id AS vehiculo_id, v.patente, v.marca, v.modelo, v.anio
         FROM presupuestos p
         JOIN clientes c ON c.id = p.cliente_id
         JOIN vehiculos v ON v.id = p.vehiculo_id
        WHERE p.id = $1 AND p.eliminado_en IS NULL`,
      [id],
    );
    const p = rows[0];
    if (!p) throw new NotFoundException('El presupuesto no existe');

    const { rows: filas } = await c.query<{
      id: string;
      pieza_id: string | null;
      nombre_pieza: string;
      posicion: Posicion;
      operacion: Operacion;
      pintura: number;
      desabollado: number;
      repuesto_costo: number;
      margen_pct: string;
      precio_total: number;
      descripcion: string | null;
      zona: Zona | null;
    }>(
      `SELECT id, pieza_id, nombre_pieza, posicion, operacion, pintura, desabollado, repuesto_costo, margen_pct, precio_total, descripcion, zona
         FROM presupuesto_lineas WHERE presupuesto_id = $1 ORDER BY orden`,
      [id],
    );
    const lineas: LineaPresupuesto[] = filas.map((l) => {
      const margenPct = Number(l.margen_pct);
      // El precio del repuesto con margen se deriva de la foto guardada con la misma regla compartida.
      const { repuestoPrecio } = calcularLinea({
        operacion: l.operacion,
        pintura: l.pintura,
        desabollado: l.desabollado,
        repuestoCosto: l.repuesto_costo,
        margenPct,
        precio: l.precio_total,
      });
      return {
        id: l.id,
        piezaId: l.pieza_id,
        nombre: l.nombre_pieza,
        posicion: l.posicion,
        operacion: l.operacion,
        pintura: l.pintura,
        desabollado: l.desabollado,
        repuestoCosto: l.repuesto_costo,
        margenPct,
        repuestoPrecio,
        precioTotal: l.precio_total,
        descripcion: l.descripcion,
        zona: l.zona,
      };
    });
    const subtotal = lineas.reduce((s, l) => s + l.precioTotal, 0);
    const precioRepuestos = lineas.reduce((s, l) => s + l.repuestoPrecio, 0);
    return {
      id: p.id,
      numero: p.numero,
      fecha: p.fecha,
      validoHasta: p.valido_hasta,
      estado: p.estado,
      cliente: { id: p.cliente_id, nombre: p.cliente_nombre, telefono: p.cliente_telefono },
      vehiculo: { id: p.vehiculo_id, patente: p.patente, marca: p.marca, modelo: p.modelo, anio: p.anio },
      lineas,
      subtotal,
      descuento: p.descuento,
      total: p.total,
      montoInicio: p.monto_inicio,
      solicitaAnticipo: p.solicita_anticipo,
      costoRepuestos: p.costo_repuestos,
      precioRepuestos,
      gananciaRepuestos: precioRepuestos - p.costo_repuestos,
      observaciones: p.observaciones,
      plazoDias: p.plazo_dias,
      condiciones: p.condiciones,
    };
  }

  /**
   * Eliminacion logica: deja de verse en la app (lista, detalle, PDF, edicion), pero queda guardado con
   * la fecha y quien lo elimino, y su numero no se reutiliza. Se puede eliminar en cualquier estado.
   */
  async eliminar(tallerId: string, quien: Contexto, id: string): Promise<void> {
    const usuarioId = quien.tipo === 'taller' ? quien.usuarioId : null;
    const r = await this.db.conTaller(tallerId, (c) =>
      c.query('UPDATE presupuestos SET eliminado_en = now(), eliminado_por = $2 WHERE id = $1 AND eliminado_en IS NULL', [id, usuarioId]),
    );
    if (!r.rowCount) throw new NotFoundException('El presupuesto no existe');
  }

  /** Los vigentes, del mas nuevo al mas antiguo, con filtros y de a una pagina. */
  async listar(tallerId: string, f: FiltrosLista): Promise<ListaPresupuestos> {
    const params: unknown[] = [];
    const condiciones = ['p.eliminado_en IS NULL'];
    const agregar = (valor: unknown) => {
      params.push(valor);
      return `$${params.length}`;
    };
    if (f.estado) condiciones.push(`(${ESTADO_EFECTIVO}) = ${agregar(f.estado)}`);
    if (f.desde) condiciones.push(`p.fecha >= ${agregar(f.desde)}::date`);
    if (f.antes) condiciones.push(`p.numero < ${agregar(f.antes)}`);
    const q = f.q?.trim();
    if (q) {
      // Nombre del cliente sin tildes ni mayusculas, parte de la patente, o el numero exacto ("12", "N° 12").
      const alguno = [`unaccent(lower(c.nombre)) LIKE unaccent(lower(${agregar(`%${escaparLike(q)}%`)}))`];
      const patente = normalizarPatente(q);
      if (patente.length >= 2) alguno.push(`v.patente LIKE ${agregar(`%${escaparLike(patente)}%`)}`);
      const numero = q.match(/^(?:n\s*[°º.]?\s*|#\s*)?(\d{1,9})$/i);
      if (numero) alguno.push(`p.numero = ${agregar(Number(numero[1]))}`);
      condiciones.push(`(${alguno.join(' OR ')})`);
    }
    const limite = agregar(f.limite + 1); // uno de mas para saber si hay otra pagina

    const { rows } = await this.db.conTaller(tallerId, (c) =>
      c.query<{
        id: string;
        numero: number;
        fecha: string;
        estado: Estado;
        total: number;
        cliente_id: string;
        cliente_nombre: string;
        vehiculo_id: string;
        patente: string;
        marca: string | null;
        modelo: string | null;
      }>(
        `SELECT p.id, p.numero, to_char(p.fecha, 'YYYY-MM-DD') AS fecha, ${ESTADO_EFECTIVO} AS estado, p.total,
                c.id AS cliente_id, c.nombre AS cliente_nombre, v.id AS vehiculo_id, v.patente, v.marca, v.modelo
           FROM presupuestos p
           JOIN clientes c ON c.id = p.cliente_id
           JOIN vehiculos v ON v.id = p.vehiculo_id
          WHERE ${condiciones.join(' AND ')}
          ORDER BY p.numero DESC
          LIMIT ${limite}`,
        params,
      ),
    );
    const hayMas = rows.length > f.limite;
    const presupuestos = rows.slice(0, f.limite).map((r) => ({
      id: r.id,
      numero: r.numero,
      fecha: r.fecha,
      estado: r.estado,
      total: r.total,
      cliente: { id: r.cliente_id, nombre: r.cliente_nombre },
      vehiculo: { id: r.vehiculo_id, patente: r.patente, marca: r.marca, modelo: r.modelo },
    }));
    return { presupuestos, hayMas };
  }
}
