// Convierte diseños de FreeSewing a fragmentos PATTRN, para poblar Patternpedia.
//
// Uso: npx tsx herramientas/convertir-freesewing.ts [diseño…]     (por defecto: aaron brian teagan)
//
// Cada diseño tiene que estar instalado como @freesewing/<diseño>. Antes de convertirlo se
// lee la licencia que declara su paquete: si no es MIT, no se convierte.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fragmentoDeFreeSewing, type CorteFS, type ParteFS } from "../nucleo/convertir/freesewing";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = join(RAIZ, "patternpedia", "freesewing");
const LICENCIA_URL = "https://codeberg.org/freesewing/freesewing";
const AVISO = readFileSync(join(SALIDA, "LICENCIA-FreeSewing-MIT.txt"), "utf-8").split("\n").slice(0, 3).join(" ").replace(/\s+/g, " ").trim()
  + " · texto completo de la licencia en patternpedia/freesewing/LICENCIA-FreeSewing-MIT.txt";
const TALLE_BASE = "cisFemaleAdult36";
const MARGEN = 10; // mm: el margen con el que se genera, para medir el de cada borde

type Patron = { draft(): Patron; getConfig(): { measurements: string[]; optionalMeasurements?: string[] }; parts: Record<string, ParteFS>[]; setStores: { cutlist: Record<string, CorteFS>; logs: { error: unknown[] } }[] };

export async function convertirDiseno(diseno: string, fecha: string) {
  const paquete = JSON.parse(readFileSync(join(RAIZ, "node_modules", "@freesewing", diseno, "package.json"), "utf-8"));
  if (paquete.license !== "MIT") throw new Error(`${diseno}: su paquete declara la licencia «${paquete.license}», no MIT. No se convierte.`);
  const modulo = await import(`@freesewing/${diseno}`);
  const Diseno = modulo[diseno[0].toUpperCase() + diseno.slice(1)] as new (o: object) => Patron;
  const modelos = (await import("@freesewing/models")) as unknown as Record<string, Record<string, number>>;
  const generar = (talle: string) => {
    const patron = new Diseno({ measurements: modelos[talle], sa: MARGEN, complete: true }).draft();
    if (patron.setStores[0].logs.error.length) throw new Error(`${diseno} en ${talle}: FreeSewing informó errores`);
    return patron;
  };
  const base = generar(TALLE_BASE);
  const pedidas = [...base.getConfig().measurements, ...(base.getConfig().optionalMeasurements ?? [])];
  const medidas = Object.fromEntries(pedidas.filter((m) => typeof modelos[TALLE_BASE][m] === "number").map((m) => [m, modelos[TALLE_BASE][m]]));
  const otros = Object.keys(modelos).filter((k) => /^cis(Female|Male)Adult\d+$/.test(k) && k !== TALLE_BASE);
  const generados = Object.fromEntries(otros.map((t) => { try { return [t, generar(t)]; } catch { return [t, null]; } }));
  const autor = `${String(paquete.author).replace(/\s*<.*$/, "")} y colaboradores de FreeSewing`;

  const salida = [];
  for (const [clave, parte] of Object.entries(base.parts[0])) {
    if (parte.hidden || !parte.paths.seam) continue;
    const nombreParte = clave.split(".").pop()!;
    const talles: Record<string, ParteFS> = {};
    for (const [t, patron] of Object.entries(generados)) if (patron?.parts[0][clave]?.paths.seam) talles[t] = patron.parts[0][clave];
    const r = await fragmentoDeFreeSewing({
      parte, corte: base.setStores[0].cutlist?.[clave], nombreParte,
      nombre: `${diseno[0].toUpperCase() + diseno.slice(1)} · ${nombreParte} (FreeSewing)`,
      id: `frg-fs${diseno}${nombreParte}`.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 36),
      fuente: { id: `${diseno}/${nombreParte}`, version: paquete.version, licencia: "MIT", url: LICENCIA_URL, aviso: AVISO, autor },
      talleBase: TALLE_BASE, medidas, talles, fecha,
    });
    salida.push(r);
  }
  return salida;
}

async function main() {
  const disenos = process.argv.slice(2).length ? process.argv.slice(2) : ["aaron", "brian", "teagan"];
  const d = new Date();
  const fecha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const indice = [];
  for (const diseno of disenos) {
    const carpeta = join(SALIDA, diseno);
    mkdirSync(carpeta, { recursive: true });
    for (const r of await convertirDiseno(diseno, fecha)) {
      const f = r.fragmento;
      writeFileSync(join(carpeta, `${f.id}.json`), JSON.stringify(f, null, 2) + "\n", "utf-8");
      const talles = Object.keys((f.escalado as { talles: object }).talles).length + 1;
      indice.push({ archivo: `${diseno}/${f.id}.json`, id: f.id, nombre: f.nombre, bordes: f.bordes.length, talles, cortar: r.cortar ?? null, avisos: r.avisos });
      console.log(`${f.id}  ${f.bordes.length} bordes · ${talles} talles${r.avisos.length ? ` · ${r.avisos.length} avisos` : ""}`);
      for (const a of r.avisos) console.log(`    ${a}`);
    }
  }
  writeFileSync(join(SALIDA, "indice.json"), JSON.stringify(indice, null, 2) + "\n", "utf-8");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e.message); process.exit(1); });
