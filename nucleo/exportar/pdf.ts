// Escritor de PDF mínimo y sin dependencias. Todo se dibuja en milímetros: cada
// página empieza con una única escala mm → pt (72 / 25,4), así que lo que mide
// 100 en el contenido mide 100 mm impreso al 100 %.

import type { Punto } from "../geometria";

export const MM_A_PT = 72 / 25.4;
export const A4: Punto = [210, 297];

export type Color = readonly [number, number, number];

export interface Trazo {
  color?: Color;
  ancho?: number; // mm
  guiones?: number[]; // mm
  relleno?: Color;
  cerrado?: boolean;
}

const n = (x: number) => {
  const r = Math.round(x * 1000) / 1000;
  return Object.is(r, -0) ? "0" : String(r);
};
const rgb = (c: Color) => c.map((v) => n(v)).join(" ");

export class Pagina {
  private ops: string[] = [];

  constructor(readonly tamano: Punto = A4) {
    this.ops.push(`${n(MM_A_PT)} 0 0 ${n(MM_A_PT)} 0 0 cm`, "1 J 1 j");
  }

  polilinea(pts: readonly Punto[], t: Trazo = {}) {
    if (pts.length < 2) return;
    this.ops.push("q");
    if (t.color) this.ops.push(`${rgb(t.color)} RG`);
    if (t.relleno) this.ops.push(`${rgb(t.relleno)} rg`);
    this.ops.push(`${n(t.ancho ?? 0.25)} w`, `[${(t.guiones ?? []).map(n).join(" ")}] 0 d`);
    this.ops.push(`${n(pts[0][0])} ${n(pts[0][1])} m`);
    for (const p of pts.slice(1)) this.ops.push(`${n(p[0])} ${n(p[1])} l`);
    if (t.cerrado) this.ops.push("h");
    this.ops.push(t.relleno ? (t.color ? "B" : "f") : "S", "Q");
  }

  rectangulo(x: number, y: number, w: number, h: number, t: Trazo = {}) {
    this.polilinea([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], { ...t, cerrado: true });
  }

  circulo(c: Punto, r: number, t: Trazo = {}) {
    const k = 0.5523 * r, [x, y] = c;
    this.ops.push("q", `${rgb(t.color ?? [0, 0, 0])} RG`, `${n(t.ancho ?? 0.25)} w`, "[] 0 d",
      `${n(x + r)} ${n(y)} m`,
      `${n(x + r)} ${n(y + k)} ${n(x + k)} ${n(y + r)} ${n(x)} ${n(y + r)} c`,
      `${n(x - k)} ${n(y + r)} ${n(x - r)} ${n(y + k)} ${n(x - r)} ${n(y)} c`,
      `${n(x - r)} ${n(y - k)} ${n(x - k)} ${n(y - r)} ${n(x)} ${n(y - r)} c`,
      `${n(x + k)} ${n(y - r)} ${n(x + r)} ${n(y - k)} ${n(x + r)} ${n(y)} c`, "S", "Q");
  }

  /** Texto en Helvetica; tamaño en mm de cuerpo. Solo caracteres de Latin-1. */
  texto(x: number, y: number, s: string, tam = 3.2, opciones: { color?: Color; negrita?: boolean; angulo?: number } = {}) {
    const a = ((opciones.angulo ?? 0) * Math.PI) / 180;
    const [c, si] = [Math.cos(a), Math.sin(a)];
    this.ops.push("q", "BT", `/${opciones.negrita ? "F2" : "F1"} ${n(tam)} Tf`, `${rgb(opciones.color ?? [0, 0, 0])} rg`,
      `${n(c)} ${n(si)} ${n(-si)} ${n(c)} ${n(x)} ${n(y)} Tm`, `(${escaparTexto(s)}) Tj`, "ET", "Q");
  }

  /** Recorta lo que se dibuje después al rectángulo dado. */
  recortar(x: number, y: number, w: number, h: number) {
    this.ops.push(`${n(x)} ${n(y)} ${n(w)} ${n(h)} re W n`);
  }

  guardar() { this.ops.push("q"); }
  restaurar() { this.ops.push("Q"); }

  contenido(): string {
    return this.ops.join("\n");
  }
}

function escaparTexto(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c > 255) throw new Error(`carácter fuera de Latin-1 en el PDF: ${ch}`);
    out += ch === "(" || ch === ")" || ch === "\\" ? "\\" + ch : ch;
  }
  return out;
}

/** Arma el archivo PDF con las páginas dadas. */
export function documentoPdf(paginas: Pagina[], titulo = "PATTRN"): Uint8Array {
  const objetos: string[] = [];
  const agregar = (s: string) => objetos.push(s) as number; // devuelve el número de objeto

  const catalogo = agregar("");
  const arbol = agregar("");
  const f1 = agregar("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const f2 = agregar("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const hojas: number[] = [];
  for (const p of paginas) {
    const c = p.contenido();
    const contenido = agregar(`<< /Length ${c.length} >>\nstream\n${c}\nendstream`);
    hojas.push(agregar(
      `<< /Type /Page /Parent ${arbol} 0 R /MediaBox [0 0 ${n(p.tamano[0] * MM_A_PT)} ${n(p.tamano[1] * MM_A_PT)}] ` +
      `/Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${contenido} 0 R >>`));
  }
  objetos[catalogo - 1] = `<< /Type /Catalog /Pages ${arbol} 0 R /ViewerPreferences << /PrintScaling /None >> >>`;
  objetos[arbol - 1] = `<< /Type /Pages /Kids [${hojas.map((h) => `${h} 0 R`).join(" ")}] /Count ${hojas.length} >>`;
  const info = agregar(`<< /Title (${escaparTexto(titulo)}) /Producer (PATTRN) >>`);

  let pdf = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const posiciones: number[] = [];
  objetos.forEach((o, i) => {
    posiciones.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  pdf += posiciones.map((p) => `${String(p).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root ${catalogo} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  // un byte por carácter: todo el contenido es Latin-1
  return Uint8Array.from(pdf, (ch) => ch.charCodeAt(0));
}
