import { useEffect, useState } from 'react';
import { buscarAnios, buscarMarcas, buscarModelos, buscarPropios, normalizar, type ItemCatalogo } from './catalogo';

export interface MarcaModeloAnio {
  marca: string;
  modelo: string;
  anio: string;
}

interface Props {
  valor: MarcaModeloAnio;
  onCambio(v: MarcaModeloAnio): void;
}

type Campo = 'marca' | 'modelo' | 'anio';
const ESPERA_MS = 150;

/** Año escrito completo (4 digitos) y razonable, para filtrar modelos por ese año. */
const anioValido = (s: string) => (/^\d{4}$/.test(s) && Number(s) >= 1900 && Number(s) <= 2100 ? Number(s) : undefined);

/** Une dos listas de nombres sin repetir (sin distinguir mayusculas ni tildes); la primera manda. */
function unir(principal: string[], extra: string[]): string[] {
  const vistos = new Set(principal.map(normalizar));
  const r = [...principal];
  for (const e of extra) {
    const n = normalizar(e);
    if (!vistos.has(n)) {
      vistos.add(n);
      r.push(e);
    }
  }
  return r;
}

/**
 * Marca, modelo y año con sugerencias mientras se escribe: las del catalogo (listado del SII) y,
 * ademas, las marcas y modelos que este taller ya registro y que no estan en el catalogo. Se puede ir
 * en cualquier orden despues de la marca: marca > año > modelo, o marca > modelo > año (elegir un año
 * deja solo los modelos de ese año; elegir un modelo deja solo sus años). Todo es texto libre: si el
 * auto no esta en ninguna lista, se escribe a mano y se guarda igual.
 */
