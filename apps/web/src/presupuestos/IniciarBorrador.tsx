import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import type { ClienteDetalle } from '../clientes/tipos';
import { reemplazarRuta } from '../ruta';
import { useTallerActual } from '../sesion';
import { cargarDatosPresupuesto } from './datos';
import { guardarBorrador, leerBorrador } from './local';
import type { Borrador, Presupuesto, VehiculoEncontrado } from './tipos';

type Modo =
  | { tipo: 'nuevo' }
  | { tipo: 'vehiculo'; vehiculoId: string }
  | { tipo: 'cliente'; clienteId: string }
  | { tipo: 'editar'; presupuestoId: string };

export function borradorVacio(tallerId: string): Borrador {
  return {
    id: crypto.randomUUID(),
    tallerId,
    presupuestoId: null,
    numero: null,
    paso: 1,
    patente: '',
    vehiculo: null,
    clienteExistente: null,
    nuevo: { nombre: '', telefono: '', marca: '', modelo: '', anio: '' },
    lado: 'izquierda',
    lineas: [],
    descuento: 0,
    observaciones: '',
    plazoDias: 0,
    condiciones: null,
    actualizado: Date.now(),
  };
}

/**
 * Prepara un borrador (nuevo, para un vehiculo ya conocido, o para editar un presupuesto guardado),
 * lo deja en el telefono y abre el asistente. Usa reemplazarRuta para que "atras" no vuelva aqui.
 */
export function IniciarBorrador({ modo }: { modo: Modo }) {
  const tallerId = useTallerActual();
  const [error, setError] = useState<string | null>(null);
  const hecho = useRef(false);

  useEffect(() => {
    if (!tallerId || hecho.current) return;
    hecho.current = true; // en modo estricto React ejecuta el efecto dos veces: un solo borrador
    (async () => {
      if (modo.tipo === 'editar') {
        const id = `editar-${modo.presupuestoId}`;
        if (!(await leerBorrador(id))) {
          const [p, datos] = await Promise.all([api<Presupuesto>(`/presupuestos/${modo.presupuestoId}`), cargarDatosPresupuesto(tallerId)]);
          const usaPosicion = new Map(datos.piezas.map((x) => [x.id, x.usaPosicion]));
          await guardarBorrador({
            ...borradorVacio(tallerId),
            id,
            presupuestoId: p.id,
            numero: p.numero,
            paso: 3,
            patente: p.vehiculo.patente,
            vehiculo: { ...p.vehiculo, cliente: p.cliente },
            lineas: p.lineas.map((l) => ({
              clave: l.id,
              piezaId: l.piezaId,
              nombre: l.nombre,
              usaPosicion: (l.piezaId ? usaPosicion.get(l.piezaId) : undefined) ?? l.posicion !== 'no_aplica',
              posicion: l.posicion,
              operacion: l.operacion,
              pintura: l.pintura,
              desabollado: l.desabollado,
              repuestoCosto: l.repuestoCosto,
              margenPct: l.margenPct,
              precio: l.operacion === 'libre' ? l.precioTotal : 0,
            })),
            descuento: p.descuento,
            observaciones: p.observaciones ?? '',
            plazoDias: p.plazoDias ?? 0,
            condiciones: p.condiciones,
          });
        }
        reemplazarRuta(`/presupuestos/borrador/${id}`);
        return;
      }

      const b = borradorVacio(tallerId);
      if (modo.tipo === 'vehiculo') {
        const v = await api<VehiculoEncontrado>(`/vehiculos/${modo.vehiculoId}`);
        b.vehiculo = { id: v.id, patente: v.patente, marca: v.marca, modelo: v.modelo, anio: v.anio, cliente: v.cliente };
        b.patente = v.patente;
        b.paso = 2;
      }
      if (modo.tipo === 'cliente') {
        const c = await api<ClienteDetalle>(`/clientes/${modo.clienteId}`);
        if (c.vehiculos.length === 1) {
          const v = c.vehiculos[0];
          b.vehiculo = { id: v.id, patente: v.patente, marca: v.marca, modelo: v.modelo, anio: v.anio, cliente: { id: c.id, nombre: c.nombre, telefono: c.telefono } };
          b.patente = v.patente;
          b.paso = 2;
        } else if (c.vehiculos.length === 0) {
          b.clienteExistente = { id: c.id, nombre: c.nombre, telefono: c.telefono };
        } else {
          b.busqueda = c.nombre; // varios vehiculos: se elige en el buscador
        }
      }
      await guardarBorrador(b);
      reemplazarRuta(`/presupuestos/borrador/${b.id}`);
    })().catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'No se pudo preparar el presupuesto'));
  }, [tallerId, modo]);

  return error ? (
    <p className="error" role="alert">
      {error}
    </p>
  ) : (
    <p className="vacio">Preparando…</p>
  );
}
