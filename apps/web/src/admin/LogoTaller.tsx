import type { ChangeEvent } from 'react';
import { api, ApiError } from '../api';
import type { Ejecutar } from '../acciones';

const MAX_BYTES = 100_000;

const aDatos = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const TEXTOS = {
  oscuro: {
    titulo: 'Logo para fondo oscuro (PDF)',
    ayuda: 'Va en el encabezado azul del PDF: letras claras. Máximo 100 KB, sin scripts ni imágenes incrustadas.',
    sin: 'Sin este logo, el PDF lleva el nombre del taller en blanco.',
  },
  claro: {
    titulo: 'Logo para fondo claro',
    ayuda: 'Para documentos con fondo blanco: letras oscuras. Máximo 100 KB, sin scripts ni imágenes incrustadas.',
    sin: 'Este taller aún no tiene logo para fondo claro.',
  },
} as const;

/**
 * Un logo del taller (SVG para fondo oscuro o claro). Solo lo ve y cambia el administrador de la APP.
 * El servidor valida y limpia el archivo antes de guardarlo.
 */
export function LogoTaller({ tallerId, fondo, svg, ejecutar }: { tallerId: string; fondo: 'claro' | 'oscuro'; svg: string | null; ejecutar: Ejecutar }) {
  const t = TEXTOS[fondo];
  async function elegir(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = ''; // permite elegir de nuevo el mismo archivo
    if (!archivo) return;
    if (archivo.size > MAX_BYTES) {
      await ejecutar(() => Promise.reject(new ApiError(400, 'El logo pesa demasiado (máximo 100 KB)')));
      return;
    }
    const texto = await archivo.text();
    await ejecutar(() => api(`/admin/talleres/${tallerId}/logo`, { method: 'PUT', json: { svg: texto, fondo } }), 'Logo guardado');
  }

  return (
    <>
      <h2>{t.titulo}</h2>
      <div className="grupo formulario">
        <p className="ayuda">{t.ayuda}</p>
        {svg ? (
          <div className={`vista-logo${fondo === 'oscuro' ? ' oscuro' : ''}`}>
            <img src={aDatos(svg)} alt="Logo actual del taller" />
          </div>
        ) : (
          <p className="vacio">{t.sin}</p>
        )}
        <label className="boton secundario selector-archivo">
          {svg ? 'Cambiar logo' : 'Subir logo (SVG)'}
          <input type="file" accept=".svg,image/svg+xml" className="oculto" onChange={(e) => void elegir(e)} />
        </label>
        {svg && (
          <button type="button" className="enlace peligro" onClick={() => void ejecutar(() => api(`/admin/talleres/${tallerId}/logo`, { method: 'PUT', json: { svg: null, fondo } }), 'Logo quitado')}>
            Quitar logo
          </button>
        )}
      </div>
    </>
  );
}
