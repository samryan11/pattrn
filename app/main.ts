// Ventana de la unión: muestra la diferencia de los bordes de unión, ofrece las tres
// resoluciones con sus consecuencias y aplica solo la que se elige. Nada automático.

import {
  analizarFusiones, aplicarResolucion, cm, contornoResuelto, opcionesDeResolucion, tramoDeBorde,
  type Fragmento, type Molde, type ModoResolucion, type OpcionDeResolucion, type Tramo, type TramoDePieza,
} from "../nucleo";
import moldeBase from "../esquemas/ejemplos/proyecto-camisa-canesu/moldes/mol-cam0base.json";
import canesu from "../esquemas/ejemplos/proyecto-camisa-canesu/fragmentos/frg-oxf9k3b2@1.json";
import inferior from "../esquemas/ejemplos/proyecto-camisa-canesu/fragmentos/frg-cua4m8d1@2.json";

const fragmentos = [canesu, inferior] as unknown as Fragmento[];
const resolver = (ref: string, huella: string) => {
  const f = fragmentos.find((x) => `${x.id}@${x.version}` === ref);
  if (!f || f.huella !== huella) throw new Error(`no se encontró ${ref} con esa huella`);
  return f;
};
const PIEZA = "delantero";

const estado = {
  molde: moldeBase as unknown as Molde,
  /** Opción que se está mirando, todavía sin aplicar. */
  vista: null as ModoResolucion | null,
  zona: 60,
};

const SVG = "http://www.w3.org/2000/svg";
const $ = (id: string) => document.getElementById(id)!;
const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const nombreModo: Record<ModoResolucion, string> = { manda_a: "Manda", manda_b: "Manda", transicion: "Transición suave" };

// ---------------------------------------------------------------- dibujo

function d(t: Tramo): string {
  const p = (q: readonly [number, number]) => `${q[0]},${-q[1]}`; // el SVG tiene y hacia abajo
  return t.tipo === "recta" ? `M${p(t.p0)} L${p(t.p1)}` : `M${p(t.p0)} C${p(t.c1)} ${p(t.c2)} ${p(t.p1)}`;
}

function trazo(svg: SVGSVGElement, t: Tramo, clase: string) {
  const path = document.createElementNS(SVG, "path");
  path.setAttribute("d", d(t));
  path.setAttribute("class", clase);
  path.setAttribute("vector-effect", "non-scaling-stroke");
  svg.append(path);
}

function puntoMarcado(svg: SVGSVGElement, q: readonly [number, number]) {
  const c = document.createElementNS(SVG, "circle");
  c.setAttribute("cx", String(q[0]));
  c.setAttribute("cy", String(-q[1]));
  c.setAttribute("r", "4");
  c.setAttribute("class", "extremo");
  svg.append(c);
}

function dibujar(contorno: TramoDePieza[] | null) {
  const svg = document.createElementNS(SVG, "svg");
  const pieza = estado.molde.piezas.find((p) => p.id === PIEZA)!;
  // los fragmentos tal cual, siempre debajo como referencia
  for (const inst of pieza.instancias) {
    const frag = resolver(inst.ref, inst.huella);
    for (const b of frag.bordes) {
      trazo(svg, tramoDeBorde(frag, b, inst.transformacion), contorno ? "original" : `borde ${b.tipo}`);
    }
  }
  if (contorno) {
    for (const t of contorno) trazo(svg, t.tramo, t.modificado ? "borde cambia" : `borde ${t.borde.tipo}`);
  }
  for (const u of analizarFusiones(estado.molde, resolver)) {
    if (!contorno) {
      puntoMarcado(svg, u.tramoA.p1);
      puntoMarcado(svg, u.tramoB.p0);
    }
  }
  const caja = { x: -30, y: -720, w: 330, h: 620 };
  svg.setAttribute("viewBox", `${caja.x} ${caja.y} ${caja.w} ${caja.h}`);
  $("lienzo").replaceChildren(svg);
}

// ---------------------------------------------------------------- panel

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...hijos: (Node | string)[]) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...hijos);
  return e;
}

