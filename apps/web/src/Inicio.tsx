import { useEffect, useState } from 'react';
import { calcularPresupuesto, type LineaInput } from '@taller/shared';
import { api } from './api';
import { clp } from './dinero';

type Estado = 'conectando' | 'conectado' | 'sin-conexion';
interface Health {
  status: string;
  db: { configured: boolean; ok: boolean; ms?: number; error?: string };
}

// Ejemplo del diseno: valida que el paquete compartido funciona en la PWA.
const ejemplo: LineaInput[] = [
  { operacion: 'reemplazar', pintura: 80000, repuestoCosto: 200000, margenPct: 25 },
  { operacion: 'reemplazar', pintura: 80000, repuestoCosto: 120000, margenPct: 25 },
  { operacion: 'reparar', pintura: 80000, desabollado: 60000, margenPct: 25 },
];

const TEXTO_ESTADO: Record<Estado, string> = {
  conectando: 'Conectando…',
  conectado: 'Conectado',
  'sin-conexion': 'Sin conexión',
};

export function Inicio() {
  const [estado, setEstado] = useState<Estado>('conectando');
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    api<Health>('/health')
      .then((h) => {
        setHealth(h);
        setEstado('conectado');
      })
      .catch(() => setEstado('sin-conexion'));
  }, []);

  const total = calcularPresupuesto(ejemplo).total;

  return (
    <section>
      <h1>Presupuestos</h1>
      <p className="subtitulo">Aquí aparecerán tus presupuestos.</p>

      <div className="grupo">
        <div className="item">
          <span className="item-texto">Servidor</span>
          <span className={`chip ${estado}`}>{TEXTO_ESTADO[estado]}</span>
        </div>
        {health && (
          <div className="item">
            <span className="item-texto">Base de datos</span>
            <span className="detalle">
              {!health.db.configured ? 'no configurada' : health.db.ok ? `ok (${health.db.ms} ms)` : `error: ${health.db.error}`}
            </span>
          </div>
        )}
        <div className="item">
          <span className="item-texto">Cálculo de ejemplo</span>
          <span className="detalle">{clp(total)}</span>
        </div>
      </div>
    </section>
  );
}
