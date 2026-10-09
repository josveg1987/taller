import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { Solicitud } from './contexto';
import { PUBLICO, SOLO_ADMIN_APP } from './decoradores';

export const COOKIE_SESION = 'taller_sesion';

export function leerCookie(cabecera: string | string[] | undefined, nombre: string): string | null {
  const texto = Array.isArray(cabecera) ? cabecera.join(';') : cabecera;
  if (!texto) return null;
  for (const par of texto.split(';')) {
    const i = par.indexOf('=');
    if (i > 0 && par.slice(0, i).trim() === nombre) {
      try {
        return decodeURIComponent(par.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Guard global: toda ruta exige sesion salvo las marcadas con @Publico(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const destinos = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLICO, destinos)) return true;

    const req = ctx.switchToHttp().getRequest<Solicitud>();
    const token = leerCookie(req.headers.cookie, COOKIE_SESION);
    const contexto = token ? await this.auth.validar(token) : null;
    if (!contexto) throw new UnauthorizedException('Sesión no válida');
    req.contexto = contexto;

    if (this.reflector.getAllAndOverride<boolean>(SOLO_ADMIN_APP, destinos) && contexto.tipo !== 'admin_app') {
      throw new ForbiddenException('No tienes permiso para esto');
    }
    return true;
  }
}
