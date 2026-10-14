import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import { clp } from '../dinero';
import { Encabezado } from '../Encabezado';
import { irA, reemplazarRuta } from '../ruta';
import { useTallerActual } from '../sesion';
import { anticipoPorDefecto, aEnvio, calcularTotales, normalizarPatente } from './calculo';
import { cargarDatosPresupuesto, type DatosPresupuesto } from './datos';
import { borrarBorrador, guardarBorrador, leerBorrador } from './local';
import { PasoAjustes } from './PasoAjustes';
import { PasoPiezas } from './PasoPiezas';
import { PasoVehiculo } from './PasoVehiculo';
import type { Borrador, Presupuesto } from './tipos';

const TITULOS = { 1: 'Vehículo', 2: 'Piezas', 3: 'Ajustar' } as const;
const ESPERA_GUARDADO_MS = 300;

export type Actualizar = (cambio: Partial<Borrador> | ((b: Borrador) => Partial<Borrador>)) => void;

/** Se puede pasar al paso de piezas: patente valida y un vehiculo conocido, o los datos minimos del nuevo. */
export function pasoVehiculoListo(b: Borrador): boolean {
  if (normalizarPatente(b.patente).length < 4) return false;
  if (b.vehiculo || b.clienteExistente) return true;
  return b.nuevo.nombre.trim() !== '' && b.nuevo.telefono.replace(/\D/g, '').length >= 6;
}

/** Nuevo presupuesto en 3 pasos (Vehiculo, Piezas, Ajustar). El avance queda guardado en el telefono. */
export function Asistente({ borradorId }: { borradorId: string }) {
  const tallerId = useTallerActual();
  const [b, setB] = useState<Borrador | null>(null);
  const [datos, setDatos] = useState<DatosPresupuesto | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const temporizador = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!tallerId) return;
    Promise.all([leerBorrador(borradorId), cargarDatosPresupuesto(tallerId)])
      .then(([borrador, d]) => {
        if (!borrador || borrador.tallerId !== tallerId) {
          setErrorCarga('Este borrador ya no existe en este teléfono.');
          return;
        }
        setB(borrador);
        setDatos(d);
      })
      .catch((e: unknown) => setErrorCarga(e instanceof ApiError ? e.message : 'No se pudo abrir el presupuesto'));
  }, [borradorId, tallerId]);

  // Cada cambio se guarda en el telefono (con una pequeña espera para no escribir en cada tecla).
  const actualizar: Actualizar = useCallback((cambio) => {
    setB((previo) => {
      if (!previo) return previo;
      const nuevo = { ...previo, ...(typeof cambio === 'function' ? cambio(previo) : cambio) };
      window.clearTimeout(temporizador.current);
      temporizador.current = window.setTimeout(() => void guardarBorrador(nuevo), ESPERA_GUARDADO_MS);
      return nuevo;
    });
  }, []);

  const totales = useMemo(() => (b && datos ? calcularTotales(b.lineas, b.descuento, datos.config, b.solicitaAnticipo ?? anticipoPorDefecto(datos.config)) : null), [b, datos]);

  if (!b || !datos || !totales) {
    return errorCarga ? (
      <section>
        <p className="error" role="alert">
          {errorCarga}
        </p>
        <div className="pila">
          <button type="button" className="boton secundario" onClick={() => irA('/')}>
            Volver a presupuestos
          </button>
        </div>
      </section>
    ) : (
      <p className="vacio">Cargando…</p>
    );
  }

  const irAPaso = (paso: Borrador['paso']) => {
    actualizar({ paso });
    document.querySelector('.contenido')?.scrollTo(0, 0);
  };

  async function guardar() {
    if (!b || !datos) return;
    setErrorGuardar(null);
    setGuardando(true);
    // Lo ultimo escrito queda en el telefono antes de enviar, por si falla la conexion.
    window.clearTimeout(temporizador.current);
    await guardarBorrador(b);
    try {
      const cuerpo = aEnvio(b, datos.config.condiciones, datos.config);
      const p = b.presupuestoId
        ? await api<Presupuesto>(`/presupuestos/${b.presupuestoId}`, { method: 'PUT', json: cuerpo })
        : await api<Presupuesto>('/presupuestos', { method: 'POST', json: cuerpo });
      await borrarBorrador(b.id);
      reemplazarRuta(`/presupuestos/${p.id}`);
    } catch (e) {
      setGuardando(false);
      setErrorGuardar(
        e instanceof ApiError && e.status === 0
          ? 'No hay conexión. Tu presupuesto quedó guardado en este teléfono: guárdalo de nuevo cuando vuelva la señal.'
          : e instanceof ApiError
            ? e.message
            : 'No se pudo guardar el presupuesto',
      );
    }
  }

  const listo = b.paso === 1 ? pasoVehiculoListo(b) : b.lineas.length > 0;
  const cantidad = b.lineas.length;

  return (
    <section className="asistente">
      <Encabezado
        paso={b.paso}
        titulo={TITULOS[b.paso]}
        sub={b.paso === 3 ? "Parten con los valores de tu taller; puedes cambiarlos en cada pieza." : b.numero ? `Presupuesto N° ${b.numero}` : undefined}
        atras={
          b.paso > 1
            ? { texto: TITULOS[(b.paso - 1) as 1 | 2], onClick: () => irAPaso((b.paso - 1) as Borrador["paso"]) }
            : { texto: "Presupuestos", ruta: "/" }
        }
      />

      {b.paso === 1 && <PasoVehiculo b={b} actualizar={actualizar} />}
      {b.paso === 2 && <PasoPiezas b={b} actualizar={actualizar} datos={datos} />}
      {b.paso === 3 && <PasoAjustes b={b} actualizar={actualizar} datos={datos} totales={totales} />}

      <div className="barra-accion">
        {datos.desdeCopia && (
          <p className="aviso aviso-barra" role="status">
            Sin conexión: usando la última copia de tus piezas y tarifas. Puedes seguir; guardas cuando vuelva la señal.
          </p>
        )}
        {errorGuardar && (
          <p className="error aviso-barra" role="alert">
            {errorGuardar}
          </p>
        )}
        <div className="fila-total">
          <span className="detalle">
            {cantidad === 0 ? 'Sin piezas' : `${cantidad} ${cantidad === 1 ? 'pieza' : 'piezas'}`}
          </span>
          <span className="total-vivo" aria-live="polite">
            {clp(totales.total)}
          </span>
        </div>
        {b.paso < 3 ? (
          <button type="button" className="boton" disabled={!listo} onClick={() => irAPaso((b.paso + 1) as Borrador['paso'])}>
            Siguiente
          </button>
        ) : (
          <button type="button" className="boton" disabled={!listo || guardando} onClick={() => void guardar()}>
            {guardando ? 'Guardando…' : b.presupuestoId ? 'Guardar cambios' : 'Guardar presupuesto'}
          </button>
        )}
      </div>
    </section>
  );
}