export function CamposVehiculo({ valor, onCambio }: Props) {
  const [foco, setFoco] = useState<Campo | null>(null);
  const [marcas, setMarcas] = useState<ItemCatalogo[]>([]);
  const [marcaId, setMarcaId] = useState<number | null>(null);
  const [modelos, setModelos] = useState<ItemCatalogo[]>([]); // sugerencias (filtradas por año si hay)
  const [modelosDeLaMarca, setModelosDeLaMarca] = useState<ItemCatalogo[]>([]); // sin filtrar por año
  const [modeloId, setModeloId] = useState<number | null>(null);
  const [anios, setAnios] = useState<number[]>([]);
  const [marcasPropias, setMarcasPropias] = useState<string[]>([]);
  const [modelosPropios, setModelosPropios] = useState<string[]>([]);

  // Marca: sugerencias, y si lo escrito coincide con una marca del catalogo, se la reconoce.
  useEffect(() => {
    const q = valor.marca.trim();
    if (!q) {
      setMarcas([]);
      setMarcasPropias([]);
      setMarcaId(null);
      return;
    }
    let vigente = true;
    const t = window.setTimeout(() => {
      buscarMarcas(q)
        .then((r) => {
          if (!vigente) return;
          setMarcas(r);
          setMarcaId(r.find((m) => normalizar(m.nombre) === normalizar(q))?.id ?? null);
        })
        .catch(() => vigente && setMarcas([]));
      buscarPropios(null, q)
        .then((r) => vigente && setMarcasPropias(r))
        .catch(() => vigente && setMarcasPropias([]));
    }, ESPERA_MS);
    return () => {
      vigente = false;
      window.clearTimeout(t);
    };
  }, [valor.marca]);

  // Modelo: los de la marca (y del año elegido); y se reconoce si lo escrito es uno del catalogo.
  useEffect(() => {
    if (marcaId === null) {
      setModelos([]);
      setModelosDeLaMarca([]);
      setModeloId(null);
      return;
    }
    let vigente = true;
    const q = valor.modelo.trim();
    const anio = anioValido(valor.anio.trim());
    const t = window.setTimeout(() => {
      const todos = buscarModelos(marcaId, q);
      Promise.all([todos, anio ? buscarModelos(marcaId, q, anio) : todos])
        .then(([sinAnio, conAnio]) => {
          if (!vigente) return;
          setModelos(conAnio);
          setModelosDeLaMarca(sinAnio);
          setModeloId(sinAnio.find((m) => normalizar(m.nombre) === normalizar(q))?.id ?? null);
        })
        .catch(() => vigente && setModelos([]));
    }, ESPERA_MS);
    return () => {
      vigente = false;
      window.clearTimeout(t);
    };
  }, [marcaId, valor.modelo, valor.anio]);

  // Modelos que este taller ya registro para la marca escrita (esten o no en el catalogo).
  useEffect(() => {
    const marca = valor.marca.trim();
    if (!marca) {
      setModelosPropios([]);
      return;
    }
    let vigente = true;
    const t = window.setTimeout(() => {
      buscarPropios(marca, valor.modelo.trim())
        .then((r) => vigente && setModelosPropios(r))
        .catch(() => vigente && setModelosPropios([]));
    }, ESPERA_MS);
    return () => {
      vigente = false;
      window.clearTimeout(t);
    };
  }, [valor.marca, valor.modelo]);

  // Años: los del modelo si ya se eligio, o los de toda la marca.
  useEffect(() => {
    if (modeloId === null && marcaId === null) {
      setAnios([]);
      return;
    }
    let vigente = true;
    buscarAnios(modeloId !== null ? { modeloId } : { marcaId: marcaId as number })
      .then((r) => vigente && setAnios(r))
      .catch(() => vigente && setAnios([]));
    return () => {
      vigente = false;
    };
  }, [marcaId, modeloId]);

  // Del catalogo primero; lo propio del taller solo si el catalogo no lo tiene.
  const todasLasMarcas = unir(
    marcas.map((m) => m.nombre),
    marcasPropias,
  );
  const todosLosModelos = unir(
    modelos.map((m) => m.nombre),
    modelosPropios.filter((p) => !modelosDeLaMarca.some((m) => normalizar(m.nombre) === normalizar(p))),
  );

  const sugMarcas =
    foco === 'marca' && valor.marca.trim() && !(todasLasMarcas.length === 1 && normalizar(todasLasMarcas[0]) === normalizar(valor.marca))
      ? todasLasMarcas.slice(0, 8)
      : [];
  const sugModelos =
    foco === 'modelo' && valor.marca.trim() ? todosLosModelos.filter((m) => normalizar(m) !== normalizar(valor.modelo)) : [];
  const sugAnios = foco === 'anio' ? anios.filter((a) => String(a).startsWith(valor.anio.trim()) && String(a) !== valor.anio.trim()) : [];

  // Evita que el campo pierda el foco antes de registrar el toque en una sugerencia.
  const retenerFoco = { onMouseDown: (e: React.MouseEvent) => e.preventDefault(), onPointerDown: (e: React.PointerEvent) => e.preventDefault() };

  return (
    <>
      <label className="campo">
        Marca
        <input
          maxLength={60}
          autoComplete="off"
          autoCapitalize="words"
          value={valor.marca}
          onFocus={() => setFoco('marca')}
          onBlur={() => setFoco(null)}
          onChange={(e) => onCambio({ ...valor, marca: e.target.value })}
        />
      </label>
      {sugMarcas.length > 0 && (
        <div className="sugerencias" {...retenerFoco}>
          {sugMarcas.map((m) => (
            <button key={m} type="button" className="sugerencia" onClick={() => onCambio({ ...valor, marca: m })}>
              {m}
            </button>
          ))}
        </div>
      )}

      <label className="campo">
        Modelo
        <input
          maxLength={60}
          autoComplete="off"
          autoCapitalize="words"
          value={valor.modelo}
          onFocus={() => setFoco('modelo')}
          onBlur={() => setFoco(null)}
          onChange={(e) => onCambio({ ...valor, modelo: e.target.value })}
        />
      </label>
      {sugModelos.length > 0 && (
        <div className="sugerencias" {...retenerFoco}>
          {sugModelos.map((m) => (
            <button key={m} type="button" className="sugerencia" onClick={() => onCambio({ ...valor, modelo: m })}>
              {m}
            </button>
          ))}
        </div>
      )}

      <label className="campo">
        Año
        <input
          type="text"
          inputMode="numeric"
          maxLength={4}
          autoComplete="off"
          value={valor.anio}
          onFocus={() => setFoco('anio')}
          onBlur={() => setFoco(null)}
          onChange={(e) => onCambio({ ...valor, anio: e.target.value.replace(/\D/g, '') })}
        />
      </label>
      {sugAnios.length > 0 && (
        <div className="sugerencias anios" {...retenerFoco}>
          {sugAnios.map((a) => (
            <button key={a} type="button" className="sugerencia anio" onClick={() => onCambio({ ...valor, anio: String(a) })}>
              {a}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
