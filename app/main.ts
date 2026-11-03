// Ventana inicial: dibuja el molde de ejemplo y muestra su unión, medidos con el núcleo.

import {
  analizarFusiones, cm, IDENTIDAD, tramoDeBorde,
  type Fragmento, type Molde, type Tramo, type Transformacion,
} from "../nucleo";
import molde from "../esquemas/ejemplos/mol-cam0001a.json";
import canesu from "../esquemas/ejemplos/frg-oxf9k3b2.json";
import inferior from "../esquemas/ejemplos/frg-cua4m8d1.json";

const M = molde as unknown as Molde;
const fragmentos = [canesu, inferior] as unknown as Fragmento[];
const resolver = (ref: string) => {
  const f = fragmentos.find((x) => `${x.id}@${x.version}` === ref);
  if (!f) throw new Error(`no se encontró ${ref}`);
  return f;
};

const SVG = "http://www.w3.org/2000/svg";
const color: Record<string, string> = {
  costura: "var(--costura)", doblez: "var(--doblez)", union: "var(--union)", terminado: "var(--terminado)",
};
const ancho: Record<string, number> = { costura: 2, doblez: 2, union: 2.4, terminado: 5 };

// el SVG tiene y hacia abajo: se invierte una sola vez con el viewBox
function d(t: Tramo): string {
  const p = (q: readonly [number, number]) => `${q[0]},${-q[1]}`;
  return t.tipo === "recta" ? `M${p(t.p0)} L${p(t.p1)}` : `M${p(t.p0)} C${p(t.c1)} ${p(t.c2)} ${p(t.p1)}`;
}

function dibujar() {
  const svg = document.createElementNS(SVG, "svg");
  const xs: number[] = [], ys: number[] = [];
  for (const pieza of M.piezas) {
    for (const inst of pieza.instancias) {
      const frag = resolver(inst.ref);
      const tr: Transformacion = inst.transformacion ?? IDENTIDAD;
      for (const b of frag.bordes) {
        const t = tramoDeBorde(frag, b, tr);
        const path = document.createElementNS(SVG, "path");
        path.setAttribute("d", d(t));
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", color[b.tipo]);
        path.setAttribute("stroke-width", String(ancho[b.tipo]));
        if (b.tipo === "union") path.setAttribute("stroke-dasharray", "9 5");
        path.setAttribute("vector-effect", "non-scaling-stroke");
        svg.append(path);
        for (const q of t.tipo === "recta" ? [t.p0, t.p1] : [t.p0, t.c1, t.c2, t.p1]) {
          xs.push(q[0]);
          ys.push(-q[1]);
        }
      }
    }
  }
  const m = 30;
  const x0 = Math.min(...xs) - m, y0 = Math.min(...ys) - m;
  svg.setAttribute("viewBox", `${x0} ${y0} ${Math.max(...xs) - x0 + m} ${Math.max(...ys) - y0 + m}`);
  document.getElementById("lienzo")!.append(svg);
}

function mostrarUnion() {
  document.getElementById("nombre-molde")!.textContent = M.nombre;
  const caja = document.getElementById("union")!;
  for (const u of analizarFusiones(M, resolver)) {
    const fila = (nombre: string, valor: string) => {
      const div = document.createElement("div");
      div.className = "medida";
      div.append(nombre, Object.assign(document.createElement("strong"), { textContent: valor }));
      caja.append(div);
    };
    fila(u.fusion.a, cm(u.largoA));
    fila(u.fusion.b, cm(u.largoB));
    if (u.sobra) {
      const p = document.createElement("p");
      p.className = "sobra";
      p.textContent = `Sobran ${cm(Math.abs(u.diferencia))} en ${u.sobra === "a" ? u.fusion.a : u.fusion.b}`;
      caja.append(p);
    }
  }
}

dibujar();
mostrarUnion();
