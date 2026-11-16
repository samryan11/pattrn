// La semilla de Patternpedia que viaja con la aplicación: fragmentos convertidos de FreeSewing.
// No son moldes para entregar: son material para cortar y combinar.
// Cuando el archivo viva en su propio lugar, esto pasa a leerlo de ahí.

import type { Fragmento } from "../nucleo";
import indice from "../patternpedia/freesewing/indice.json";
import tallesFS from "../patternpedia/freesewing/talles.json";
import licenciaFS from "../patternpedia/freesewing/LICENCIA-FreeSewing-MIT.txt?raw";

// cada fragmento se carga recién cuando se lo pide: son más de cien
const archivos = import.meta.glob("../patternpedia/freesewing/*/frg-*.json", { import: "default" }) as Record<string, () => Promise<Fragmento>>;

export interface PiezaDeArchivo {
  diseno: string;
  parte: string;
  nombre: string;
  archivo: string;
  cantidad: number;
}

export interface Diseno {
  id: string;
  nombre: string;
  descripcion: string;
  grupo: string;
  piezas: PiezaDeArchivo[];
}

const DISENOS: [string, string, string, string][] = [
  ["teagan", "Remera", "Remera de manga corta.", "Torso"],
  ["aaron", "Musculosa", "Musculosa con vivos en sisa y escote.", "Torso"],
  ["brian", "Torso con manga larga", "Base de cuerpo y manga.", "Torso"],
  ["breanna", "Torso entallado", "Base de cuerpo entallada, con pinzas.", "Torso"],
  ["noble", "Torso con costadillos", "Base de cuerpo con cortes princesa.", "Torso"],
  ["bent", "Torso con manga de dos piezas", "Base de cuerpo con manga sastre.", "Torso"],
  ["diana", "Top con escote drapeado", "Top con cuello caído.", "Torso"],
  ["sven", "Buzo", "Buzo simple, con puños y cintura.", "Torso"],
  ["hugo", "Buzo con capucha y manga raglán", "Manga raglán, capucha y bolsillo.", "Torso"],
  ["huey", "Campera con capucha", "Campera con cierre, capucha y bolsillos.", "Torso"],
  ["simon", "Camisa", "Camisa con cuello, pie de cuello, canesú y puños.", "Torso"],
  ["wahid", "Chaleco", "Chaleco entallado, con vistas y forro.", "Abrigo y sastrería"],
  ["jaeger", "Saco", "Saco sastre, con solapa, forro y bolsillos.", "Abrigo y sastrería"],
  ["carlton", "Tapado largo", "Tapado largo con cuello, cinturón y forro.", "Abrigo y sastrería"],
  ["sophie", "Vestido lencero", "Paneles de frente y espalda de un vestido lencero.", "Falda y vestido"],
  ["sandy", "Falda circular", "Falda de círculo con pretina.", "Falda y vestido"],
  ["penelope", "Falda tubo", "Falda recta entallada, con pinzas.", "Falda y vestido"],
  ["charlie", "Pantalón chino", "Pantalón con bolsillos, pretina y bragueta.", "Pantalón"],
  ["paco", "Pantalón de verano", "Pantalón suelto con puño y pretina.", "Pantalón"],
  ["titan", "Pantalón base", "Base de pantalón, delantero y trasero.", "Pantalón"],
  ["waralee", "Pantalón cruzado", "Pantalón envolvente con tiras.", "Pantalón"],
];

const PARTES: Record<string, string> = {
  front: "Delantera", back: "Espalda", sleeve: "Manga", waistband: "Pretina", cuff: "Puño", pocket: "Bolsillo",
  collar: "Cuello", collarstand: "Pie de cuello", topsleeve: "Manga superior", undersleeve: "Manga inferior",
  frontfacing: "Vista delantera", frontlining: "Forro delantero", neckbinding: "Vivo de escote", armbinding: "Vivo de sisa",
  pocketfacing: "Vista de bolsillo", pocketlining: "Forro de bolsillo", chestpocketwelt: "Vivo del bolsillo de pecho",
  chestpocketbag: "Fondo del bolsillo de pecho", innerpocketbag: "Fondo del bolsillo interno", innerpocketwelt: "Vivo del bolsillo interno",
  backinside: "Espalda central", backoutside: "Costadillo de espalda", frontinside: "Delantera central", frontoutside: "Costadillo delantero",
  frontright: "Delantera derecha", frontleft: "Delantera izquierda", sleeveplacketoverlap: "Cartera de manga, pieza de arriba",
  sleeveplacketunderlap: "Cartera de manga, pieza de abajo", yoke: "Canesú", hoodside: "Capucha, lado", hoodcenter: "Capucha, centro",
  hood: "Capucha", pocketwelt: "Vivo de bolsillo", pocketbag: "Fondo de bolsillo", pocketinterfacing: "Entretela de bolsillo",
  chestpiece: "Plastrón", side: "Costado", undercollar: "Bajo cuello", backstay: "Refuerzo de espalda", tail: "Faldón",
  belt: "Cinturón", cufffacing: "Vista de puño", pocketflap: "Tapa de bolsillo", innerpockettab: "Lengüeta del bolsillo interno",
  frontpanel: "Panel delantero", backpanel: "Panel de espalda", skirt: "Falda", frontpocketbag: "Fondo del bolsillo delantero",
  frontpocketfacing: "Vista del bolsillo delantero", backpocketbag: "Fondo del bolsillo trasero", backpocketfacing: "Vista del bolsillo trasero",
  backpocketinterfacing: "Entretela del bolsillo trasero", backpocketwelt: "Vivo del bolsillo trasero", flyfacing: "Vista de bragueta",
  flyextension: "Extensión de bragueta", beltloops: "Presillas", pants: "Pierna", backpocket: "Bolsillo trasero",
  strapfront: "Tira delantera", strapback: "Tira trasera",
};

type Entrada = { archivo: string; diseno: string; parte: string; cortar: number | null };

export const disenos: Diseno[] = DISENOS.map(([id, nombre, descripcion, grupo]) => ({
  id, nombre, descripcion, grupo,
  piezas: (indice as Entrada[]).filter((x) => x.diseno === id).map((x) => ({
    diseno: id, parte: x.parte, nombre: PARTES[x.parte.toLowerCase()] ?? x.parte, archivo: x.archivo, cantidad: x.cortar ?? 1,
  })),
})).filter((d) => d.piezas.length > 0);

export const grupos = [...new Set(disenos.map((d) => d.grupo))];
export const disenoDe = (id: string | null) => disenos.find((d) => d.id === id) ?? null;

/** El fragmento del archivo, en su talle base. */
export async function cargarFragmento(p: PiezaDeArchivo): Promise<Fragmento> {
  const cargar = archivos[`../patternpedia/freesewing/${p.archivo}`];
  if (!cargar) throw new Error(`Patternpedia no tiene ${p.archivo}`);
  return structuredClone(await cargar());
}

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
