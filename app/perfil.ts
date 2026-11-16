// Lo que es de la persona y queda en esta computadora: su perfil, sus medidas y la lista de
// lo que hizo. No hay cuenta ni servidor: se guarda en el almacenamiento local de la aplicación.

export interface Perfil {
  nombre: string;
  /** En centímetros. Vacío si no se cargó. */
  medidas: Record<string, string>;
}

export interface ProyectoReciente {
  nombre: string;
  /** Carpeta del proyecto. En el navegador es solo el nombre: no se puede reabrir sin elegirla. */
  carpeta: string;
  ruta: string | null;
  base: string | null;
  fecha: string;
}

export interface Descarga {
  archivo: string;
  proyecto: string;
  talle: string;
  fecha: string;
}

export const MEDIDAS: [string, string][] = [
  ["pecho", "Pecho"], ["cintura", "Cintura"], ["cadera", "Cadera"],
  ["espalda", "Largo de espalda"], ["brazo", "Largo de brazo"], ["hombros", "Ancho de hombros"],
];

function leer<T>(clave: string, defecto: T): T {
  try {
    const t = localStorage.getItem(clave);
    return t ? (JSON.parse(t) as T) : defecto;
  } catch {
    return defecto; // sin almacenamiento disponible, se sigue sin recordar
  }
}

function escribir(clave: string, valor: unknown) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch { /* sin almacenamiento disponible */ }
}

export const leerPerfil = () => leer<Perfil>("pattrn.perfil", { nombre: "", medidas: {} });
export const guardarPerfil = (p: Perfil) => escribir("pattrn.perfil", p);

export const leerRecientes = () => leer<ProyectoReciente[]>("pattrn.proyectos", []);
export function anotarReciente(p: ProyectoReciente) {
  const otros = leerRecientes().filter((x) => (x.ruta ?? x.carpeta) !== (p.ruta ?? p.carpeta));
  escribir("pattrn.proyectos", [p, ...otros].slice(0, 20));
}

export const leerDescargas = () => leer<Descarga[]>("pattrn.descargas", []);
export const anotarDescarga = (d: Descarga) => escribir("pattrn.descargas", [d, ...leerDescargas()].slice(0, 30));
