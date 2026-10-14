import { describe, expect, it } from 'vitest';
import {
  DETALLE_DESABOLLADO_ESTANDAR,
  DETALLE_PINTURA_ESTANDAR,
  detalleEfectivo,
  detalleParaGuardar,
  pasosDeDetalle,
} from './detalle-trabajo';

describe('detalle del trabajo', () => {
  it('los textos estandar traen varios pasos, uno por linea', () => {
    expect(pasosDeDetalle(DETALLE_PINTURA_ESTANDAR).length).toBeGreaterThanOrEqual(5);
    expect(pasosDeDetalle(DETALLE_DESABOLLADO_ESTANDAR).length).toBeGreaterThanOrEqual(3);
    expect(DETALLE_PINTURA_ESTANDAR.toLowerCase()).toContain('masilla');
    expect(DETALLE_PINTURA_ESTANDAR.toLowerCase()).toContain('primer');
  });

  it('usa el texto del taller y, si no hay, el estandar', () => {
    expect(detalleEfectivo('Mi proceso', DETALLE_PINTURA_ESTANDAR)).toBe('Mi proceso');
    expect(detalleEfectivo(null, DETALLE_PINTURA_ESTANDAR)).toBe(DETALLE_PINTURA_ESTANDAR);
    expect(detalleEfectivo('   \n ', DETALLE_PINTURA_ESTANDAR)).toBe(DETALLE_PINTURA_ESTANDAR);
  });

  it('pasos: quita espacios y lineas vacias', () => {
    expect(pasosDeDetalle('  uno \r\n\r\n dos\n   \ntres ')).toEqual(['uno', 'dos', 'tres']);
  });

  it('al guardar, vacio o igual al estandar se guarda como null (sigue al estandar)', () => {
    expect(detalleParaGuardar('', DETALLE_PINTURA_ESTANDAR)).toBeNull();
    expect(detalleParaGuardar(null, DETALLE_PINTURA_ESTANDAR)).toBeNull();
    expect(detalleParaGuardar(`  ${DETALLE_PINTURA_ESTANDAR}\n\n`, DETALLE_PINTURA_ESTANDAR)).toBeNull();
    expect(detalleParaGuardar('Lijar\nPintar', DETALLE_PINTURA_ESTANDAR)).toBe('Lijar\nPintar');
  });
});
