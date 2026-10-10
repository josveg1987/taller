import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { Icono } from '../Iconos';
import { irA } from '../ruta';
import type { ClienteDetalle } from './tipos';

export function ClienteNuevo() {
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [patente, setPatente] = useState('');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [masDatos, setMasDatos] = useState(false);
  const [rut, setRut] = useState('');
  const [email, setEmail] = useState('');
  const [direccion, setDireccion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const c = await api<ClienteDetalle>('/clientes', {
        method: 'POST',
        json: {
          nombre,
          telefono,
          rut,
          email,
          direccion,
          // El vehiculo es opcional: solo se envia si se escribio la patente.
          ...(patente.trim() ? { vehiculo: { patente, marca, modelo } } : {}),
        },
      });
      irA(`/clientes/${c.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar el cliente');
      setEnviando(false);
    }
  }

  return (
    <section>
      <button type="button" className="enlace volver" onClick={() => irA('/clientes')}>
        <Icono nombre="atras" />
        Clientes
      </button>
      <h1>Nuevo cliente</h1>
      <p className="subtitulo">Solo el nombre y el teléfono son obligatorios.</p>

      <form onSubmit={guardar} className="formulario pila">
        <div className="grupo formulario">
          <label className="campo">
            Nombre
            <input required maxLength={120} autoComplete="off" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </label>
          <label className="campo">
            Teléfono
            <input
              type="tel"
              inputMode="tel"
              required
              maxLength={20}
              autoComplete="off"
              placeholder="+56 9 1234 5678"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
            />
          </label>
        </div>

        <h2>Vehículo (opcional)</h2>
        <div className="grupo formulario">
          <label className="campo">
            Patente
            <input
              className="campo-placa"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={12}
              value={patente}
              onChange={(e) => setPatente(e.target.value)}
            />
          </label>
          {patente.trim() && (
            <>
              <label className="campo">
                Marca
                <input maxLength={60} autoComplete="off" value={marca} onChange={(e) => setMarca(e.target.value)} />
              </label>
              <label className="campo">
                Modelo
                <input maxLength={60} autoComplete="off" value={modelo} onChange={(e) => setModelo(e.target.value)} />
              </label>
            </>
          )}
        </div>

        {masDatos ? (
          <>
            <h2>Más datos (opcional)</h2>
            <div className="grupo formulario">
              <label className="campo">
                RUT
                <input maxLength={20} autoComplete="off" placeholder="12.345.678-5" value={rut} onChange={(e) => setRut(e.target.value)} />
              </label>
              <label className="campo">
                Correo
                <input type="email" inputMode="email" autoCapitalize="none" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <label className="campo">
                Dirección
                <input maxLength={200} autoComplete="off" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
              </label>
            </div>
          </>
        ) : (
          <div className="centro">
            <button type="button" className="enlace" onClick={() => setMasDatos(true)}>
              Agregar RUT, correo o dirección
            </button>
          </div>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="boton" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Guardar cliente'}
        </button>
      </form>
    </section>
  );
}
