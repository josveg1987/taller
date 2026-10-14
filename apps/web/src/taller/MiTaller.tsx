import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { DETALLE_DESABOLLADO_ESTANDAR, DETALLE_PINTURA_ESTANDAR, detalleEfectivo } from '@taller/shared';
import { api } from '../api';
import { mensajeDe, useAcciones } from '../acciones';
import { clp } from '../dinero';
import { HojaSelector } from '../Hoja';
import { Cargando } from '../Cargando';
import { Encabezado } from '../Encabezado';
import { Icono } from '../Iconos';
import { irA } from '../ruta';

type TipoAnticipo = 'ninguno' | 'repuestos' | 'porcentaje' | 'fijo';

// Debe coincidir con `ConfigTaller` de apps/api/src/taller/taller.service.ts.
interface Config {
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  datosTransferencia: string | null;
  detallePintura: string;
  detalleDesabollado: string;
  margenRepuestosPct: number;
  tarifaPintura: number;
  montosDesabollado: number[];
  anticipo: { tipo: TipoAnticipo; valor: number | null };
  validezDias: number;
  condiciones: string;
}

const OPCIONES_ANTICIPO = [
  { valor: 'ninguno', texto: 'Sin anticipo' },
  { valor: 'repuestos', texto: 'Monto de los repuestos' },
  { valor: 'porcentaje', texto: 'Porcentaje del total' },
  { valor: 'fijo', texto: 'Monto fijo' },
] as const satisfies readonly { valor: TipoAnticipo; texto: string }[];

export function MiTaller() {
  const [config, setConfig] = useState<Config | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const cargar = useCallback(() => {
    api<Config>('/taller')
      .then(setConfig)
      .catch((e: unknown) => setErrorCarga(mensajeDe(e, 'No se pudo cargar el taller')));
  }, []);
  useEffect(cargar, [cargar]);

  if (!config) return <Cargando titulo="Mi taller" error={errorCarga} />;
  return <Formulario config={config} alGuardar={setConfig} />;
}

