import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { mensajeDe, useAcciones } from '../acciones';
import { CampoDinero } from '../CampoDinero';
import { clp } from '../dinero';
import { Hoja, HojaConfirmar } from '../Hoja';
import { Cargando } from '../Cargando';
import { Encabezado } from '../Encabezado';
import { Icono } from '../Iconos';

// Debe coincidir con `Servicio` de apps/api/src/servicios/servicios.service.ts.
interface Servicio {
  id: string;
  nombre: string;
  precioSugerido: number | null;
  descripcion: string | null;
  activo: boolean;
  orden: number;
}

interface DatosServicio {
  nombre: string;
  precioSugerido: number | null;
  descripcion: string | null;
  activo: boolean;
}

export function Servicios() {
  const [servicios, setServicios] = useState<Servicio[] | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [idHoja, setIdHoja] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  const cargar = useCallback(() => {
    api<Servicio[]>('/servicios?todos=1')
      .then(setServicios)
      .catch((e: unknown) => setErrorCarga(mensajeDe(e, 'No se pudieron cargar los servicios')));
  }, []);
  useEffect(cargar, [cargar]);
  const { error, aviso, ejecutar, limpiarError } = useAcciones(cargar);

  if (!servicios) return <Cargando titulo="Servicios" atras={{ texto: 'Mi taller', ruta: '/mi-taller' }} error={errorCarga} />;

  const elegido = servicios.find((s) => s.id === idHoja);
  const indice = servicios.findIndex((s) => s.id === idHoja);
  const cerrar = (poner: (v: boolean) => void) => () => {
    limpiarError();
    poner(false);
  };

  return (
    <section>
      <Encabezado
        titulo="Servicios"
        sub="Trabajos que no son una pieza, como el pulido. Se agregan al presupuesto con un toque."
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
          Nuevo servicio
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

        {servicios.length === 0 ? (
          <p className="vacio">Aún no tienes servicios.</p>
        ) : (
          <ul className="grupo">
            {servicios.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="item"
                  onClick={() => {
                    limpiarError();
                    setIdHoja(s.id);
                    setEditando(true);
                  }}
                >
                  <span className="item-texto">
                    <span className="item-titulo">{s.nombre}</span>
                    <span className="detalle">{s.precioSugerido === null ? 'Sin precio sugerido' : clp(s.precioSugerido)}</span>
                  </span>
                  {!s.activo && <span className="chip suspendido">Inactivo</span>}
                  <Icono nombre="chevron" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="pila">
          <button
            type="button"
            className="enlace"
            onClick={() => void ejecutar(() => api('/servicios/estandar', { method: 'POST' }), 'Listo: los servicios estándar están al día')}
          >
            Agregar los servicios estándar que falten
          </button>
        </div>
      </div>

      <Hoja abierta={creando} titulo="Nuevo servicio" onCerrar={cerrar(setCreando)}>
        <FormularioServicio
          textoBoton="Crear servicio"
          error={error}
          onGuardar={(d) =>
            void ejecutar(() => api('/servicios', { method: 'POST', json: d }), 'Servicio creado').then((ok) => ok && setCreando(false))
          }
        />
      </Hoja>

      <Hoja abierta={editando} titulo={elegido?.nombre ?? 'Servicio'} onCerrar={cerrar(setEditando)}>
        {elegido && (
          <>
            <FormularioServicio
              inicial={elegido}
              textoBoton="Guardar cambios"
              error={error}
              onGuardar={(d) =>
                void ejecutar(() => api(`/servicios/${elegido.id}`, { method: 'PATCH', json: d }), 'Servicio actualizado').then((ok) => ok && setEditando(false))
              }
            />
            <div className="pila">
              <button
                type="button"
                className="boton secundario"
                disabled={indice <= 0}
                onClick={() => void ejecutar(() => api(`/servicios/${elegido.id}/mover`, { method: 'POST', json: { direccion: 'arriba' } }))}
              >
                Subir en la lista
              </button>
              <button
                type="button"
                className="boton secundario"
                disabled={indice >= servicios.length - 1}
                onClick={() => void ejecutar(() => api(`/servicios/${elegido.id}/mover`, { method: 'POST', json: { direccion: 'abajo' } }))}
              >
                Bajar en la lista
              </button>
            </div>
            <div className="centro">
              <button type="button" className="enlace peligro" onClick={() => setEliminando(true)}>
                Eliminar servicio
              </button>
            </div>
          </>
        )}
      </Hoja>

      <HojaConfirmar
        abierta={eliminando}
        titulo={`¿Eliminar ${elegido?.nombre ?? 'el servicio'}?`}
        texto="Los presupuestos que ya lo tienen no cambian."
        textoBoton="Eliminar"
        peligro
        onCerrar={() => setEliminando(false)}
        onConfirmar={() => {
          setEliminando(false);
          if (elegido) void ejecutar(() => api(`/servicios/${elegido.id}`, { method: 'DELETE' }), 'Servicio eliminado').then((ok) => ok && setEditando(false));
        }}
      />
    </section>
  );
}

function FormularioServicio({
  inicial,
  textoBoton,
  error,
  onGuardar,
}: {
  inicial?: Servicio;
  textoBoton: string;
  error: string | null;
  onGuardar(d: DatosServicio): void;
}) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [precio, setPrecio] = useState(inicial?.precioSugerido ?? 0);
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? '');
  const [activo, setActivo] = useState(inicial?.activo ?? true);

  function enviar(e: FormEvent) {
    e.preventDefault();
    onGuardar({ nombre, precioSugerido: precio > 0 ? precio : null, descripcion: descripcion.trim() || null, activo });
  }

  return (
    <form onSubmit={enviar} className="formulario">
      <label className="campo">
        Nombre
        <input required maxLength={80} autoComplete="off" value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </label>
      <CampoDinero etiqueta="Precio sugerido" valor={precio} onCambio={setPrecio} />
      <p className="ayuda">Con este precio parte en el presupuesto; allí lo puedes cambiar. En $0: sin sugerencia.</p>
      <label className="campo">
        Descripción para el PDF
        <span className="ayuda">Sale bajo el nombre del servicio. Opcional.</span>
        <textarea rows={3} maxLength={300} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      </label>
      {inicial && (
        <div className="grupo">
          <label className="item campo-fila">
            <span className="item-texto">
              <span className="item-titulo">Servicio activo</span>
              <span className="detalle">Los inactivos no se ofrecen en los presupuestos</span>
            </span>
            <input type="checkbox" role="switch" className="interruptor" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
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
