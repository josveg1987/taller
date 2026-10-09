import { describe, expect, it } from 'vitest';
import { hashPassword, passwordValida, verifyPassword } from '../src/auth/password';
import { Limitador } from '../src/auth/limitador';

describe('contraseñas', () => {
  it('verifica la contraseña correcta y rechaza la incorrecta', async () => {
    const h = await hashPassword('clave-segura-1');
    expect(await verifyPassword('clave-segura-1', h)).toBe(true);
    expect(await verifyPassword('clave-segura-2', h)).toBe(false);
    expect(await verifyPassword('', h)).toBe(false);
  });

  it('no guarda la contraseña en claro y cada hash lleva su propia sal', async () => {
    const a = await hashPassword('clave-segura-1');
    const b = await hashPassword('clave-segura-1');
    expect(a).not.toContain('clave-segura-1');
    expect(a).not.toBe(b);
    expect(a.startsWith('scrypt$')).toBe(true);
  });

  it('un hash mal formado nunca valida (y no revienta)', async () => {
    expect(await verifyPassword('x', '')).toBe(false);
    expect(await verifyPassword('x', 'texto-cualquiera')).toBe(false);
    expect(await verifyPassword('x', 'bcrypt$1$2$3$a$b')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$abc$8$1$AAAA$AAAA')).toBe(false);
  });

  it('exige entre 8 y 200 caracteres', () => {
    expect(passwordValida('1234567')).toBe(false);
    expect(passwordValida('12345678')).toBe(true);
    expect(passwordValida('x'.repeat(201))).toBe(false);
    expect(passwordValida(12345678)).toBe(false);
    expect(passwordValida(undefined)).toBe(false);
  });
});

describe('limitador de intentos', () => {
  it('bloquea al llegar al maximo y se libera al pasar la ventana', () => {
    let t = 0;
    const l = new Limitador(3, 1000, () => t);
    expect(l.bloqueado('k')).toBe(false);
    l.fallo('k');
    l.fallo('k');
    expect(l.bloqueado('k')).toBe(false);
    l.fallo('k');
    expect(l.bloqueado('k')).toBe(true);
    t = 999;
    expect(l.bloqueado('k')).toBe(true);
    t = 1000;
    expect(l.bloqueado('k')).toBe(false);
  });

  it('cada clave cuenta por separado y un exito reinicia la cuenta', () => {
    const l = new Limitador(2, 1000, () => 0);
    l.fallo('a');
    l.fallo('a');
    expect(l.bloqueado('a')).toBe(true);
    expect(l.bloqueado('b')).toBe(false);
    l.exito('a');
    expect(l.bloqueado('a')).toBe(false);
  });
});
