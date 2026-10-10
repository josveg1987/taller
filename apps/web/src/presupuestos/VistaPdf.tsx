import { useEffect, useRef, useState } from 'react';
import { api, apiBlob, ApiError } from '../api';
import { mensajeDe } from '../acciones';
import { descripcionVehiculo } from '../clientes/tipos';
import { enlaceWhatsApp } from '../clientes/telefono';
import { clp } from '../dinero';
import { Encabezado } from '../Encabezado';
import { HojaConfirmar } from '../Hoja';
import { Icono } from '../Iconos';
import { irA } from '../ruta';
import { useSesion } from '../sesion';
import type { Presupuesto } from './tipos';

type Carga = { fase: 'cargando' } | { fase: 'error'; mensaje: string } | { fase: 'lista' };

/**
 * Vista previa del PDF tal como lo recibira el cliente. Se dibuja con pdf.js (cargado solo aqui)
 * porque los celulares no muestran PDFs dentro de la pagina. Desde aqui se envia por WhatsApp.
 */
export function VistaPdf({ id }: { id: string }) {
  const { estado } = useSesion();
  const nombreTaller = estado.fase === 'activa' ? (estado.perfil.taller?.nombre ?? '') : '';
  const [p, setP] = useState<Presupuesto | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [carga, setCarga] = useState<Carga>({ fase: 'cargando' });
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [marcando, setMarcando] = useState(false);
  const paginas = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let vigente = true;
    let destruir: (() => void) | undefined;
    (async () => {
      const [pres, archivo] = await Promise.all([api<Presupuesto>(`/presupuestos/${id}`), apiBlob(`/presupuestos/${id}/pdf`)]);
      if (!vigente) return;
      setP(pres);
      setBlob(archivo);
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
      const tarea = pdfjs.getDocument({ data: await archivo.arrayBuffer() });
      destruir = () => void tarea.destroy();
      const doc = await tarea.promise;
      const contenedor = paginas.current;
      if (!vigente || !contenedor) return;
      contenedor.replaceChildren();
      const ancho = contenedor.clientWidth || 360;
      const dpr = window.devicePixelRatio || 1;
      for (let n = 1; n <= doc.numPages; n++) {
        const pagina = await doc.getPage(n);
        const base = pagina.getViewport({ scale: 1 });
        const viewport = pagina.getViewport({ scale: (ancho / base.width) * dpr });
        const canvas = document.createElement('canvas');
        canvas.className = 'pdf-pagina';
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', `Página ${n} de ${doc.numPages} del presupuesto`);
        contenedor.appendChild(canvas);
        await pagina.render({ canvas, viewport }).promise;
        if (!vigente) return;
      }
      setCarga({ fase: 'lista' });
    })().catch((e: unknown) => vigente && setCarga({ fase: 'error', mensaje: mensajeDe(e, 'No se pudo mostrar el PDF') }));
    return () => {
      vigente = false;
      destruir?.();
    };
  }, [id]);

  function descargar() {
    if (!blob || !p) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `presupuesto-${p.numero}.pdf`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async function compartir() {
    if (!blob || !p) return;
    setAviso(null);
    const archivo = new File([blob], `presupuesto-${p.numero}.pdf`, { type: 'application/pdf' });
    const vehiculo = descripcionVehiculo(p.vehiculo) || p.vehiculo.patente;
    const nombre = p.cliente.nombre.split(' ')[0];
    const mensaje = `Hola ${nombre}, te envío el presupuesto N° ${p.numero}${nombreTaller ? ` de ${nombreTaller}` : ''} para tu ${vehiculo}. Total: ${clp(p.total)}.`;
    let compartido = false;
    if (navigator.canShare?.({ files: [archivo] })) {
      // Celular: se abre la hoja de compartir del sistema y se elige WhatsApp.
      try {
        await navigator.share({ files: [archivo], text: mensaje });
        compartido = true;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return; // cerró la hoja de compartir
        // Si el sistema no pudo compartirlo, se usa la descarga de abajo.
      }
    }
    if (!compartido) {
      // Computador: se descarga el PDF y se abre WhatsApp Web con el mensaje para adjuntarlo.
      descargar();
      window.open(`${enlaceWhatsApp(p.cliente.telefono)}?text=${encodeURIComponent(mensaje)}`, '_blank', 'noopener');
      setAviso('Se descargó el PDF. Adjúntalo en la conversación de WhatsApp que se abrió.');
    }
    if (p.estado === 'borrador') setConfirmar(true);
  }

  async function marcarEnviado() {
    setMarcando(true);
    try {
      await api(`/presupuestos/${id}/estado`, { method: 'PATCH', json: { estado: 'enviado' } });
      irA(`/presupuestos/${id}`);
    } catch (e) {
      setConfirmar(false);
      setMarcando(false);
      setAviso(e instanceof ApiError ? e.message : 'No se pudo marcar como enviado');
    }
  }

  return (
    <section className="asistente vista-pdf">
      <Encabezado
        titulo="Vista previa"
        sub="Así lo verá tu cliente. Revísalo antes de enviarlo."
        atras={{ texto: p ? `N° ${p.numero}` : "Presupuesto", ruta: `/presupuestos/${id}` }}
      />

      <div className="cuerpo sobre-encabezado">
        {carga.fase === "cargando" && <p className="vacio vacio-sobre-marca">Preparando el PDF…</p>}
        {carga.fase === "error" && (
          <p className="error" role="alert">
            {carga.mensaje}
          </p>
        )}
        <div className="pdf-paginas" ref={paginas} />
      </div>

      <div className="barra-accion">
        {aviso && (
          <p className="aviso aviso-barra" role="status">
            {aviso}
          </p>
        )}
        <button type="button" className="boton" disabled={carga.fase !== 'lista'} onClick={() => void compartir()}>
          <Icono nombre="mensaje" />
          {p && p.estado !== 'borrador' ? 'Reenviar por WhatsApp' : 'Enviar por WhatsApp'}
        </button>
        <button type="button" className="boton secundario" disabled={carga.fase !== 'lista'} onClick={descargar}>
          Descargar PDF
        </button>
      </div>

      <HojaConfirmar
        abierta={confirmar}
        titulo="¿Ya se lo enviaste al cliente?"
        texto="Si lo enviaste, lo marco como Enviado. Desde ahí ya no se puede editar: para hacer cambios lo duplicas como borrador."
        textoBoton={marcando ? 'Guardando…' : 'Sí, marcar como enviado'}
        onCerrar={() => !marcando && setConfirmar(false)}
        onConfirmar={() => void marcarEnviado()}
      />
    </section>
  );
}
