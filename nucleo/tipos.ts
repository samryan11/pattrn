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
  tela: string;
  transformacion: Transformacion;
}

export type Alineacion = "inicio" | "fin" | "centro";

export interface Resolucion {
  modo: "ninguna" | "manda_a" | "manda_b" | "transicion";
  aceptada?: string;
  zona_mm?: number;
}

export interface Fusion {
  a: string;
  b: string;
  alineacion: Alineacion;
  resolucion: Resolucion;
}

export interface Tela {
  id: string;
  descripcion: string;
  donante?: string;
}

export interface LadoCostura {
  pieza: string;
  bordes: string[];
  invertido?: boolean;
}

export interface Costura {
  id: string;
  a: LadoCostura;
  b: LadoCostura;
  embebido_mm?: number;
  tolerancia_mm?: number;
  alineacion?: Alineacion;
  resolucion?: Resolucion;
  piquetes_pares?: [string, string][];
  nota?: string;
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
  telas: Tela[];
  piezas: Pieza[];
  costuras?: Costura[];
  [otro: string]: unknown;
}