function Formulario({ config, alGuardar }: { config: Config; alGuardar: (c: Config) => void }) {
  const [nombre, setNombre] = useState(config.nombre);
  const [direccion, setDireccion] = useState(config.direccion ?? '');
  const [telefono, setTelefono] = useState(config.telefono ?? '');
  const [transferencia, setTransferencia] = useState(config.datosTransferencia ?? '');
  const [detallePintura, setDetallePintura] = useState(detalleEfectivo(config.detallePintura, DETALLE_PINTURA_ESTANDAR));
  const [detalleDesabollado, setDetalleDesabollado] = useState(detalleEfectivo(config.detalleDesabollado, DETALLE_DESABOLLADO_ESTANDAR));
  const [margen, setMargen] = useState(String(config.margenRepuestosPct).replace('.', ','));
  const [tarifa, setTarifa] = useState(String(config.tarifaPintura));
  const [montos, setMontos] = useState<number[]>(config.montosDesabollado);
  const [montoNuevo, setMontoNuevo] = useState('');
  const [validez, setValidez] = useState(String(config.validezDias));
  const [tipoAnticipo, setTipoAnticipo] = useState<TipoAnticipo>(config.anticipo.tipo);
  const [valorAnticipo, setValorAnticipo] = useState(String(config.anticipo.valor ?? ''));
  const [condiciones, setCondiciones] = useState(config.condiciones);
  const [eligiendoAnticipo, setEligiendoAnticipo] = useState(false);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const { error, aviso, ejecutar } = useAcciones(() => undefined);

  const textoAnticipo = OPCIONES_ANTICIPO.find((o) => o.valor === tipoAnticipo)?.texto;

  function agregarMonto() {
    const n = Number(montoNuevo.replace(/\D/g, ''));
    if (!n || montos.length >= 12) return;
    setMontos([...new Set([...montos, n])].sort((x, y) => x - y));
    setMontoNuevo('');
  }

  function guardar(e: FormEvent) {
    e.preventDefault();
    setErrorLocal(null);
    // En Chile el decimal se escribe con coma: se acepta "22,5" y "22.5".
    const margenNum = Number(margen.replace(',', '.'));
    if (margen.trim() === '' || !Number.isFinite(margenNum)) return setErrorLocal('El margen debe ser un número');
    const tarifaNum = Number(tarifa.replace(/\D/g, ''));
    if (tarifa.trim() === '' || !Number.isFinite(tarifaNum)) return setErrorLocal('La tarifa de pintura debe ser un número');
    const anticipo =
      tipoAnticipo === 'porcentaje' || tipoAnticipo === 'fijo'
        ? { tipo: tipoAnticipo, valor: Number(valorAnticipo) }
        : { tipo: tipoAnticipo, valor: null };
    if (anticipo.valor !== null && (valorAnticipo.trim() === '' || !Number.isFinite(anticipo.valor))) {
      return setErrorLocal('Indica el valor del anticipo');
    }

    void ejecutar(async () => {
      const nueva = await api<Config>('/taller', {
        method: 'PATCH',
        json: {
          nombre,
          direccion,
          telefono,
          datosTransferencia: transferencia,
          detallePintura,
          detalleDesabollado,
          margenRepuestosPct: margenNum,
          tarifaPintura: tarifaNum,
          montosDesabollado: montos,
          validezDias: Number(validez),
          anticipo,
          condiciones,
        },
      });
      alGuardar(nueva);
    }, 'Cambios guardados');
  }

  return (
    <section>
      <Encabezado titulo="Mi taller" sub="Estos datos aparecen en tus presupuestos." />

      <div className="flotante sin-relleno">
        <button type="button" className="item" onClick={() => irA('/usuarios')}>
          <span className="icono-circulo">
            <Icono nombre="usuarios" />
          </span>
          <span className="item-texto">
            <span className="item-titulo">Usuarios</span>
            <span className="detalle">Quiénes pueden entrar a la app</span>
          </span>
          <Icono nombre="chevron" />
        </button>
        <button type="button" className="item" onClick={() => irA('/cuentas')}>
          <span className="icono-circulo">
            <Icono nombre="banco" />
          </span>
          <span className="item-texto">
            <span className="item-titulo">Cuentas para transferir</span>
            <span className="detalle">Las que se muestran en el PDF</span>
          </span>
          <Icono nombre="chevron" />
        </button>
        <button type="button" className="item" onClick={() => irA('/piezas')}>
          <span className="icono-circulo">
            <Icono nombre="ajustes" />
          </span>
          <span className="item-texto">
            <span className="item-titulo">Piezas</span>
            <span className="detalle">Qué cotizas y a qué tarifa</span>
          </span>
          <Icono nombre="chevron" />
        </button>
        <button type="button" className="item" onClick={() => irA('/servicios')}>
          <span className="icono-circulo">
            <Icono nombre="servicio" />
          </span>
          <span className="item-texto">
            <span className="item-titulo">Servicios</span>
            <span className="detalle">Pulido y otros trabajos con precio sugerido</span>
          </span>
          <Icono nombre="chevron" />
        </button>
        <button type="button" className="item" onClick={() => irA('/combos')}>
          <span className="icono-circulo">
            <Icono nombre="mas" />
          </span>
          <span className="item-texto">
            <span className="item-titulo">Combos</span>
            <span className="detalle">Grupos de piezas, como “Lateral completo”</span>
          </span>
          <Icono nombre="chevron" />
        </button>
      </div>

      <form onSubmit={guardar} className="formulario cuerpo">
        <h2>Datos</h2>
        <div className="grupo formulario">
          <label className="campo">
            Nombre del taller
            <input required maxLength={120} value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </label>
          <label className="campo">
            Dirección
            <span className="ayuda">Sale destacada en el PDF, junto al teléfono.</span>
            <input maxLength={200} autoComplete="street-address" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
          </label>
          <label className="campo">
            Teléfono
            <input type="tel" maxLength={40} autoComplete="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          </label>
          <label className="campo">
            Notas de pago (opcional)
            <span className="ayuda">Texto extra bajo las cuentas del PDF. Por ejemplo: “Envía el comprobante por WhatsApp”. Las cuentas se agregan en “Cuentas para transferir”.</span>
            <textarea rows={4} maxLength={1000} value={transferencia} onChange={(e) => setTransferencia(e.target.value)} />
          </label>
        </div>

        <h2>Detalle del trabajo</h2>
        <div className="grupo formulario">
          <p className="ayuda">
            En el PDF aparece “Qué incluye el trabajo”, solo con lo que lleva el presupuesto. Un paso por línea.
          </p>
          <label className="campo">
            Pintura
            <textarea rows={7} maxLength={1500} value={detallePintura} onChange={(e) => setDetallePintura(e.target.value)} />
          </label>
          <button type="button" className="enlace" onClick={() => setDetallePintura(DETALLE_PINTURA_ESTANDAR)}>
            Restablecer el texto estándar de pintura
          </button>
          <label className="campo">
            Desabolladura
            <textarea rows={5} maxLength={1500} value={detalleDesabollado} onChange={(e) => setDetalleDesabollado(e.target.value)} />
          </label>
          <button type="button" className="enlace" onClick={() => setDetalleDesabollado(DETALLE_DESABOLLADO_ESTANDAR)}>
            Restablecer el texto estándar de desabolladura
          </button>
        </div>

        <h2>Presupuestos</h2>
        <div className="grupo">
          <label className="item campo-fila">
            <span className="item-texto">
              <span className="item-titulo">Tarifa de pintura por pieza ($)</span>
              <span className="detalle">Por defecto; cada pieza puede tener la suya.</span>
            </span>
            <input className="corto" inputMode="numeric" required value={tarifa} onChange={(e) => setTarifa(e.target.value)} />
          </label>
          <div className="item columna">
            <span className="item-texto">
              <span className="item-titulo">Montos rápidos de desabollado</span>
              <span className="detalle">Toca un monto para quitarlo.</span>
            </span>
            <div className="fila-montos">
              {montos.map((m) => (
                <button key={m} type="button" className="chip-monto" aria-label={`Quitar ${clp(m)}`} onClick={() => setMontos(montos.filter((x) => x !== m))}>
                  {clp(m)} ✕
                </button>
              ))}
            </div>
            <div className="campo-clave">
              <input
                inputMode="numeric"
                aria-label="Agregar un monto rápido"
                placeholder="Agregar monto"
                value={montoNuevo}
                onChange={(e) => setMontoNuevo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    agregarMonto();
                  }
                }}
              />
              <button type="button" className="enlace" onClick={agregarMonto}>
                Agregar
              </button>
            </div>
          </div>
          <label className="item campo-fila">
            <span className="item-texto">
              <span className="item-titulo">Margen sobre repuestos (%)</span>
              <span className="detalle">Por defecto; se puede cambiar en cada presupuesto.</span>
            </span>
            <input className="corto" inputMode="decimal" required value={margen} onChange={(e) => setMargen(e.target.value)} />
          </label>
          <label className="item campo-fila">
            <span className="item-texto">
              <span className="item-titulo">Validez (días)</span>
            </span>
            <input className="corto" type="number" inputMode="numeric" min={1} max={365} required value={validez} onChange={(e) => setValidez(e.target.value)} />
          </label>
          <button type="button" className="item" onClick={() => setEligiendoAnticipo(true)}>
            <span className="item-texto">
              <span className="item-titulo">Anticipo</span>
              <span className="detalle">{textoAnticipo}</span>
            </span>
            <Icono nombre="chevron" />
          </button>
          {(tipoAnticipo === 'porcentaje' || tipoAnticipo === 'fijo') && (
            <label className="item campo-fila">
              <span className="item-texto">
                <span className="item-titulo">{tipoAnticipo === 'porcentaje' ? 'Porcentaje del total (%)' : 'Monto fijo ($)'}</span>
              </span>
              <input
                className="corto"
                type="number"
                inputMode="numeric"
                min={tipoAnticipo === 'porcentaje' ? 1 : 0}
                max={tipoAnticipo === 'porcentaje' ? 100 : 100000000}
                required
                value={valorAnticipo}
                onChange={(e) => setValorAnticipo(e.target.value)}
              />
            </label>
          )}
        </div>

        <h2>Condiciones</h2>
        <div className="grupo formulario">
          <label className="campo">
            <span className="ayuda">Van en el PDF (plazos, daños ocultos, forma de pago…). Se editan en cada presupuesto.</span>
            <textarea rows={5} maxLength={4000} value={condiciones} onChange={(e) => setCondiciones(e.target.value)} />
          </label>
        </div>

        {(errorLocal ?? error) && (
          <p className="error" role="alert">
            {errorLocal ?? error}
          </p>
        )}
        {aviso && (
          <p className="ok" role="status">
            {aviso}
          </p>
        )}
        <button type="submit" className="boton">
          Guardar cambios
        </button>
      </form>

      <HojaSelector<TipoAnticipo>
        abierta={eligiendoAnticipo}
        titulo="Anticipo"
        opciones={OPCIONES_ANTICIPO}
        valor={tipoAnticipo}
        onElegir={setTipoAnticipo}
        onCerrar={() => setEligiendoAnticipo(false)}
      />
    </section>
  );
}
