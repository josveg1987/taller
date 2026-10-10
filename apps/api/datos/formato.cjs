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

module.exports = { nombreMarca, nombreModelo, limpiar, SIGLAS_MODELO };
