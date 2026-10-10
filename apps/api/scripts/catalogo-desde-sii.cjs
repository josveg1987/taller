#!/usr/bin/env node
// Genera el archivo del catalogo de vehiculos (marca, modelo, año) a partir del listado de
// tasacion fiscal de vehiculos livianos que publica el SII cada año.
//
//   npm run catalogo:generar -- --anio 2026                      (descarga el Excel desde sii.cl)
//   npm run catalogo:generar -- --anio 2026 --entrada liv2026.xlsx   (usa un archivo ya descargado)
//
// Salida: apps/api/datos/catalogo-vehiculos-sii-<anio>.tsv  (marca, modelo, anio; sin motos)
// Fuente: https://www.sii.cl/servicios_online/1049-2612.html (bajada de datos).
// Sin dependencias: lee el .xlsx (un ZIP) con zlib y extrae las celdas del XML.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { nombreMarca, nombreModelo, SIGLAS_MODELO } = require('../datos/formato.cjs');

function argumentos() {
  const r = {};
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i += 2) if (a[i].startsWith('--')) r[a[i].slice(2)] = a[i + 1];
  return r;
}

/** Lector minimo de ZIP: devuelve una funcion que entrega el contenido de un archivo interno. */
function abrirZip(buf) {
  let fin = buf.length - 22;
  while (fin >= 0 && buf.readUInt32LE(fin) !== 0x06054b50) fin--;
  if (fin < 0) throw new Error('El archivo no es un .xlsx valido (no es un ZIP)');
  const total = buf.readUInt16LE(fin + 10);
  let p = buf.readUInt32LE(fin + 16);
  const entradas = new Map();
  for (let i = 0; i < total; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('ZIP danado');
    const metodo = buf.readUInt16LE(p + 10);
    const tam = buf.readUInt32LE(p + 20);
    const n = buf.readUInt16LE(p + 28);
    const x = buf.readUInt16LE(p + 30);
    const c = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    entradas.set(buf.toString('utf8', p + 46, p + 46 + n), { metodo, tam, local });
    p += 46 + n + x + c;
  }
  return {
    nombres: [...entradas.keys()],
    leer(nombre) {
      const e = entradas.get(nombre);
      if (!e) return null;
      const inicio = e.local + 30 + buf.readUInt16LE(e.local + 26) + buf.readUInt16LE(e.local + 28);
      const datos = buf.subarray(inicio, inicio + e.tam);
      return e.metodo === 8 ? zlib.inflateRawSync(datos) : datos;
    },
  };
}

const decodificar = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');

