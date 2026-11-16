// Hoja de pieza: qué piezas tiene el molde, cuántas veces se corta cada una y qué lleva cada borde.
// Es una lista para tener al lado de la máquina; los moldes están en los otros PDF.

import { cm } from "../unidades";
import { largoDeBorde } from "../fragmento";
import { llevaMargen, type Fragmento } from "../tipos";
import { A4, Pagina, documentoPdf, type Color } from "./pdf";

export interface PiezaDeHoja {
  nombre: string;
  fragmento: Fragmento;
  cantidad: number;
  alDoblez: boolean;
}

export interface DatosDeHoja {
  titulo: string;
  talle: string;
  base: string;
  piezas: PiezaDeHoja[];
  /** Lo que la persona contó del proyecto: para quién, telas, forro. */
  notas: string[];
  /** Avisos de licencia y de origen. */
  atribucion: string[];
}

const GRIS: Color = [0.4, 0.4, 0.4];
const ETIQUETA: Record<string, string> = {
  centro_frente: "centro frente", centro_espalda: "centro espalda", copa_manga: "copa de manga",
  costura_manga: "costura de manga", puno: "puño", linea_diseno: "línea de diseño", pie_cuello: "pie de cuello",
};
const TIPO: Record<string, string> = { costura: "costura", dobladillo: "dobladillo", doblez: "al doblez", union: "unión", terminado: "terminado" };

/** Solo Latin-1: lo que no entra se reemplaza para que el PDF no falle. */
const latin = (s: string) => Array.from(s, (c) => (c.codePointAt(0)! > 255 ? (c === "→" ? "a" : "?") : c)).join("");

export function exportarHojaDePieza(d: DatosDeHoja): Uint8Array {
  const paginas: Pagina[] = [];
  let p!: Pagina, y = 0;
  const nueva = () => { p = new Pagina(); paginas.push(p); y = A4[1] - 20; };
  const linea = (s: string, tam = 3.4, o: { negrita?: boolean; color?: Color; x?: number } = {}) => {
    if (y < 20) nueva();
    p.texto(o.x ?? 20, y, latin(s), tam, o);
    y -= tam * 1.6;
  };
  nueva();
  linea("PATTRN · Hoja de pieza", 3, { color: GRIS });
  y -= 2;
  linea(d.titulo, 6.5, { negrita: true });
  y -= 2;
  linea(`Talle: ${d.talle}`, 4);
  linea(`Base: ${d.base}`, 4);
  y -= 4;
  if (d.notas.length) {
    linea("Del proyecto", 4.2, { negrita: true });
    for (const n of d.notas) linea(n);
    y -= 4;
  }
  linea("Piezas", 4.2, { negrita: true });
  linea("Las medidas son de la línea de costura. El margen ya está sumado en la línea de corte del molde.", 2.9, { color: GRIS });
  y -= 2;
  for (const pz of d.piezas) {
    if (y < 60) nueva();
    const cortar = pz.alDoblez ? `cortar ${pz.cantidad} con la tela al doblez` : `cortar ${pz.cantidad}`;
    linea(`${pz.nombre} · ${cortar}`, 3.8, { negrita: true });
    for (const b of pz.fragmento.bordes) {
      const nombre = ETIQUETA[b.etiqueta] ?? b.etiqueta;
      const margen = llevaMargen(b.tipo) ? `margen ${cm(b.margen_mm ?? 0)}` : b.tipo === "doblez" ? "sin margen: va al doblez" : "sin margen";
      const incierto = b.certeza?.estado === "incierta" ? " · REVISAR antes de cortar" : "";
      linea(`${b.id}  ${nombre} · ${TIPO[b.tipo]} · ${cm(largoDeBorde(pz.fragmento, b.id))} · ${margen}${incierto}`, 3.1, { x: 26 });
    }
    const piquetes = pz.fragmento.bordes.reduce((s, b) => s + (b.piquetes?.length ?? 0), 0);
    if (piquetes) linea(`${piquetes} piquete${piquetes > 1 ? "s" : ""}: marcarlos antes de sacar el molde de la tela`, 3.1, { x: 26, color: GRIS });
    y -= 3;
  }
  y -= 2;
  if (y < 20 + d.atribucion.length * 5) nueva();
  linea("Origen y licencia", 4.2, { negrita: true });
  for (const a of d.atribucion) linea(a, 2.9, { color: GRIS });
  return documentoPdf(paginas, `PATTRN · ${latin(d.titulo)} · hoja de pieza`);
}
