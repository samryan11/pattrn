// La semilla de Patternpedia que viaja con la aplicación: las bases convertidas de FreeSewing.
// Cuando el archivo viva en su propio lugar, esto pasa a leerlo de ahí.

import type { Fragmento } from "../nucleo";
import indice from "../patternpedia/freesewing/indice.json";
import tallesFS from "../patternpedia/freesewing/talles.json";
import licenciaFS from "../patternpedia/freesewing/LICENCIA-FreeSewing-MIT.txt?raw";

const archivos = import.meta.glob("../patternpedia/freesewing/*/frg-*.json", { eager: true, import: "default" }) as Record<string, Fragmento>;

export interface PiezaDeBase {
  id: string;
  nombre: string;
  fragmento: Fragmento;
  cantidad: number;
  alDoblez: boolean;
}

export interface Base {
  id: string;
  nombre: string;
  descripcion: string;
  fuente: string;
  piezas: PiezaDeBase[];
}

const BASES: Record<string, { nombre: string; descripcion: string }> = {
  teagan: { nombre: "Remera", descripcion: "Remera de manga corta. Buen primer proyecto: tres piezas y pocas costuras." },
  aaron: { nombre: "Musculosa", descripcion: "Musculosa sin mangas, con vivos en sisa y escote." },
  brian: { nombre: "Torso con manga larga", descripcion: "Base de cuerpo y manga. De acá salen camisas, buzos y camperas." },
};

const PARTES: Record<string, string> = {
  front: "Delantera", back: "Espalda", sleeve: "Manga", armbinding: "Vivo de sisa", neckbinding: "Vivo de escote",
};

export const bases: Base[] = Object.keys(BASES).map((diseno) => {
  const piezas = (indice as { archivo: string; id: string; cortar: number | null }[])
    .filter((x) => x.archivo.startsWith(`${diseno}/`))
    .map((x) => {
      const fragmento = archivos[`../patternpedia/freesewing/${x.archivo}`];
      const parte = (fragmento.origen as unknown as { fuente: { id: string } }).fuente.id.split("/")[1].toLowerCase();
      return {
        id: parte, nombre: PARTES[parte] ?? parte, fragmento,
        cantidad: x.cortar ?? 1, alDoblez: fragmento.bordes.some((b) => b.tipo === "doblez"),
      };
    });
  return { id: diseno, ...BASES[diseno], fuente: `FreeSewing ${diseno[0].toUpperCase() + diseno.slice(1)}`, piezas };
});

export const baseDe = (id: string | null) => bases.find((b) => b.id === id) ?? null;

export interface Talle {
  id: string;
  grupo: "con_busto" | "recto";
  pecho_cm: number;
  cintura_cm: number;
  cadera_cm: number;
}

export const talles: Talle[] = (tallesFS as { id: string; grupo: "con_busto" | "recto"; pecho_mm: number; cintura_mm: number; cadera_mm: number }[])
  .map((t) => ({ id: t.id, grupo: t.grupo, pecho_cm: Math.round(t.pecho_mm / 10), cintura_cm: Math.round(t.cintura_mm / 10), cadera_cm: Math.round(t.cadera_mm / 10) }));

export const TALLE_BASE = "cisFemaleAdult36";
export const NOMBRE_GRUPO = { con_busto: "Con busto", recto: "Torso recto" } as const;

export function etiquetaDeTalle(id: string): string {
  const t = talles.find((x) => x.id === id);
  return t ? `pecho ${t.pecho_cm} · ${NOMBRE_GRUPO[t.grupo].toLowerCase()}` : id;
}

/** El talle de cada grupo que queda más cerca del contorno de pecho dado. */
export function tallesSugeridos(pechoCm: number): string[] {
  return (["con_busto", "recto"] as const).map((g) =>
    talles.filter((t) => t.grupo === g).reduce((a, b) => (Math.abs(b.pecho_cm - pechoCm) < Math.abs(a.pecho_cm - pechoCm) ? b : a)).id);
}

export const licencias = [{ nombre: "FreeSewing-MIT.txt", texto: licenciaFS }];
export const cantidadDeFragmentos = Object.keys(archivos).length;
