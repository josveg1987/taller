// Presentacion de los nombres del listado del SII, que vienen en mayusculas y con variantes
// ("KIA MOTORS", "MERCEDES BENZ", "XV  5710"). Lo usan el generador del catalogo y sus tests.
'use strict';

const ACRONIMOS_MARCA = new Set([
  'AMC', 'BAIC', 'BMW', 'BYD', 'DFSK', 'DS', 'FAW', 'GAC', 'GMC', 'GWM', 'JAC', 'JIM', 'JMC', 'KTM', 'KYC',
  'MG', 'NSU', 'RAM', 'SAIC', 'SG', 'SMA', 'SWM', 'UAZ', 'ZNA',
]);

const MARCAS_ESPECIALES = {
  'KIA MOTORS': 'Kia',
  'MERCEDES BENZ': 'Mercedes-Benz',
  'ROLLS ROYCE': 'Rolls-Royce',
  SSANGYONG: 'SsangYong',
  'DS AUTOMOBILES': 'DS',
  'LYNK CO': 'Lynk & Co',
  'ZX AUTO': 'ZX Auto',
  'GAC GONOW': 'GAC Gonow',
  'POLSKI FIAT': 'Polski Fiat',
};

// Siglas de 3 letras que no deben quedar como palabra ("Apv", "Gle"). Si falta alguna, el generador
// la lista en su informe para agregarla aqui.
const SIGLAS_MODELO = new Set([
  'APV', 'AMG', 'ATS', 'BRV', 'CLA', 'CLS', 'CRV', 'CTS', 'DTS', 'EQA', 'EQB', 'EQC', 'EQE', 'EQS', 'ESV',
  'EVO', 'GLA', 'GLC', 'GLE', 'GLI', 'GLK', 'GLS', 'GTI', 'GTR', 'HRV', 'MKC', 'MKS', 'MKX', 'MKZ', 'MPV',
  'NSX', 'SLC', 'SLK', 'SRV', 'SRX', 'STI', 'STS', 'SUV', 'TTS', 'WRV', 'WRX', 'XEL', 'XFR', 'XJR', 'XKR',
  'XLR', 'XRV', 'XTS', 'GRS', 'TRD', 'SRT', 'SVT', 'RST', 'LTZ',
  'ASX', 'AUT', 'AWD', 'CDI', 'CLE', 'EVI', 'GSA', 'GTE', 'GXE', 'HEV', 'ICA', 'YRV',
]);

// Palabras cortas que son palabras y no siglas ("El Camino", "Le Baron").
const PALABRAS_CORTAS = new Set(['EL', 'LA', 'DE', 'LE', 'DI']);

const limpiar = (s) => String(s).replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

/** "ABC" -> "Abc", "4RUNNER" -> "4Runner" (primera letra en mayuscula, el resto en minuscula). */
const titulo = (p) => p.toLowerCase().replace(/[a-z]/, (c) => c.toUpperCase());

/** Una parte (sin espacios ni guiones) de un nombre de modelo. */
function parteModelo(p) {
  if (!p) return p;
  const letras = p.replace(/[^A-Za-z]/g, '');
  if (SIGLAS_MODELO.has(p)) return p;
  if (PALABRAS_CORTAS.has(p)) return titulo(p);
  if (/\d/.test(p)) return letras.length <= 3 ? p : titulo(p); // "RAV4", "CX5", "S10" / "Wingle5"
  if (p.length <= 2) return p; // "GT", "SS", "IQ"
  if (!/[AEIOUY]/.test(p)) return p; // "HRV", "GRS", "SRT"
  return titulo(p);
}

/** Nombre de modelo para mostrar: "YARIS" -> "Yaris", "C-HR" -> "C-HR", "WINGLE5" -> "Wingle5". */
function nombreModelo(sii) {
  return limpiar(sii)
    .split(' ')
    .map((palabra) =>
      palabra
        .split(/([-/])/)
        .map((parte, i) => (/^[-/]$/.test(parte) ? parte : parte === 'UP' && i > 0 ? 'Up' : parteModelo(parte))) // "Pick-Up"
        .join(''),
    )
    .join(' ');
}

/** Nombre de marca para mostrar: "KIA MOTORS" -> "Kia", "BMW" -> "BMW", "LAND ROVER" -> "Land Rover". */
function nombreMarca(sii) {
  const limpio = limpiar(sii).toUpperCase();
  if (MARCAS_ESPECIALES[limpio]) return MARCAS_ESPECIALES[limpio];
  return limpio
    .split(' ')
    .map((p) => (ACRONIMOS_MARCA.has(p) ? p : titulo(p)))
    .join(' ');
}

// Relleno que el SII deja al final del nombre: codigo interno de 4 digitos, diesel, aire, transmision.
const RELLENO_FINAL = /^(\d{4}|CDI|TDI|AC|MT|AT|DA)$/i;
const CILINDRADA = /^\d\.\d{1,2}[A-Za-z]?$/; // "1.4", "1.6T"

/**
 * Deja el modelo "base": quita lo que el SII le pega (codigos internos, cilindrada, transmision,
 * variantes de motor) para que "Forester 7300", "Forester 7305"... sean un solo "Forester".
 * Devuelve null si no queda un modelo util (p. ej. "DFSK 4533", que es solo marca + codigo).
 * Recibe la marca y el modelo YA formateados con nombreMarca() y nombreModelo().
 */
function limpiarModelo(marca, modelo) {
  let m = modelo;

  // Una cilindrada sola ("1.6", "1.300 KG") no es un modelo.
  if (/^\d\.\d{1,3}(\s|$)/.test(m)) return null;

  // BMW: "118", "118i", "118 D", "M135I", "330E" -> "118", "M135", "330" (el motor no es otro modelo).
  if (marca === 'BMW') m = m.replace(/^(M?\d{3})\s?(?:I|D|E|TI|XI|XD|S)$/, '$1');

  // Mercedes-Benz comerciales: "Sprinter 314 CDI", "Vito Tourer 116 CDI" -> "Sprinter", "Vito Tourer".
  if (marca === 'Mercedes-Benz') m = m.replace(/^(Sprinter|Vito Tourer|Vito|Viano)\s+\d{3}.*$/, '$1');

  let t = m.split(' ');
  // Desde la cilindrada en adelante es motor/version: "Verna CB 1.4 MT Plus" -> "Verna CB".
  const i = t.findIndex((x, k) => k > 0 && CILINDRADA.test(x));
  if (i > 0) t = t.slice(0, i);

  // Relleno al final, mientras quede algo con letras ("Truck DC C22 AC" -> "Truck DC C22").
  while (t.length > 1 && /[A-Za-z]/.test(t.slice(0, -1).join(' '))) {
    const ultimo = t[t.length - 1];
    const dieselSuelto = ultimo === 'D' && /\d/.test(t[t.length - 2]); // "V-220 D"
    if (!RELLENO_FINAL.test(ultimo) && !dieselSuelto) break;
    t = t.slice(0, -1);
  }

  m = t.join(' ').trim();
  if (!m || m.toLowerCase() === String(marca).toLowerCase()) return null;
  return m;
}

module.exports = { nombreMarca, nombreModelo, limpiarModelo, limpiar, SIGLAS_MODELO };