function leerFilas(zip) {
  const compartidas = zip.leer('xl/sharedStrings.xml');
  const cadenas = compartidas
    ? [...compartidas.toString('utf8').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
        decodificar([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')),
      )
    : [];

  // La hoja con datos es la que tiene encabezados "Marca" y "Modelo".
  for (const nombre of zip.nombres.filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))) {
    const xml = zip.leer(nombre).toString('utf8');
    const filas = [];
    for (const f of xml.matchAll(/<row [^>]*?r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
      const celdas = {};
      for (const c of f[2].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const col = /r="([A-Z]+)\d+"/.exec(c[1])?.[1];
        const tipo = /t="(\w+)"/.exec(c[1])?.[1];
        const v = c[2] ? /<v>([\s\S]*?)<\/v>/.exec(c[2])?.[1] : undefined;
        if (col && v !== undefined) celdas[col] = tipo === 's' ? cadenas[Number(v)] : decodificar(v);
      }
      filas.push(celdas);
    }
    const iEnc = filas.findIndex((f) => Object.values(f).some((v) => /^marca$/i.test(String(v).trim())) && Object.values(f).some((v) => /^modelo$/i.test(String(v).trim())));
    if (iEnc < 0) continue;
    const col = {};
    for (const [k, v] of Object.entries(filas[iEnc])) col[String(v).trim().toLowerCase()] = k;
    const pide = (nombreCol) => {
      const k = Object.keys(col).find((x) => x.startsWith(nombreCol));
      if (!k) throw new Error(`Falta la columna "${nombreCol}" en el listado`);
      return col[k];
    };
    const [cMarca, cModelo, cAnio, cTipo] = [pide('marca'), pide('modelo'), pide('a'), pide('tipo')];
    return filas.slice(iEnc + 1).map((f) => ({ marca: f[cMarca], modelo: f[cModelo], anio: f[cAnio], tipo: f[cTipo] }));
  }
  throw new Error('No se encontro la hoja con las columnas Marca y Modelo');
}

async function main() {
  const { anio = String(new Date().getFullYear()), entrada } = argumentos();
  if (!/^\d{4}$/.test(anio)) throw new Error('Indica el año con --anio 2026');

  let buf;
  if (entrada) {
    buf = fs.readFileSync(entrada);
  } else {
    const url = `https://www.sii.cl/servicios_online/tasacion_fiscal_vehiculos/liv${anio}.xlsx`;
    console.log('Descargando', url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`No se pudo descargar el listado (${res.status}). Descargalo a mano desde la pagina del SII y usa --entrada.`);
    buf = Buffer.from(await res.arrayBuffer());
  }

  const filas = leerFilas(abrirZip(buf));
  const claves = new Set();
  const motos = { n: 0 };
  const dudosos = new Map();
  let sinDatos = 0;

  for (const f of filas) {
    if (!f.marca || !f.modelo || !f.anio) {
      sinDatos++;
      continue;
    }
    // "SIN MODELO" es un relleno del SII para marcas sin modelo registrado: no sirve como sugerencia.
    if (/^sin modelo$/i.test(String(f.modelo).trim())) {
      sinDatos++;
      continue;
    }
    if (/^(moto|cuatrimoto)$/i.test(String(f.tipo ?? '').trim())) {
      motos.n++;
      continue;
    }
    const anioNum = Number(f.anio);
    if (!Number.isInteger(anioNum) || anioNum < 1900 || anioNum > 2100) {
      sinDatos++;
      continue;
    }
    const marca = nombreMarca(f.marca);
    const modelo = nombreModelo(f.modelo);
    if (!marca || !modelo) continue;
    claves.add(`${marca}\t${modelo}\t${anioNum}`);
    // Para el informe: palabras cortas que quedaron como palabra normal y podrian ser siglas.
    for (const palabra of modelo.split(/[ \-/]/)) {
      if (/^[A-Z][a-z]{2}$/.test(palabra) && !SIGLAS_MODELO.has(palabra.toUpperCase())) dudosos.set(palabra, (dudosos.get(palabra) ?? 0) + 1);
    }
  }

  const lineas = [...claves].sort((a, b) => {
    const [ma, mo, an] = a.split('\t');
    const [mb, mob, anb] = b.split('\t');
    return ma.localeCompare(mb) || mo.localeCompare(mob) || Number(an) - Number(anb);
  });
  const destino = path.join(__dirname, '..', 'datos', `catalogo-vehiculos-sii-${anio}.tsv`);
  fs.writeFileSync(destino, `marca\tmodelo\tanio\n${lineas.join('\n')}\n`, 'utf8');

  const marcas = new Set(lineas.map((l) => l.split('\t')[0]));
  const modelos = new Set(lineas.map((l) => l.split('\t').slice(0, 2).join('|')));
  console.log(`Listo: ${destino}`);
  console.log(`  filas leidas: ${filas.length} | motos y cuatrimotos excluidas: ${motos.n} | sin datos validos: ${sinDatos}`);
  console.log(`  marcas: ${marcas.size} | modelos: ${modelos.size} | marca-modelo-año: ${lineas.length}`);
  const top = [...dudosos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([p, n]) => `${p}(${n})`);
  console.log(`  palabras de 3 letras que quedaron como palabra (revisar si alguna es sigla): ${top.join(' ')}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
