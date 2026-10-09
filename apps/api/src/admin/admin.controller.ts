import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post } from '@nestjs/common';
import { Contexto } from '../auth/contexto';
import { SesionActual, SoloAdminApp } from '../auth/decoradores';
import { AdminService } from './admin.service';
import { booleano, cuerpo, email, entero, idValido, password, texto } from './validacion';

const MAX_USUARIOS = 50;

/** Mantenedores del administrador de la app: talleres y usuarios. */
@SoloAdminApp()
@Controller('admin')
export class AdminController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}

  @Get('talleres')
  listarTalleres() {
    return this.admin.listarTalleres();
  }

  @Post('talleres')
  crearTaller(@Body() body: unknown) {
    const b = cuerpo(body);
    return this.admin.crearTaller(
      texto(b.nombre, 'El nombre del taller'),
      b.maxUsuarios === undefined ? 2 : entero(b.maxUsuarios, 'El máximo de usuarios', 1, MAX_USUARIOS),
    );
  }

  @Get('talleres/:id')
  obtenerTaller(@Param('id') id: string) {
    return this.admin.obtenerTaller(idValido(id));
  }

  @Patch('talleres/:id')
  actualizarTaller(@Param('id') id: string, @Body() body: unknown) {
    const b = cuerpo(body);
    return this.admin.actualizarTaller(idValido(id), {
      nombre: b.nombre === undefined ? undefined : texto(b.nombre, 'El nombre del taller'),
      maxUsuarios:
        b.maxUsuarios === undefined ? undefined : entero(b.maxUsuarios, 'El máximo de usuarios', 1, MAX_USUARIOS),
      activo: b.activo === undefined ? undefined : booleano(b.activo, 'Activo'),
    });
  }

  @Post('talleres/:id/usuarios')
  crearUsuario(@Param('id') id: string, @Body() body: unknown) {
    const b = cuerpo(body);
    return this.admin.crearUsuario(idValido(id), {
      nombre: texto(b.nombre, 'El nombre'),
      email: email(b.email),
      password: password(b.password),
    });
  }

  @Patch('usuarios/:id')
  actualizarUsuario(@Param('id') id: string, @Body() body: unknown) {
    const b = cuerpo(body);
    return this.admin.actualizarUsuario(idValido(id), {
      nombre: b.nombre === undefined ? undefined : texto(b.nombre, 'El nombre'),
      email: b.email === undefined ? undefined : email(b.email),
      activo: b.activo === undefined ? undefined : booleano(b.activo, 'Activo'),
    });
  }

  @Post('usuarios/:id/password')
  @HttpCode(204)
  async cambiarPassword(@Param('id') id: string, @Body() body: unknown): Promise<void> {
    await this.admin.cambiarPassword(idValido(id), password(cuerpo(body).password));
  }

  /** El administrador "entra" a un taller para ver y operar con sus datos. */
  @Post('talleres/:id/entrar')
  @HttpCode(204)
  async entrarTaller(@Param('id') id: string, @SesionActual() c: Contexto): Promise<void> {
    await this.admin.entrarTaller(c.sesionId, idValido(id));
  }

  @Post('salir-taller')
  @HttpCode(204)
  async salirTaller(@SesionActual() c: Contexto): Promise<void> {
    await this.admin.salirTaller(c.sesionId);
  }
}
