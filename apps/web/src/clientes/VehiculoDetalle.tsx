import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { mensajeDe, useAcciones } from '../acciones';
import { Hoja } from '../Hoja';
import { Icono } from '../Iconos';
import { irA } from '../ruta';
import { FormularioVehiculo, type PayloadVehiculo } from './FormularioVehiculo';
import { descripcionVehiculo, type VehiculoConCliente } from './tipos';

export function VehiculoDetalle({ id }: { id: string }) {
  const [vehiculo, setVehiculo] = useState<VehiculoConCliente | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);

  const cargar = useCallback(() => {
    api<VehiculoConCliente>(`/vehiculos/${id}`)
      .then(setVehiculo)
      .catch((e: unknown) => setErrorCarga(mensajeDe(e, 'No se pudo cargar el vehículo')));
  }, [id]);
  useEffect(cargar, [cargar]);
  const { error, aviso, ejecutar, limpiarError } = useAcciones(cargar);

  if (!vehiculo) {
    return errorCarga ? (
      <p className="error" role="alert">
        {errorCarga}
      </p>
    ) : (
      <p className="vacio">Cargando…</p>
    );
  }

  const datos = [
    { etiqueta: 'Marca', valor: vehiculo.marca },
    { etiqueta: 'Modelo', valor: vehiculo.modelo },
    { etiqueta: 'Año', valor: vehiculo.anio ? String(vehiculo.anio) : null },
    { etiqueta: 'Color', valor: vehiculo.color },
  ].filter((d) => d.valor);

  function guardar(v: PayloadVehiculo) {
    void ejecutar(() => api(`/vehiculos/${id}`, { method: 'PATCH', json: v }), 'Vehículo actualizado').then((ok) => ok && setEditando(false));
  }

  return (
    <section>
      <button type="button" className="enlace volver" onClick={() => irA(`/clientes/${vehiculo.cliente.id}`)}>
        <Icono nombre="atras" />
        {vehiculo.cliente.nombre}
      </button>
      <h1>
        <span className="placa grande">{vehiculo.patente}</span>
      </h1>
      {descripcionVehiculo(vehiculo) && <p className="subtitulo">{descripcionVehiculo(vehiculo)}</p>}

      {aviso && (
        <p className="ok" role="status">
          {aviso}
        </p>
      )}

      <h2>Dueño</h2>
      <div className="grupo">
        <button type="button" className="item" onClick={() => irA(`/clientes/${vehiculo.cliente.id}`)}>
          <span className="item-texto">
            <span className="item-titulo">{vehiculo.cliente.nombre}</span>
            <span className="detalle">{vehiculo.cliente.telefono}</span>
          </span>
          <Icono nombre="chevron" />
        </button>
      </div>

      {datos.length > 0 && (
        <>
          <h2>Datos</h2>
          <div className="grupo">
            {datos.map((d) => (
              <div key={d.etiqueta} className="item">
                <span className="item-texto detalle">{d.etiqueta}</span>
                <span>{d.valor}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="pila">
        <button
          type="button"
          className="boton secundario"
          onClick={() => {
            limpiarError();
            setEditando(true);
          }}
        >
          Editar vehículo
        </button>
      </div>

      <Hoja
        abierta={editando}
        titulo="Editar vehículo"
        onCerrar={() => {
          limpiarError();
          setEditando(false);
        }}
      >
        <FormularioVehiculo inicial={vehiculo} textoBoton="Guardar cambios" error={error} onGuardar={guardar} />
      </Hoja>
    </section>
  );
}
