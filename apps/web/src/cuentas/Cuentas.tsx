import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { mensajeDe, useAcciones } from '../acciones';
import { Hoja, HojaConfirmar } from '../Hoja';
import { Cargando } from '../Cargando';
import { Encabezado } from '../Encabezado';
import { Icono } from '../Iconos';

type TipoCuenta = 'corriente' | 'vista' | 'ahorro';

// Debe coincidir con `CuentaBancaria` de apps/api/src/cuentas/cuentas.service.ts.
interface Cuenta {
  id: string;
  titular: string;
  rut: string;
  banco: string;
  tipoCuenta: TipoCuenta;
  numero: string;
  email: string | null;
  activa: boolean;
  orden: number;
}

interface DatosCuenta {
  titular: string;
  rut: string;
  banco: string;
  tipoCuenta: TipoCuenta;
  numero: string;
  email: string | null;
  activa: boolean;
}

const TIPOS: { valor: TipoCuenta; texto: string }[] = [
  { valor: 'corriente', texto: 'Corriente' },
  { valor: 'vista', texto: 'Vista / RUT' },
  { valor: 'ahorro', texto: 'Ahorro' },
];
const NOMBRE_TIPO: Record<TipoCuenta, string> = { corriente: 'Cuenta corriente', vista: 'Cuenta vista', ahorro: 'Cuenta de ahorro' };

// Sugerencias al escribir el banco; se puede escribir cualquier otro.
const BANCOS = [
  'Banco Estado',
  'Banco de Chile',
  'Banco Santander',
  'BCI',
  'Banco Falabella',
  'Banco Itaú',
  'Scotiabank',
  'Banco Security',
  'Banco Ripley',
  'Banco Consorcio',
  'Banco BICE',
  'Mercado Pago',
  'Tenpo',
  'Mach',
  'Tapp',
];

