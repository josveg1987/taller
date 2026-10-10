import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService, Perfil, SESION_DIAS } from './auth.service';
import { COOKIE_SESION, leerCookie } from './auth.guard';
import { Contexto, Respuesta, Solicitud } from './contexto';
import { Publico, SesionActual } from './decoradores';
import { Limitador } from './limitador';
import { cuerpo, password } from '../validacion';

const opcionesCookie = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
});

@Controller('auth')
export class AuthController {
  private readonly limitador = new Limitador();
  /** Freno para adivinar la contrasena actual desde una sesion ya abierta. */
  private readonly limitadorCambio = new Limitador();

  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Publico()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: { email?: unknown; password?: unknown },
    @Req() req: Solicitud,
    @Res({ passthrough: true }) res: Respuesta,
  ): Promise<Perfil> {
    const { email, password } = body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password || email.length > 254 || password.length > 200) {
      throw new BadRequestException('Ingresa tu email y tu contraseña');
    }

    const clave = `${req.ip ?? ''}|${email.toLowerCase()}`;
    if (this.limitador.bloqueado(clave)) {
      throw new HttpException('Demasiados intentos. Espera unos minutos.', 429);
    }

    const sesion = await this.auth.login(email, password);
    if (!sesion) {
      this.limitador.fallo(clave);
      throw new UnauthorizedException('Email o contraseña incorrectos');
    }
    this.limitador.exito(clave);
    res.cookie(COOKIE_SESION, sesion.token, { ...opcionesCookie(), maxAge: SESION_DIAS * 24 * 60 * 60 * 1000 });

    const contexto = (await this.auth.validar(sesion.token)) as Contexto;
    return this.auth.perfil(contexto);
  }

  @Publico()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Solicitud, @Res({ passthrough: true }) res: Respuesta): Promise<void> {
    const token = leerCookie(req.headers.cookie, COOKIE_SESION);
    if (token) await this.auth.cerrarSesion(token);
    res.clearCookie(COOKIE_SESION, opcionesCookie());
  }

  /** Cambia la contrasena de la propia cuenta. Pide la actual. */
  @Post('password')
  @HttpCode(204)
  async cambiarPassword(@SesionActual() contexto: Contexto, @Body() body: unknown): Promise<void> {
    const b = cuerpo(body);
    if (typeof b.actual !== 'string' || !b.actual) throw new BadRequestException('Escribe tu contraseña actual');
    const nueva = password(b.nueva);
    if (this.limitadorCambio.bloqueado(contexto.sesionId)) {
      throw new HttpException('Demasiados intentos. Espera unos minutos.', 429);
    }
    try {
      await this.auth.cambiarPasswordPropia(contexto, b.actual, nueva);
    } catch (e) {
      if (e instanceof BadRequestException) this.limitadorCambio.fallo(contexto.sesionId);
      throw e;
    }
    this.limitadorCambio.exito(contexto.sesionId);
  }

  @Get('me')
  me(@SesionActual() contexto: Contexto): Promise<Perfil> {
    return this.auth.perfil(contexto);
  }
}
