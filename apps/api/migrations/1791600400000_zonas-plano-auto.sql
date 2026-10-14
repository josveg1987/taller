-- Up Migration

-- ============================================================================
-- Plano del auto: cada pieza puede tener una "zona" del dibujo (packages/shared/src/plano.ts). Tocar la zona en
-- el paso 2 agrega la pieza, y el PDF dibuja el auto con las piezas del presupuesto coloreadas.
-- Codigos (deben coincidir con ZONAS de plano.ts). La numeracion 1-17 del esquema define el orden.
-- ============================================================================

-- Plantilla: zona y nuevo orden (Alerón y Tolva no tienen zona: quedan al final, solo en la lista).
ALTER TABLE catalogo_piezas_base
  ADD COLUMN zona text UNIQUE CHECK (zona IN ('parachoques_delantero', 'capot', 'tapabarro_delantero', 'puerta_delantera',
    'puerta_trasera', 'costado_trasero', 'zocalo', 'espejo', 'techo', 'maleta', 'parachoques_trasero'));

UPDATE catalogo_piezas_base b SET zona = v.zona, orden = v.orden
  FROM (VALUES
    ('Parachoques delantero', 'parachoques_delantero', 1),
    ('Capot',                 'capot',                 2),
    ('Tapabarro delantero',   'tapabarro_delantero',   3),
    ('Puerta delantera',      'puerta_delantera',      4),
    ('Puerta trasera',        'puerta_trasera',        5),
    ('Costado trasero',       'costado_trasero',       6),
    ('Zócalo',                'zocalo',                7),
    ('Espejo',                'espejo',                8),
    ('Techo',                 'techo',                 9),
    ('Maleta / portalón',     'maleta',                10),
    ('Parachoques trasero',   'parachoques_trasero',   11),
    ('Alerón',                NULL,                    12),
    ('Tolva',                 NULL,                    13)
  ) AS v (nombre, zona, orden)
 WHERE b.nombre = v.nombre;

-- Piezas de cada taller: una zona la usa a lo mas una pieza del taller.
ALTER TABLE piezas
  ADD COLUMN zona text CHECK (zona IN ('parachoques_delantero', 'capot', 'tapabarro_delantero', 'puerta_delantera',
    'puerta_trasera', 'costado_trasero', 'zocalo', 'espejo', 'techo', 'maleta', 'parachoques_trasero'));
CREATE UNIQUE INDEX piezas_taller_zona ON piezas (taller_id, zona) WHERE zona IS NOT NULL;

-- Las piezas estandar que ya tienen los talleres reciben su zona (si se cotizan por lado igual que la plantilla).
UPDATE piezas p SET zona = b.zona
  FROM catalogo_piezas_base b
 WHERE p.nombre = b.nombre AND p.usa_posicion = b.usa_posicion AND b.zona IS NOT NULL;

-- Y el orden del esquema: primero las piezas con zona (orden de la plantilla), despues las demas como estaban.
UPDATE piezas p SET orden = o.n
  FROM (
    SELECT p2.id, row_number() OVER (
             PARTITION BY p2.taller_id
             ORDER BY CASE WHEN p2.zona IS NOT NULL THEN b.orden ELSE 100 + p2.orden END, p2.nombre
           ) AS n
      FROM piezas p2
      LEFT JOIN catalogo_piezas_base b ON b.zona = p2.zona
  ) o
 WHERE p.id = o.id;

-- "Foto" de la zona en cada linea del presupuesto (regla 4): asi el dibujo de un presupuesto no cambia si despues
-- se cambia la zona de la pieza. Las lineas existentes la toman de su pieza.
ALTER TABLE presupuesto_lineas ADD COLUMN zona text;
UPDATE presupuesto_lineas l SET zona = p.zona
  FROM piezas p
 WHERE l.pieza_id = p.id AND l.taller_id = p.taller_id AND p.zona IS NOT NULL AND l.operacion <> 'libre';

-- Down Migration

ALTER TABLE presupuesto_lineas DROP COLUMN zona;
DROP INDEX piezas_taller_zona;
ALTER TABLE piezas DROP COLUMN zona;
ALTER TABLE catalogo_piezas_base DROP COLUMN zona;