export function Cuentas() {
  const [cuentas, setCuentas] = useState<Cuenta[] | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [idHoja, setIdHoja] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  const cargar = useCallback(() => {
    api<Cuenta[]>('/cuentas?todas=1')
      .then(setCuentas)
      .catch((e: unknown) => setErrorCarga(mensajeDe(e, 'No se pudieron cargar las cuentas')));
  }, []);
  useEffect(cargar, [cargar]);
  const { error, aviso, ejecutar, limpiarError } = useAcciones(cargar);

  if (!cuentas) return <Cargando titulo="Cuentas para transferir" atras={{ texto: 'Mi taller', ruta: '/mi-taller' }} error={errorCarga} />;

  const elegida = cuentas.find((c) => c.id === idHoja);
  const indice = cuentas.findIndex((c) => c.id === idHoja);
  const cerrar = (poner: (v: boolean) => void) => () => {
    limpiarError();
    poner(false);
  };

  return (
    <section>
      <Encabezado
        titulo="Cuentas para transferir"
        sub="Las cuentas activas salen destacadas en el PDF de cada presupuesto."
        atras={{ texto: 'Mi taller', ruta: '/mi-taller' }}
      />

      <div className="flotante">
        <button
          type="button"
          className="boton"
          onClick={() => {
            limpiarError();
            setCreando(true);
          }}
        >
          <Icono nombre="mas" />
          Nueva cuenta
        </button>
      </div>

      <div className="cuerpo">
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {aviso && (
          <p className="ok" role="status">
            {aviso}
          </p>
        )}

        {cuentas.length === 0 ? (
          <p className="vacio">Aún no tienes cuentas. El PDF saldrá sin datos para transferir.</p>
        ) : (
          <ul className="grupo">
            {cuentas.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="item"
                  onClick={() => {
                    limpiarError();
                    setIdHoja(c.id);
                    setEditando(true);
                  }}
                >
                  <span className="icono-circulo">
                    <Icono nombre="banco" />
                  </span>
                  <span className="item-texto">
                    <span className="item-titulo">{c.banco}</span>
                    <span className="detalle">
                      {NOMBRE_TIPO[c.tipoCuenta]} · N° {c.numero} · {c.titular}
                    </span>
                  </span>
                  {!c.activa && <span className="chip suspendido">Oculta</span>}
                  <Icono nombre="chevron" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Hoja abierta={creando} titulo="Nueva cuenta" onCerrar={cerrar(setCreando)}>
        <FormularioCuenta
          textoBoton="Crear cuenta"
          error={error}
          onGuardar={(d) =>
            void ejecutar(() => api('/cuentas', { method: 'POST', json: d }), 'Cuenta creada').then((ok) => ok && setCreando(false))
          }
        />
      </Hoja>

      <Hoja abierta={editando} titulo={elegida?.banco ?? 'Cuenta'} onCerrar={cerrar(setEditando)}>
        {elegida && (
          <>
            <FormularioCuenta
              inicial={elegida}
              textoBoton="Guardar cambios"
              error={error}
              onGuardar={(d) =>
                void ejecutar(() => api(`/cuentas/${elegida.id}`, { method: 'PATCH', json: d }), 'Cuenta actualizada').then((ok) => ok && setEditando(false))
              }
            />
            <div className="pila">
              <button
                type="button"
                className="boton secundario"
                disabled={indice <= 0}
                onClick={() => void ejecutar(() => api(`/cuentas/${elegida.id}/mover`, { method: 'POST', json: { direccion: 'arriba' } }))}
              >
                Subir en la lista
              </button>
              <button
                type="button"
                className="boton secundario"
                disabled={indice >= cuentas.length - 1}
                onClick={() => void ejecutar(() => api(`/cuentas/${elegida.id}/mover`, { method: 'POST', json: { direccion: 'abajo' } }))}
              >
                Bajar en la lista
              </button>
            </div>
            <div className="centro">
              <button type="button" className="enlace peligro" onClick={() => setEliminando(true)}>
                Eliminar cuenta
              </button>
            </div>
          </>
        )}
      </Hoja>

      <HojaConfirmar
        abierta={eliminando}
        titulo={`¿Eliminar la cuenta de ${elegida?.banco ?? 'este banco'}?`}
        texto="Los presupuestos nuevos ya no la mostrarán. Si solo quieres dejar de mostrarla, mejor ocúltala."
        textoBoton="Eliminar"
        peligro
        onCerrar={() => setEliminando(false)}
        onConfirmar={() => {
          setEliminando(false);
          if (elegida) void ejecutar(() => api(`/cuentas/${elegida.id}`, { method: 'DELETE' }), 'Cuenta eliminada').then((ok) => ok && setEditando(false));
        }}
      />
    </section>
  );
}

function FormularioCuenta({
  inicial,
  textoBoton,
  error,
  onGuardar,
}: {
  inicial?: Cuenta;
  textoBoton: string;
  error: string | null;
  onGuardar(d: DatosCuenta): void;
}) {
  const [titular, setTitular] = useState(inicial?.titular ?? '');
  const [rut, setRut] = useState(inicial?.rut ?? '');
  const [banco, setBanco] = useState(inicial?.banco ?? '');
  const [tipoCuenta, setTipoCuenta] = useState<TipoCuenta>(inicial?.tipoCuenta ?? 'corriente');
  const [numero, setNumero] = useState(inicial?.numero ?? '');
  const [email, setEmail] = useState(inicial?.email ?? '');
  const [activa, setActiva] = useState(inicial?.activa ?? true);

  function enviar(e: FormEvent) {
    e.preventDefault();
    onGuardar({ titular, rut, banco, tipoCuenta, numero, email: email.trim() || null, activa });
  }

  return (
    <form onSubmit={enviar} className="formulario">
      <label className="campo">
        Banco
        <input required maxLength={60} list="bancos-chile" autoComplete="off" value={banco} onChange={(e) => setBanco(e.target.value)} />
        <datalist id="bancos-chile">
          {BANCOS.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
      </label>
      <div className="campo">
        Tipo de cuenta
        <div className="segmentos ancho" role="group" aria-label="Tipo de cuenta">
          {TIPOS.map((t) => (
            <button key={t.valor} type="button" className="segmento" aria-pressed={tipoCuenta === t.valor} onClick={() => setTipoCuenta(t.valor)}>
              {t.texto}
            </button>
          ))}
        </div>
      </div>
      <label className="campo">
        Número de cuenta
        <input required inputMode="numeric" maxLength={30} autoComplete="off" value={numero} onChange={(e) => setNumero(e.target.value)} />
      </label>
      <label className="campo">
        Titular
        <input required maxLength={120} autoComplete="off" value={titular} onChange={(e) => setTitular(e.target.value)} />
      </label>
      <label className="campo">
        RUT del titular
        <input required maxLength={14} autoComplete="off" placeholder="12.345.678-5" value={rut} onChange={(e) => setRut(e.target.value)} />
      </label>
      <label className="campo">
        Correo (opcional)
        <input type="email" maxLength={120} autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      {inicial && (
        <div className="grupo">
          <label className="item campo-fila">
            <span className="item-texto">
              <span className="item-titulo">Mostrar en el PDF</span>
              <span className="detalle">Apágalo para ocultarla sin borrarla</span>
            </span>
            <input type="checkbox" role="switch" className="interruptor" checked={activa} onChange={(e) => setActiva(e.target.checked)} />
          </label>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="boton">
        {textoBoton}
      </button>
    </form>
  );
}
