import { Encabezado } from './Encabezado';

type Atras = { texto: string; ruta?: string; onClick?: () => void };

/** Pantalla mientras carga (o si fallo la carga): conserva el encabezado para poder volver. */
export function Cargando({ titulo, atras, error }: { titulo: string; atras?: Atras; error?: string | null }) {
  return (
    <section>
      <Encabezado titulo={titulo} atras={atras} />
      <div className="cuerpo">
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : (
          <p className="vacio">Cargando…</p>
        )}
      </div>
    </section>
  );
}
