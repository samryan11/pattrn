// Tipos del formato v0.1 que usa el núcleo. La definición completa está en
// esquemas/*.schema.json; acá solo lo que la geometría necesita leer.

import type { Punto, Transformacion } from "./geometria";

export type TipoBorde = "costura" | "doblez" | "union" | "terminado";

export interface Piquete {
  id: string;
  pos_mm: number;
  cantidad?: number;
  nota?: string;
}

export interface Borde {
  id: string;
  de: string;
  a: string;
  curva?: { tipo: "bezier"; c1: Punto; c2: Punto };
  etiqueta: string;
  tipo: TipoBorde;
  margen_mm?: number;
  terminado?: { que: string; ancho_mm?: number; donante?: number; descripcion?: string };
  certeza?: { estado: "cierta" | "incierta"; motivo?: string; nota?: string };
  piquetes?: Piquete[];
  [otro: string]: unknown;
}

export interface Fragmento {
  pattrn: "0.1";
  tipo: "fragmento";
  id: string;
  version: number;
  huella: string;
  nombre: string;
  origen: { metodo: string; [otro: string]: unknown };
  hilo: { punto: Punto; angulo_grados: number; fuente: string; sentido_unico?: boolean };
  vertices: Record<string, Punto>;
  bordes: Borde[];
  marcas?: unknown[];
  escalado?: unknown;
  [otro: string]: unknown;
}

export interface Instancia {
  id: string;
  ref: string;
  huella: string;
  transformacion: Transformacion;
}

export interface Fusion {
  a: string;
  b: string;
  alineacion: "inicio" | "fin" | "centro";
  resolucion: { modo: "ninguna" | "manda_a" | "manda_b" | "transicion"; aceptada?: string; zona_mm?: number };
}

export interface Pieza {
  id: string;
  nombre: string;
  instancias: Instancia[];
  fusiones?: Fusion[];
  [otro: string]: unknown;
}

export interface Molde {
  pattrn: "0.1";
  tipo: "molde";
  id: string;
  nombre: string;
  piezas: Pieza[];
  costuras?: unknown[];
  [otro: string]: unknown;
}
