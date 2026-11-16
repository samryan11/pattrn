// Piezas chicas con las que se arman las pantallas.

import { aplanar, lineaDeCorte, tramoDeBorde, type Fragmento, type Punto } from "../nucleo";

export const SVG = "http://www.w3.org/2000/svg";
type Hijo = Node | string | null | false | undefined;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...hijos: Hijo[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith("aria-") || k.startsWith("data-") || k === "role" || k === "for") e.setAttribute(k, String(v));
    else (e as unknown as Record<string, unknown>)[k] = v;
  }
  e.append(...hijos.filter((h): h is Node | string => h !== null && h !== false && h !== undefined));
  return e;
}

export function svgEl(tag: string, attrs: Record<string, string | number> = {}, texto?: string): SVGElement {
  const n = document.createElementNS(SVG, tag) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (texto !== undefined) n.textContent = texto;
  return n;
}

export const boton = (texto: string, accion: () => void, clase = "secundario", deshabilitado = false) =>
  el("button", { type: "button", className: `boton ${clase}`, onclick: accion, disabled: deshabilitado }, texto);

export function campo(etiqueta: string, control: HTMLElement, ayuda?: string) {
  const id = control.id || (control.id = "c" + Math.random().toString(36).slice(2, 9));
  return el("div", { className: "campo-pt" }, el("label", { for: id }, etiqueta), control, ayuda ? el("span", { className: "ayuda" }, ayuda) : null);
}

export function selector<T extends string>(valor: T, opciones: [T, string][], alCambiar: (v: T) => void) {
  return el("select", { onchange: (e: Event) => alCambiar((e.target as HTMLSelectElement).value as T) },
    ...opciones.map(([v, t]) => el("option", { value: v, selected: v === valor }, t)));
}

export const COLOR_BORDE: Record<string, string> = { costura: "#1f5fbf", dobladillo: "#0d8089", doblez: "#7b3fa0", union: "#b85f00", terminado: "#1a8a4a" };

export const NOMBRE_ETIQUETA: Record<string, string> = {
  otro: "borde", centro_frente: "centro frente", centro_espalda: "centro espalda", copa_manga: "copa de manga",
  costura_manga: "costura de manga", puno: "puño", linea_diseno: "corte", pie_cuello: "pie de cuello", canesu: "canesú",
};
export const nombreDeEtiqueta = (e: string) => NOMBRE_ETIQUETA[e] ?? e;

/** Las piezas una al lado de la otra, sin nombres: la miniatura de un diseño o de una pieza. */
export function miniatura(fragmentos: Fragmento[], descripcion: string): SVGSVGElement {
  const svg = svgEl("svg", { role: "img", "aria-label": descripcion }) as SVGSVGElement;
  let x = 0, alto = 0;
  const colocadas = fragmentos.map((f) => {
    const corte = lineaDeCorte(f).flatMap((t) => t.puntos);
    const minX = Math.min(...corte.map((q) => q[0])), maxX = Math.max(...corte.map((q) => q[0]));
    const minY = Math.min(...corte.map((q) => q[1])), maxY = Math.max(...corte.map((q) => q[1]));
    const c = { f, corte, dx: x - minX, minY };
    x += maxX - minX + 60;
    alto = Math.max(alto, maxY - minY);
    return c;
  });
  for (const c of colocadas) {
    const P = (q: Punto) => `${(q[0] + c.dx).toFixed(1)},${(alto - (q[1] - c.minY)).toFixed(1)}`;
    svg.append(svgEl("polygon", { points: c.corte.map(P).join(" "), fill: "#fffdf8", stroke: "#8a8478", "stroke-width": 1, "vector-effect": "non-scaling-stroke" }));
    for (const b of c.f.bordes) {
      svg.append(svgEl("polyline", {
        points: aplanar(tramoDeBorde(c.f, b)).map(P).join(" "), fill: "none", stroke: COLOR_BORDE[b.tipo], "stroke-width": 1.8, "vector-effect": "non-scaling-stroke",
        ...(b.tipo === "doblez" ? { "stroke-dasharray": "6 4" } : {}),
      }));
    }
  }
  svg.setAttribute("viewBox", `-15 -15 ${Math.max(1, x - 60) + 30} ${alto + 30}`);
  return svg;
}
