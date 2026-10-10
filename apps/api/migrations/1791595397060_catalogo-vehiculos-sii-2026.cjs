// Carga el catalogo de vehiculos (SII, tasacion 2026) en las tablas catalogo_*.
// Se ejecuta con el resto de las migraciones, tambien en produccion (Neon).
// Para actualizar el listado cada año: `npm run catalogo:generar -- --anio 2027` y crear una
// migracion nueva como esta apuntando al archivo nuevo (la carga solo agrega, nunca borra).
const { sqlCatalogo } = require('../datos/catalogo.cjs');

exports.up = (pgm) => {
  for (const sentencia of sqlCatalogo('catalogo-vehiculos-sii-2026.tsv', 'SII tasación fiscal 2026 (livianos, sin motos)')) {
    pgm.sql(sentencia);
  }
};

exports.down = (pgm) => {
  // Es el primer catalogo: deshacerlo lo vacia. Los vehiculos de los talleres no se tocan.
  pgm.sql('DELETE FROM catalogo_cargas');
  pgm.sql('DELETE FROM catalogo_modelo_anios');
  pgm.sql('DELETE FROM catalogo_modelos');
  pgm.sql('DELETE FROM catalogo_marcas');
};
