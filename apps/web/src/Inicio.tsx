import { useEffect, useState } from 'react';
import { calcularPresupuesto, type LineaInput } from '@taller/shared';
import { api } from './api';

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

const clp = (n: number) => n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });

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
      <p className={`estado ${estado}`}>
        {estado === 'conectando' && 'Conectando con el servidor…'}
        {estado === 'conectado' && 'Conectado'}
        {estado === 'sin-conexion' && 'Sin conexión con el servidor'}
      </p>
      {health && (
        <p className="detalle">
          Base de datos:{' '}
          {!health.db.configured ? 'no configurada' : health.db.ok ? `ok (${health.db.ms} ms)` : `error: ${health.db.error}`}
        </p>
      )}
      <p className="detalle">Cálculo compartido (ejemplo): {clp(total)}</p>
    </section>
  );
}
