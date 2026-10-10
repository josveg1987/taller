import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo CommonJS sin tipos (se comparte con los scripts de Node)
import { limpiarModelo, nombreMarca, nombreModelo } from '../datos/formato.cjs';

describe('limpieza del modelo base', () => {
  it.each([
    // Codigos internos del SII al final
    ['Subaru', 'Forester 7300', 'Forester'],
    ['Subaru', 'Forester 7340', 'Forester'],
    ['Subaru', 'XV 5710', 'XV'],
    ['Subaru', 'Outback 0585', 'Outback'],
    ['Subaru', 'WRX 2606', 'WRX'],
    ['Subaru', 'Evoltis 1000', 'Evoltis'],
    ['Subaru', 'Impreza', 'Impreza'],
    // Cilindrada, transmision y accesorios
    ['Hyundai', 'Verna CB 1.4 MT Plus', 'Verna CB'],
    ['DFSK', '560 1.8', '560'],
    ['DFSK', 'Truck DC C22 AC', 'Truck DC C22'],
    ['DFSK', 'Truck CS 1.5 Serie C', 'Truck CS'],
    ['Chevrolet', 'D Cab 2.8 AUT', 'D Cab'],
    ['Jaecoo', 'Jaecoo 7 1.6T DCT AWD', 'Jaecoo 7'],
    // BMW: el motor no es otro modelo
    ['BMW', '118', '118'],
    ['BMW', '118I', '118'],
    ['BMW', '118 D', '118'],
    ['BMW', '320I', '320'],
    ['BMW', '330E', '330'],
    ['BMW', '128TI', '128'],
    ['BMW', 'M135I', 'M135'],
    ['BMW', 'M340I', 'M340'],
    ['BMW', '540 I', '540'],
    ['BMW', 'X5', 'X5'],
    ['BMW', 'IX3', 'IX3'],
    // Mercedes comerciales
    ['Mercedes-Benz', 'Sprinter 314 CDI', 'Sprinter'],
    ['Mercedes-Benz', 'Sprinter 316', 'Sprinter'],
    ['Mercedes-Benz', 'Vito 111 CDI', 'Vito'],
    ['Mercedes-Benz', 'Vito Tourer 116 CDI', 'Vito Tourer'],
    ['Mercedes-Benz', 'V-220 CDI', 'V-220'],
    ['Mercedes-Benz', 'V-220 D', 'V-220'],
    // Lo legitimo no se toca
    ['Mercedes-Benz', '190', '190'],
    ['Mercedes-Benz', 'Clase C', 'Clase C'],
    ['Peugeot', '3008', '3008'],
    ['Peugeot', '206', '206'],
    ['BMW', '1602', '1602'],
    ['BMW', '2002', '2002'],
    ['Toyota', 'Land Cruiser Prado', 'Land Cruiser Prado'],
    ['Hyundai', 'Kona OS EV', 'Kona OS EV'],
    ['Nissan', 'D21', 'D21'],
  ])('%s %s -> %s', (marca, modelo, esperado) => {
    expect(limpiarModelo(marca, modelo)).toBe(esperado);
  });

  it.each([
    ['DFSK', 'DFSK 4533'],
    ['Subaru', '1.6'],
    ['Subaru', '1.8'],
    ['Chevrolet', '1.300 KG'],
    ['BMW', '1.602'],
  ])('%s %s no es un modelo util', (marca, modelo) => {
    expect(limpiarModelo(marca, modelo)).toBeNull();
  });
});

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
