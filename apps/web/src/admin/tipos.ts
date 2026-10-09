// Deben coincidir con apps/api/src/admin/admin.service.ts.
export interface TallerResumen {
  id: string;
  nombre: string;
  activo: boolean;
  maxUsuarios: number;
  usuariosActivos: number;
  creadoEn: string;
}

export interface UsuarioResumen {
  id: string;
  nombre: string;
  email: string;
  activo: boolean;
  creadoEn: string;
}

export interface TallerDetalle extends TallerResumen {
  usuarios: UsuarioResumen[];
}