function mostrar() {
  const fusion = estado.molde.piezas.find((p) => p.id === PIEZA)!.fusiones![0];
  const [u] = analizarFusiones(estado.molde, resolver);
  const aplicada = fusion.resolucion.modo !== "ninguna";
  $("nombre-molde").textContent = estado.molde.nombre;

  // el aviso está siempre, con o sin resolución
  const sobra = u.sobra === "a" ? fusion.a : fusion.b;
  $("aviso").replaceChildren(
    el("p", { className: "titulo-aviso" }, "Los bordes de unión no miden lo mismo"),
    el("div", { className: "medida" }, fusion.a, el("strong", {}, cm(u.largoA))),
    el("div", { className: "medida" }, fusion.b, el("strong", {}, cm(u.largoB))),
    el("p", { className: "sobra" }, `Sobran ${cm(Math.abs(u.diferencia))} en ${sobra}`),
    el("p", { className: "estado" }, aplicada
      ? `Resolución aplicada: ${describirModo(fusion.resolucion.modo as ModoResolucion, fusion)}, aceptada el ${fusion.resolucion.aceptada}.`
      : "Sin resolver: los fragmentos están tal cual. Elegí una opción para verla; nada cambia hasta que la apliques."),
  );

  const opciones = opcionesDeResolucion(estado.molde, resolver, PIEZA, estado.zona);
  const lista = el("div", { className: "lista-opciones" });
  for (const op of opciones) lista.append(tarjeta(op, fusion));

  const acciones = el("div", { className: "acciones" });
  if (estado.vista) {
    const op = opciones.find((o) => o.modo === estado.vista)!;
    acciones.append(el("button", {
      className: "primario", disabled: !op.disponible,
      textContent: `Aplicar: ${describirModo(op.modo, fusion)}`,
      onclick: () => {
        estado.molde = aplicarResolucion(estado.molde, PIEZA, op.modo, hoy(), estado.zona);
        estado.vista = null;
        mostrar();
      },
    }), el("button", { textContent: "Cancelar", onclick: () => { estado.vista = null; mostrar(); } }));
  } else if (aplicada) {
    acciones.append(el("button", {
      textContent: "Quitar la resolución",
      onclick: () => { estado.molde = aplicarResolucion(estado.molde, PIEZA, "ninguna", hoy()); mostrar(); },
    }));
  }
  $("opciones").replaceChildren(el("h3", {}, aplicada ? "Cambiar la resolución" : "Opciones"), lista, acciones);

  const vista = estado.vista ? opciones.find((o) => o.modo === estado.vista)! : null;
  dibujar(vista ? vista.contorno : aplicada ? contornoResuelto(estado.molde, resolver, PIEZA) : null);
}

function describirModo(modo: ModoResolucion, fusion: { a: string; b: string }) {
  return modo === "manda_a" ? `manda ${fusion.a}` : modo === "manda_b" ? `manda ${fusion.b}` : "transición suave";
}

function tarjeta(op: OpcionDeResolucion, fusion: { a: string; b: string; resolucion: { modo: string } }) {
  const elegida = estado.vista === op.modo;
  const vigente = fusion.resolucion.modo === op.modo;
  const titulo = op.modo === "transicion" ? nombreModo[op.modo] : `${nombreModo[op.modo]} ${op.modo === "manda_a" ? fusion.a : fusion.b}`;
  const t = el("button", {
    className: `opcion${elegida ? " elegida" : ""}${op.disponible ? "" : " no-disponible"}`,
    onclick: () => { estado.vista = elegida ? null : op.modo; mostrar(); },
  }, el("strong", {}, titulo + (vigente ? " · aplicada" : "")));
  if (!op.disponible) t.append(el("span", { className: "motivo" }, `No disponible: ${op.motivo}`));
  for (const c of op.cambios) {
    t.append(el("span", { className: "cambio" },
      `${c.origen} ${c.etiqueta}: ${c.descripcion} · ${cm(c.antes)} → ${cm(c.despues)}`));
  }
  if (op.modo === "transicion") {
    const zona = document.createElement("input");
    Object.assign(zona, { type: "number", min: "10", max: "200", step: "5", value: String(estado.zona) });
    zona.onclick = (e) => e.stopPropagation();
    zona.onchange = () => { estado.zona = Math.max(10, Number(zona.value) || 60); estado.vista = "transicion"; mostrar(); };
    t.append(el("label", { className: "zona" }, "Zona de transición (mm) ", zona));
  }
  return t;
}

mostrar();
