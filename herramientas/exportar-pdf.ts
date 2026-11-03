// Exporta fragmentos a PDF A4 1:1 con el núcleo de PATTRN.
// Uso: npx tsx herramientas/exportar-pdf.ts <fragmento.json>... -o <carpeta>

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { cm, exportarFragmentoPdf, type Fragmento } from "../nucleo";

const args = process.argv.slice(2);
const i = args.indexOf("-o");
if (i < 0 || i === args.length - 1 || i === 0) {
  console.error("uso: exportar-pdf.ts <fragmento.json>... -o <carpeta>");
  process.exit(1);
}
const salida = args[i + 1];
mkdirSync(salida, { recursive: true });

for (const archivo of args.slice(0, i)) {
  const frag: Fragmento = JSON.parse(readFileSync(archivo, "utf-8"));
  const { pdf, medidas, hojas } = exportarFragmentoPdf(frag);
  const destino = join(salida, `${basename(archivo, ".json")}@${frag.version}.pdf`);
  writeFileSync(destino, pdf);
  console.log(`${destino} · ${1 + hojas.columnas * hojas.filas} hojas A4`);
  for (const m of medidas) {
    console.log(`  ${m.borde} ${m.etiqueta} (${m.tipo}): neto ${cm(m.neto)} · margen ${cm(m.margen)} · corte ${cm(m.corte)}`);
  }
}
