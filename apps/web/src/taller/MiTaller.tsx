import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { mensajeDe, useAcciones } from '../acciones';

type TipoAnticipo = 'ninguno' | 'repuestos' | 'porcentaje' | 'fijo';

// Debe coincidir con `ConfigTaller` de apps/api/src/taller/taller.service.ts.
interface Config {
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  datosTransferencia: string | null;
  margenRepuestosPct: number;
  anticipo: { tipo: TipoAnticipo; valor: number | null };
  validezDias: number;
  condiciones: string;
}

const OPCIONES_ANTICIPO: { valor: TipoAnticipo; texto: string }[] = [
  { valor: 'ninguno', texto: 'Sin anticipo' },
  { valor: 'repuestos', texto: 'Monto de los repuestos' },
  { valor: 'porcentaje', texto: 'Porcentaje del total' },
  { valor: 'fijo', texto: 'Monto fijo' },
];

export function MiTaller() {
  const [config, setConfig] = useState<Config | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const cargar = useCallback(() => {
    api<Config>('/taller')
      .then(setConfig)
      .catch((e: unknown) => setErrorCarga(mensajeDe(e, 'No se pudo cargar el taller')));
  }, []);
  useEffect(cargar, [cargar]);

  if (!config) {
    return errorCarga ? (
      <p className="error" role="alert">
        {errorCarga}
      </p>
    ) : (
      <p className="detalle">Cargando…</p>
    );
  }
  return <Formulario config={config} alGuardar={setConfig} />;
}

function Formulario({ config, alGuardar }: { config: Config; alGuardar: (c: Config) => void }) {
  const [nombre, setNombre] = useState(config.nombre);
  const [direccion, setDireccion] = useState(config.direccion ?? '');
  const [telefono, setTelefono] = useState(config.telefono ?? '');
  const [transferencia, setTransferencia] = useState(config.datosTransferencia ?? '');
  const [margen, setMargen] = useState(String(config.margenRepuestosPct).replace('.', ','));
  const [validez, setValidez] = useState(String(config.validezDias));
  const [tipoAnticipo, setTipoAnticipo] = useState<TipoAnticipo>(config.anticipo.tipo);
  const [valorAnticipo, setValorAnticipo] = useState(String(config.anticipo.valor ?? ''));
  const [condiciones, setCondiciones] = useState(config.condiciones);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const { error, aviso, ejecutar } = useAcciones(() => undefined);

  function guardar(e: FormEvent) {
    e.preventDefault();
    setErrorLocal(null);
    // En Chile el decimal se escribe con coma: se acepta "22,5" y "22.5".
    const margenNum = Number(margen.replace(',', '.'));
    if (margen.trim() === '' || !Number.isFinite(margenNum)) return setErrorLocal('El margen debe ser un número');
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
          margenRepuestosPct: margenNum,
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
      <h1>Datos del taller</h1>
      <form onSubmit={guardar} className="formulario">
        <label>
          Nombre del taller
          <input required maxLength={120} value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <label>
          Dirección
          <input maxLength={200} autoComplete="street-address" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
        </label>
        <label>
          Teléfono
          <input type="tel" maxLength={40} autoComplete="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        </label>
        <label>
          Datos de transferencia
          <span className="ayuda">Aparecen en el PDF del presupuesto (banco, tipo y número de cuenta, RUT, titular).</span>
          <textarea rows={4} maxLength={1000} value={transferencia} onChange={(e) => setTransferencia(e.target.value)} />
        </label>

        <h2>Presupuestos</h2>
        <label>
          Margen sobre los repuestos (%)
          <span className="ayuda">Valor por defecto. En cada presupuesto se puede cambiar.</span>
          <input inputMode="decimal" required value={margen} onChange={(e) => setMargen(e.target.value)} />
        </label>
        <label>
          Validez del presupuesto (días)
          <input type="number" inputMode="numeric" min={1} max={365} required value={validez} onChange={(e) => setValidez(e.target.value)} />
        </label>
        <label>
          Anticipo para iniciar el trabajo
          <select value={tipoAnticipo} onChange={(e) => setTipoAnticipo(e.target.value as TipoAnticipo)}>
            {OPCIONES_ANTICIPO.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.texto}
              </option>
            ))}
          </select>
        </label>
        {(tipoAnticipo === 'porcentaje' || tipoAnticipo === 'fijo') && (
          <label>
            {tipoAnticipo === 'porcentaje' ? 'Porcentaje del total (%)' : 'Monto fijo ($)'}
            <input
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
        <label>
          Condiciones
          <span className="ayuda">Aparecen en el PDF (plazos, daños ocultos, forma de pago…). Se pueden editar en cada presupuesto.</span>
          <textarea rows={5} maxLength={4000} value={condiciones} onChange={(e) => setCondiciones(e.target.value)} />
        </label>

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
    </section>
  );
}
