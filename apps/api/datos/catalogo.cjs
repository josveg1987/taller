// Carga del catalogo de vehiculos desde un archivo TSV (marca, modelo, anio).
// Lo usan las migraciones: al correr `npm run db:migrate` (local o contra Neon) el catalogo queda
// cargado sin ningun paso aparte. La carga es idempotente: se puede repetir sin duplicar nada.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const literal = (s) => `'${String(s).replace(/'/g, "''")}'`;

function trozos(lista, n) {
  const r = [];
  for (let i = 0; i < lista.length; i += n) r.push(lista.slice(i, i + n));
  return r;
}

/** Lee el TSV y valida que cada fila tenga marca, modelo y un año razonable. */
function leerCatalogo(nombreArchivo) {
  const texto = fs.readFileSync(path.join(__dirname, nombreArchivo), 'utf8');
  const [encabezado, ...lineas] = texto.split('\n').filter((l) => l.trim());
  if (encabezado.trim() !== 'marca\tmodelo\tanio') throw new Error(`${nombreArchivo}: encabezado inesperado`);
  return lineas.map((linea, i) => {
    const [marca, modelo, anio] = linea.split('\t');
    const n = Number(anio);
    if (!marca || !modelo || !Number.isInteger(n) || n < 1900 || n > 2100) {
      throw new Error(`${nombreArchivo}: fila ${i + 2} invalida: ${linea}`);
    }
    return { marca, modelo, anio: n };
  });
}

/** Sentencias SQL (en orden) que cargan el archivo. `fuente` queda registrada en catalogo_cargas. */
function sqlCatalogo(nombreArchivo, fuente) {
  const filas = leerCatalogo(nombreArchivo);
  const marcas = [...new Set(filas.map((f) => f.marca))];
  const modelos = [...new Set(filas.map((f) => `${f.marca}\t${f.modelo}`))].map((k) => k.split('\t'));

  const sentencias = [`INSERT INTO catalogo_marcas (nombre) VALUES ${marcas.map((m) => `(${literal(m)})`).join(', ')} ON CONFLICT (nombre) DO NOTHING`];

  for (const grupo of trozos(modelos, 800)) {
    sentencias.push(
      `INSERT INTO catalogo_modelos (marca_id, nombre)
       SELECT m.id, v.modelo
         FROM (VALUES ${grupo.map(([ma, mo]) => `(${literal(ma)}, ${literal(mo)})`).join(', ')}) AS v (marca, modelo)
         JOIN catalogo_marcas m ON m.nombre = v.marca
       ON CONFLICT (marca_id, nombre) DO NOTHING`,
    );
  }

  for (const grupo of trozos(filas, 1500)) {
    sentencias.push(
      `INSERT INTO catalogo_modelo_anios (modelo_id, anio)
       SELECT mo.id, v.anio
         FROM (VALUES ${grupo.map((f) => `(${literal(f.marca)}, ${literal(f.modelo)}, ${f.anio})`).join(', ')}) AS v (marca, modelo, anio)
         JOIN catalogo_marcas m ON m.nombre = v.marca
         JOIN catalogo_modelos mo ON mo.marca_id = m.id AND mo.nombre = v.modelo
       ON CONFLICT DO NOTHING`,
    );
  }

  sentencias.push(
    `INSERT INTO catalogo_cargas (fuente, marcas, modelos, combinaciones)
     VALUES (${literal(fuente)}, ${marcas.length}, ${modelos.length}, ${filas.length})`,
  );
  return sentencias;
}

module.exports = { leerCatalogo, sqlCatalogo };
