import type { ChangeEvent } from 'react';
import { api, ApiError } from '../api';
import type { Ejecutar } from '../acciones';

const MAX_BYTES = 100_000;

const aDatos = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/**
 * Logo del taller para el PDF (SVG para fondo claro). Solo lo ve y cambia el administrador de la APP.
 * El servidor valida y limpia el archivo antes de guardarlo.
 */
export function LogoTaller({ tallerId, svg, ejecutar }: { tallerId: string; svg: string | null; ejecutar: Ejecutar }) {
  async function elegir(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = ''; // permite elegir de nuevo el mismo archivo
    if (!archivo) return;
    if (archivo.size > MAX_BYTES) {
      await ejecutar(() => Promise.reject(new ApiError(400, 'El logo pesa demasiado (máximo 100 KB)')));
      return;
    }
    const texto = await archivo.text();
    await ejecutar(() => api(`/admin/talleres/${tallerId}/logo`, { method: 'PUT', json: { svg: texto } }), 'Logo guardado');
  }

  return (
    <>
      <h2>Logo del PDF</h2>
      <div className="grupo formulario">
        <p className="ayuda">SVG para fondo claro (letras oscuras). Máximo 100 KB, sin scripts ni imágenes incrustadas.</p>
        {svg ? (
          <div className="vista-logo">
            <img src={aDatos(svg)} alt="Logo actual del taller" />
          </div>
        ) : (
          <p className="vacio">Este taller aún no tiene logo: el PDF lleva su nombre en texto.</p>
        )}
        <label className="boton secundario selector-archivo">
          {svg ? 'Cambiar logo' : 'Subir logo (SVG)'}
          <input type="file" accept=".svg,image/svg+xml" className="oculto" onChange={(e) => void elegir(e)} />
        </label>
        {svg && (
          <button type="button" className="enlace peligro" onClick={() => void ejecutar(() => api(`/admin/talleres/${tallerId}/logo`, { method: 'PUT', json: { svg: null } }), 'Logo quitado')}>
            Quitar logo
          </button>
        )}
      </div>
    </>
  );
}
