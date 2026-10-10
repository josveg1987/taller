// Crea un administrador de la app (dueno de la plataforma). No hay registro publico: la primera
// cuenta se crea con este comando.
//   npm run crear-admin -w @taller/api -- --email tu@correo.cl --nombre "Tu Nombre" [--password ...]
// Si no se entrega --password, se genera una al azar y se muestra una sola vez.
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { hashPassword, passwordValida } from '../auth/password';

function argumentos(): Record<string, string> {
  const r: Record<string, string> = {};
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i += 2) {
    if (a[i].startsWith('--') && a[i + 1] !== undefined) r[a[i].slice(2)] = a[i + 1];
  }
  return r;
}

async function main() {
  try {
    process.loadEnvFile('../../.env');
  } catch {
    // Sin .env: se usa lo que haya en el entorno.
  }
  const { email, nombre, password } = argumentos();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Falta DATABASE_URL');
  if (!email || !nombre) throw new Error('Uso: --email <correo> --nombre <nombre> [--password <clave>]');
  if (password !== undefined && !passwordValida(password)) {
    throw new Error('La contraseña debe tener entre 8 y 200 caracteres');
  }

  const clave = password ?? randomBytes(12).toString('base64url');
  const ssl = /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false };
  const pool = new Pool({ connectionString: url, ssl });
  try {
    // El correo es el identificador de ingreso: no puede coincidir con el de un usuario de taller.
    const enUso = await pool.query('SELECT 1 FROM usuarios WHERE lower(email) = lower($1)', [email]);
    if (enUso.rowCount) throw new Error(`El correo ${email} ya lo usa un usuario de taller`);
    // Si la clave la genera el comando, debe cambiarla al entrar (la vio quien ejecuto el comando).
    await pool.query('INSERT INTO administradores_app (nombre, email, password_hash, debe_cambiar_password) VALUES ($1, $2, $3, $4)', [
      nombre,
      email,
      await hashPassword(clave),
      password === undefined,
    ]);
    console.log(`Administrador creado: ${email}`);
    if (password === undefined) console.log(`Contraseña (guárdala, no se vuelve a mostrar): ${clave}`);
  } catch (e) {
    if ((e as { code?: string }).code === '23505') throw new Error(`Ya existe un administrador con el email ${email}`);
    throw e;
  } finally {
    await pool.end();
  }
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});
