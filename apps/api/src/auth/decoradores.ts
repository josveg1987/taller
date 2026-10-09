import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Contexto, Solicitud, tallerIdDe } from './contexto';

export const PUBLICO = 'publico';
export const SOLO_ADMIN_APP = 'solo_admin_app';

/** Ruta accesible sin sesion (por defecto toda la API exige sesion). */
export const Publico = () => SetMetadata(PUBLICO, true);

/** Ruta solo para administradores de la app. */
export const SoloAdminApp = () => SetMetadata(SOLO_ADMIN_APP, true);

/** Inyecta el contexto de la sesion (quien es y de que taller). */
export const SesionActual = createParamDecorator((_: unknown, ctx: ExecutionContext): Contexto => {
  const req = ctx.switchToHttp().getRequest<Solicitud>();
  return req.contexto as Contexto;
});

/** Inyecta el taller sobre el que operar, para pasarlo a DatabaseService.conTaller(). */
export const TallerActual = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<Solicitud>();
  return tallerIdDe(req.contexto as Contexto);
});
