// El estado de lo que la persona está haciendo ahora: su idea, lo que contó y su lienzo.

import type { Punto } from "../nucleo";
import type { AlmacenConBytes } from "./almacen";
import { lienzoVacio, type Lienzo } from "./lienzo";
import { TALLE_BASE } from "./patternpedia";
import { descripcionInicial, type Descripcion } from "./plan";

export type Pantalla = "idea" | "contame" | "molde" | "descargas" | "espacio";
export type Modo = "imagen" | "boceto" | "texto";
export type Herramienta = "mover" | "cortar" | "coser";
export interface Adjunto { nombre: string; tipo: string; bytes: Uint8Array; url: string }

export interface Contexto {
  para_quien: "para_mi" | "otra_persona" | "talle_estandar";
  tipo_prenda: string;
  donantes: string;
  forro: { lleva: boolean; tela: "reusada" | "nueva" | "no_se" };
  experiencia: "primera_prenda" | "algunas" | "seguido";
  maquina: "recta" | "recta_y_overlock" | "a_mano";
}

export const sesionNueva = () => ({
  pantalla: "idea" as Pantalla,
  nombre: "",
  modo: "imagen" as Modo,
  tipoImagen: "imagen_ia" as "imagen_ia" | "foto_prenda",
  texto: "",
  adjuntos: { imagen: null, boceto: null, look: null } as Record<"imagen" | "boceto" | "look", Adjunto | null>,
  contexto: {
    para_quien: "para_mi", tipo_prenda: "", donantes: "", forro: { lleva: false, tela: "no_se" },
    experiencia: "primera_prenda", maquina: "recta",
  } as Contexto,
  // el lienzo y lo que se está haciendo en él
  lienzo: lienzoVacio() as Lienzo,
  talle: TALLE_BASE,
  disenosAbiertos: [] as string[],
  /** Lo que la persona contestó sobre la prenda, y lo que el plan avisó al armarla. */
  descripcion: descripcionInicial() as Descripcion,
  notasDelPlan: [] as string[],
  aMano: false,
  /** Estados anteriores del lienzo, para deshacer, y los deshechos, para rehacer. */
  historial: [] as Lienzo[],
  rehacer: [] as Lienzo[],
  herramienta: "mover" as Herramienta,
  sel: null as string | null,
  selBorde: null as string | null,
  /** Primer clic de un corte (punto del lienzo) o de una costura (borde). */
  pendiente: null as Punto | { pieza: string; borde: string } | null,
  formatos: { pdf: true, dxf: true, hoja: true },
  almacen: null as AlmacenConBytes | null,
  proyectoId: "",
  moldeId: "",
  aviso: null as { texto: string; error?: boolean } | null,
  ocupado: false,
});

export type Sesion = ReturnType<typeof sesionNueva>;
