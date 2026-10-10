import { useEffect, useState } from 'react';
import { api } from '../api';
import { Icono } from '../Iconos';
import { irA } from '../ruta';
import { useTallerActual } from '../sesion';

// Lo que se usa de `ConfigTaller` de apps/api/src/taller/taller.service.ts.
interface Config {
  direccion: string | null;
  telefono: string | null;
  datosTransferencia: string | null;
  margenRepuestosPct: number;
  tarifaPintura: number;
  condiciones: string;
}

interface Pendiente {
  clave: string;
  texto: string;
  hecho: boolean;
}

function pendientesDe(c: Config): Pendiente[] {
  return [
    { clave: 'tarifa', texto: 'Tarifa de pintura', hecho: c.tarifaPintura > 0 },
    { clave: 'margen', texto: 'Margen de los repuestos', hecho: c.margenRepuestosPct > 0 },
    { clave: 'condiciones', texto: 'Condiciones del presupuesto', hecho: c.condiciones.trim() !== '' },
    { clave: 'transferencia', texto: 'Datos de transferencia', hecho: !!c.datosTransferencia?.trim() },
    { clave: 'contacto', texto: 'Dirección y teléfono del taller', hecho: !!c.direccion?.trim() && !!c.telefono?.trim() },
  ];
}

const claveOculta = (tallerId: string) => `config-pendiente-oculta-${tallerId}`;

/**
 * Aviso para un taller nuevo: lo que falta configurar para que los presupuestos salgan completos (tarifa,
 * margen, condiciones, transferencia y contacto). Desaparece solo cuando todo esta listo; se puede ocultar.
 */
export function ConfiguracionPendiente() {
  const tallerId = useTallerActual();
  const [config, setConfig] = useState<Config | null>(null);
  const [oculta, setOculta] = useState(() => {
    try {
      return tallerId ? localStorage.getItem(claveOculta(tallerId)) === '1' : false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    api<Config>('/taller')
      .then(setConfig)
      .catch(() => undefined); // sin conexion: simplemente no se muestra
  }, []);

  if (!config || oculta) return null;
  const lista = pendientesDe(config);
  const faltan = lista.filter((p) => !p.hecho);
  if (faltan.length === 0) return null;

  function ocultar() {
    setOculta(true);
    try {
      if (tallerId) localStorage.setItem(claveOculta(tallerId), '1');
    } catch {
      // sin almacenamiento local: se oculta solo hasta recargar
    }
  }

  return (
    <>
      <h2>Termina de configurar tu taller</h2>
      <div className="grupo">
        <button type="button" className="item" onClick={() => irA('/mi-taller')}>
          <span className="item-texto">
            <span className="detalle">Con esto tus presupuestos y el PDF salen completos.</span>
            <ul className="lista-pendientes">
              {lista.map((p) => (
                <li key={p.clave} className={p.hecho ? 'hecho' : 'pendiente'}>
                  <span className="marca-pendiente" aria-hidden="true">
                    {p.hecho ? <Icono nombre="check" /> : null}
                  </span>
                  <span>
                    {p.texto}
                    <span className="sr-solo">{p.hecho ? ' (listo)' : ' (falta)'}</span>
                  </span>
                </li>
              ))}
            </ul>
          </span>
          <Icono nombre="chevron" />
        </button>
        <div className="item item-acciones">
          <button type="button" className="enlace" onClick={ocultar}>
            Ocultar este aviso
          </button>
        </div>
      </div>
    </>
  );
}
