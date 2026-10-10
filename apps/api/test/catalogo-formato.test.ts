import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo CommonJS sin tipos (se comparte con los scripts de Node)
import { nombreMarca, nombreModelo } from '../datos/formato.cjs';

describe('nombres de marcas del catalogo', () => {
  it.each([
    ['TOYOTA', 'Toyota'],
    ['KIA MOTORS', 'Kia'],
    ['MERCEDES BENZ', 'Mercedes-Benz'],
    ['ROLLS ROYCE', 'Rolls-Royce'],
    ['LAND ROVER', 'Land Rover'],
    ['ALFA ROMEO', 'Alfa Romeo'],
    ['GREAT WALL', 'Great Wall'],
    ['SSANGYONG', 'SsangYong'],
    ['DS AUTOMOBILES', 'DS'],
    ['LYNK CO', 'Lynk & Co'],
    ['BMW', 'BMW'],
    ['MG', 'MG'],
    ['JAC', 'JAC'],
    ['BYD', 'BYD'],
    ['GAC GONOW', 'GAC Gonow'],
    ['  chevrolet  ', 'Chevrolet'],
  ])('%s -> %s', (sii, esperado) => {
    expect(nombreMarca(sii)).toBe(esperado);
  });
});

describe('nombres de modelos del catalogo', () => {
  it.each([
    ['YARIS', 'Yaris'],
    ['HILUX', 'Hilux'],
    ['HILUX GRS', 'Hilux GRS'],
    ['SPARK GT', 'Spark GT'],
    ['C-HR', 'C-HR'],
    ['RAV4', 'RAV4'],
    ['CX-5', 'CX-5'],
    ['CX-30', 'CX-30'],
    ['D-MAX', 'D-Max'],
    ['S10', 'S10'],
    ['H350 SOLATI', 'H350 Solati'],
    ['WINGLE5', 'Wingle5'],
    ['MG3', 'MG3'],
    ['T8 PRO', 'T8 Pro'],
    ['APV', 'APV'],
    ['GLE', 'GLE'],
    ['EL_CAMINO', 'El Camino'],
    ['APACHE-10', 'Apache-10'],
    ['XV  5710', 'XV 5710'],
    ['3008', '3008'],
    ['Q5', 'Q5'],
    ['MORNING', 'Morning'],
    ['4RUNNER', '4Runner'],
    ['ASX', 'ASX'],
    ['SPRINTER 315 CDI', 'Sprinter 315 CDI'],
    ['PICK-UP', 'Pick-Up'],
    ['UP', 'UP'],
    ['JAECOO 6 AWD', 'Jaecoo 6 AWD'],
  ])('%s -> %s', (sii, esperado) => {
    expect(nombreModelo(sii)).toBe(esperado);
  });
});
