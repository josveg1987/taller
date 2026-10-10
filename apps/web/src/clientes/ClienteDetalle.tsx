import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { mensajeDe, useAcciones } from '../acciones';
import { Hoja } from '../Hoja';
import { Icono } from '../Iconos';
import { irA } from '../ruta';
import { FormularioVehiculo, type PayloadVehiculo } from './FormularioVehiculo';
import { enlaceLlamada, enlaceWhatsApp } from './telefono';
import { descripcionVehiculo, type ClienteDetalle as Detalle } from './tipos';

export function ClienteDetalle({ id }: { id: string }) {
  const [cliente, setCliente] = useState<Detalle | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [agregando, setAgregando] = useState(false);

  const cargar = useCallback(() => {
    api<Detalle>(`/clientes/${id}`)
      .then(setCliente)
      .catch((e: unknown) => setErrorCarga(mensajeDe(e, 'No se pudo cargar el cliente')));
  }, [id]);
  useEffect(cargar, [cargar]);
  const { error, aviso, ejecutar, limpiarError } = useAcciones(cargar);

  if (!cliente) {
    return errorCarga ? (
      <p className="error" role="alert">
        {errorCarga}
      </p>
    ) : (
      <p className="vacio">Cargando…</p>
    );
  }

  const datos = [
    { etiqueta: 'RUT', valor: cliente.rut },
    { etiqueta: 'Correo', valor: cliente.email },
    { etiqueta: 'Dirección', valor: cliente.direccion },
  ].filter((d) => d.valor);

  function agregarVehiculo(v: PayloadVehiculo) {
    void ejecutar(() => api('/vehiculos', { method: 'POST', json: { clienteId: id, ...v } }), 'Vehículo agregado').then(
      (ok) => ok && setAgregando(false),
    );
  }

  return (
    <section>
      <button type="button" className="enlace volver" onClick={() => irA('/clientes')}>
        <Icono nombre="atras" />
        Clientes
      </button>
      <h1>{cliente.nombre}</h1>
      <p className="subtitulo">{cliente.telefono}</p>

      <div className="grupo">
        <a className="item" href={enlaceLlamada(cliente.telefono)}>
          <Icono nombre="telefono" />
          <span className="item-texto">Llamar</span>
          <Icono nombre="chevron" />
        </a>
        <a className="item" href={enlaceWhatsApp(cliente.telefono)} target="_blank" rel="noopener noreferrer">
          <Icono nombre="mensaje" />
          <span className="item-texto">WhatsApp</span>
          <Icono nombre="chevron" />
        </a>
      </div>

      {datos.length > 0 && (
        <div className="grupo">
          {datos.map((d) => (
            <div key={d.etiqueta} className="item">
              <span className="item-texto detalle">{d.etiqueta}</span>
              <span>{d.valor}</span>
            </div>
          ))}
        </div>
      )}

      {aviso && (
        <p className="ok" role="status">
          {aviso}
        </p>
      )}

      <h2>Vehículos</h2>
      {cliente.vehiculos.length === 0 ? (
        <p className="vacio">Este cliente aún no tiene vehículos.</p>
      ) : (
        <ul className="grupo">
          {cliente.vehiculos.map((v) => (
            <li key={v.id}>
              <button type="button" className="item" onClick={() => irA(`/vehiculos/${v.id}`)}>
                <span className="item-texto">
                  <span className="placa">{v.patente}</span>
                  {descripcionVehiculo(v) && <span className="detalle"> {descripcionVehiculo(v)}</span>}
                </span>
                <Icono nombre="chevron" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="pila">
        <button
          type="button"
          className="boton"
          onClick={() => {
            limpiarError();
            setAgregando(true);
          }}
        >
          <Icono nombre="mas" />
          Agregar vehículo
        </button>
        <button
          type="button"
          className="boton secundario"
          onClick={() => {
            limpiarError();
            setEditando(true);
          }}
        >
          Editar cliente
        </button>
      </div>

      <Hoja
        abierta={agregando}
        titulo="Agregar vehículo"
        onCerrar={() => {
          limpiarError();
          setAgregando(false);
        }}
      >
        <FormularioVehiculo textoBoton="Guardar vehículo" error={error} onGuardar={agregarVehiculo} />
      </Hoja>

      <Hoja
        abierta={editando}
        titulo="Editar cliente"
        onCerrar={() => {
          limpiarError();
          setEditando(false);
        }}
      >
        <FormularioCliente
          cliente={cliente}
          error={error}
          onGuardar={(d) => void ejecutar(() => api(`/clientes/${id}`, { method: 'PATCH', json: d }), 'Cliente actualizado').then((ok) => ok && setEditando(false))}
        />
      </Hoja>
    </section>
  );
}

interface DatosCliente {
  nombre: string;
  telefono: string;
  rut: string;
  email: string;
  direccion: string;
}

function FormularioCliente({ cliente, error, onGuardar }: { cliente: Detalle; error: string | null; onGuardar(d: DatosCliente): void }) {
  const [nombre, setNombre] = useState(cliente.nombre);
  const [telefono, setTelefono] = useState(cliente.telefono);
  const [rut, setRut] = useState(cliente.rut ?? '');
  const [email, setEmail] = useState(cliente.email ?? '');
  const [direccion, setDireccion] = useState(cliente.direccion ?? '');

  function enviar(e: FormEvent) {
    e.preventDefault();
    onGuardar({ nombre, telefono, rut, email, direccion });
  }

  return (
    <form onSubmit={enviar} className="formulario">
      <label className="campo">
        Nombre
        <input required maxLength={120} autoComplete="off" value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </label>
      <label className="campo">
        Teléfono
        <input type="tel" inputMode="tel" required maxLength={20} autoComplete="off" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
      </label>
      <label className="campo">
        RUT
        <input maxLength={20} autoComplete="off" value={rut} onChange={(e) => setRut(e.target.value)} />
      </label>
      <label className="campo">
        Correo
        <input type="email" inputMode="email" autoCapitalize="none" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="campo">
        Dirección
        <input maxLength={200} autoComplete="off" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="boton">
        Guardar cambios
      </button>
    </form>
  );
}
