// Ventana de uniones. Muestra la diferencia entre los bordes que se unen y ofrece cómo
// resolverla. Si una fusión cruza telas distintas no la deja resolver: propone convertirla
// en costura. Nada cambia hasta que se toca "Aplicar" o "Convertir".

import {
  analizarCosturas, analizarFusiones, aplicarResolucion, aplicarResolucionDeCostura, cm,
  contornoResuelto, contornosResueltosDeCostura, fusionesEntreTelas, opcionesDeCostura,
  opcionesDeResolucion, proponerCostura, tramoDeBorde,
  type Fragmento, type Molde, type ModoCostura, type PropuestaDeCostura, type Tramo, type TramoDePieza,
} from "../nucleo";
import demo from "../esquemas/ejemplos/demo/mol-demo0telas.json";
import canesu from "../esquemas/ejemplos/frg-oxf9k3b2.json";
import inferior from "../esquemas/ejemplos/frg-cua4m8d1.json";

const MARGEN_POR_DEFECTO = 10; // mm, el del proyecto

const estado = {
  molde: demo as unknown as Molde,
  fragmentos: [canesu, inferior] as unknown as Fragmento[],
  /** Opción que se está mirando, todavía sin aplicar. */
  vista: null as ModoCostura | null,
  zona: 60,
  propuesta: null as PropuestaDeCostura | null,
};

const resolver = (ref: string, huella: string) => {
  const f = estado.fragmentos.find((x) => `${x.id}@${x.version}` === ref);
  if (!f || f.huella !== huella) throw new Error(`no se encontró ${ref} con esa huella`);
  return f;
};

const SVG = "http://www.w3.org/2000/svg";
const $ = (id: string) => document.getElementById(id)!;
const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const descripcionTela = (id: string) => estado.molde.telas.find((t) => t.id === id)?.descripcion ?? id;

// ---------------------------------------------------------------- dibujo

function d(t: Tramo): string {
  const p = (q: readonly [number, number]) => `${q[0]},${-q[1]}`; // el SVG tiene y hacia abajo
  return t.tipo === "recta" ? `M${p(t.p0)} L${p(t.p1)}` : `M${p(t.p0)} C${p(t.c1)} ${p(t.c2)} ${p(t.p1)}`;
}

function dibujar(contornos: TramoDePieza[][] | null, marcas: readonly (readonly [number, number])[] = []) {
  const svg = document.createElementNS(SVG, "svg");
  const trazo = (t: Tramo, clase: string) => {
    const path = document.createElementNS(SVG, "path");
    path.setAttribute("d", d(t));
    path.setAttribute("class", clase);
    path.setAttribute("vector-effect", "non-scaling-stroke");
    svg.append(path);
  };
  // los fragmentos tal cual, siempre: debajo y en gris si hay una resolución a la vista
  for (const pieza of estado.molde.piezas) {
    for (const inst of pieza.instancias) {
      const frag = resolver(inst.ref, inst.huella);
      for (const b of frag.bordes) trazo(tramoDeBorde(frag, b, inst.transformacion), contornos ? "original" : `borde ${b.tipo}`);
    }
  }
  for (const c of contornos ?? []) for (const t of c) trazo(t.tramo, t.modificado ? "borde cambia" : `borde ${t.borde.tipo}`);
  for (const q of marcas) {
    const c = document.createElementNS(SVG, "circle");
    Object.entries({ cx: q[0], cy: -q[1], r: 4, class: "extremo" }).forEach(([k, v]) => c.setAttribute(k, String(v)));
    svg.append(c);
  }
  svg.setAttribute("viewBox", "-30 -720 330 620");
  $("lienzo").replaceChildren(svg);
}

// ---------------------------------------------------------------- panel

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...hijos: (Node | string)[]) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...hijos);
  return e;
}
const medida = (nombre: string, valor: string) => el("div", { className: "medida" }, nombre, el("strong", {}, valor));
const boton = (texto: string, accion: () => void, primario = false, deshabilitado = false) =>
  el("button", { textContent: texto, onclick: accion, className: primario ? "primario" : "", disabled: deshabilitado });

async function mostrar() {
  $("nombre-molde").textContent = estado.molde.nombre;
  const [entre] = fusionesEntreTelas(estado.molde);
  if (entre) return mostrarFusionEntreTelas(entre.pieza, entre.telaA, entre.telaB);
  if (estado.molde.costuras?.length) return mostrarCostura(estado.molde.costuras[0].id);
  return mostrarFusion(estado.molde.piezas[0].id);
}

/** Una fusión que cruza telas no se resuelve: se propone coserla. */
async function mostrarFusionEntreTelas(piezaId: string, telaA: string, telaB: string) {
  const [u] = analizarFusiones(estado.molde, resolver);
  estado.propuesta ??= await proponerCostura(estado.molde, resolver, piezaId, MARGEN_POR_DEFECTO, hoy());
  const p = estado.propuesta;
  $("aviso").replaceChildren(
    el("p", { className: "titulo-aviso" }, "Esta fusión une dos telas distintas"),
    medida(`${u.fusion.a} · ${descripcionTela(telaA)}`, cm(u.largoA)),
    medida(`${u.fusion.b} · ${descripcionTela(telaB)}`, cm(u.largoB)),
    el("p", { className: "estado" }, "Dos telas distintas no se fusionan: se cosen. La fusión no se resuelve hasta convertirla en costura."),
  );
  $("opciones").replaceChildren(
    el("h3", {}, "Propuesta: convertir en costura"),
    el("ul", { className: "cambios" }, ...p.cambios.map((c) => el("li", {}, c))),
    el("div", { className: "acciones" }, boton("Convertir en costura", () => {
      estado.fragmentos.push(...p.fragmentos);
      estado.molde = p.molde;
      estado.propuesta = null;
      mostrar();
    }, true)),
  );
  dibujar(null, [u.tramoA.p1, u.tramoB.p0]);
}

async function mostrarCostura(costuraId: string) {
  const an = analizarCosturas(estado.molde, resolver).find((x) => x.costura.id === costuraId)!;
  const c = an.costura;
  const resuelta = c.resolucion && c.resolucion.modo !== "ninguna" ? c.resolucion : null;
  const embebidoDeclarado = (c.embebido_mm ?? 0) !== 0;
  const sobra = an.sobra === "a" ? c.a.bordes[0] : c.b.bordes[0];

  const aviso = [
    el("p", { className: "titulo-aviso" }, an.dentroDeTolerancia ? `Costura ${c.id}: dentro de tolerancia` : `Costura ${c.id}: los dos lados no miden lo mismo`),
    medida(`${c.a.bordes[0]} · ${c.a.pieza}`, cm(an.largoA)),
    medida(`${c.b.bordes[0]} · ${c.b.pieza}`, cm(an.largoB)),
  ];
  if (embebidoDeclarado) aviso.push(medida("embebido declarado", cm(Math.abs(an.embebido))));
  if (!an.dentroDeTolerancia) aviso.push(el("p", { className: "sobra" }, `Sobran ${cm(Math.abs(an.desvio))} en ${sobra}`));
  aviso.push(el("p", { className: "estado" }, resuelta
    ? `Resolución aplicada: ${nombre(resuelta.modo as ModoCostura, c.a.bordes[0], c.b.bordes[0])}, aceptada el ${resuelta.aceptada}.`
    : embebidoDeclarado ? "La diferencia está declarada como embebido: es buscada."
    : "Sin resolver. Elegí una opción para verla; nada cambia hasta que la apliques."));
  $("aviso").replaceChildren(...aviso);

  const opciones = opcionesDeCostura(estado.molde, resolver, costuraId, estado.zona);
  const lista = el("div", { className: "lista-opciones" });
  for (const op of opciones) {
    const elegida = estado.vista === op.modo;
    const vigente = resuelta?.modo === op.modo || (op.modo === "embebido" && embebidoDeclarado);
    const t = el("button", {
      className: `opcion${elegida ? " elegida" : ""}${op.disponible ? "" : " no-disponible"}`,
      onclick: () => { estado.vista = elegida ? null : op.modo; mostrar(); },
    }, el("strong", {}, nombre(op.modo, c.a.bordes[0], c.b.bordes[0]) + (vigente ? " · aplicada" : "")));
    if (op.modo === "embebido") t.append(el("span", { className: "cambio" }, `la diferencia de ${cm(Math.abs(an.desvio))} se embebe al coser; no cambia ningún borde`));
    if (!op.disponible) t.append(el("span", { className: "motivo" }, `No disponible: ${op.motivo}`));
    for (const x of op.cambios) t.append(el("span", { className: "cambio" }, `${x.origen} ${x.etiqueta}: ${x.descripcion} · ${cm(x.antes)} → ${cm(x.despues)}`));
    if (op.modo === "transicion") t.append(campoZona());
    lista.append(t);
  }
  const acciones = el("div", { className: "acciones" });
  if (estado.vista) {
    const op = opciones.find((o) => o.modo === estado.vista)!;
    acciones.append(
      boton(`Aplicar: ${nombre(op.modo, c.a.bordes[0], c.b.bordes[0])}`, () => {
        estado.molde = aplicarResolucionDeCostura(estado.molde, resolver, costuraId, op.modo, hoy(), estado.zona);
        estado.vista = null;
        mostrar();
      }, true, !op.disponible),
      boton("Cancelar", () => { estado.vista = null; mostrar(); }),
    );
  } else if (resuelta || embebidoDeclarado) {
    acciones.append(boton("Quitar la resolución", () => {
      estado.molde = aplicarResolucionDeCostura(estado.molde, resolver, costuraId, "ninguna", hoy());
      mostrar();
    }));
  }
  $("opciones").replaceChildren(el("h3", {}, resuelta || embebidoDeclarado ? "Cambiar la resolución" : "Opciones"), lista, acciones);

  const vista = estado.vista ? opciones.find((o) => o.modo === estado.vista)! : null;
  if (vista && vista.modo !== "embebido") dibujar(Object.values(vista.contornos));
  else if (resuelta) dibujar(Object.values(contornosResueltosDeCostura(estado.molde, resolver, costuraId)));
  else dibujar(null);
}

/** Fusión entre fragmentos de la misma tela: tres opciones. */
async function mostrarFusion(piezaId: string) {
  const fusion = estado.molde.piezas.find((p) => p.id === piezaId)!.fusiones![0];
  const [u] = analizarFusiones(estado.molde, resolver);
  const resuelta = fusion.resolucion.modo !== "ninguna";
  $("aviso").replaceChildren(
    el("p", { className: "titulo-aviso" }, "Los bordes de unión no miden lo mismo"),
    medida(fusion.a, cm(u.largoA)), medida(fusion.b, cm(u.largoB)),
    el("p", { className: "sobra" }, `Sobran ${cm(Math.abs(u.diferencia))} en ${u.sobra === "a" ? fusion.a : fusion.b}`),
  );
  const opciones = opcionesDeResolucion(estado.molde, resolver, piezaId, estado.zona);
  const lista = el("div", { className: "lista-opciones" });
  for (const op of opciones) {
    const t = el("button", {
      className: `opcion${estado.vista === op.modo ? " elegida" : ""}${op.disponible ? "" : " no-disponible"}`,
      onclick: () => { estado.vista = estado.vista === op.modo ? null : op.modo; mostrar(); },
    }, el("strong", {}, nombre(op.modo, fusion.a, fusion.b)));
    if (!op.disponible) t.append(el("span", { className: "motivo" }, `No disponible: ${op.motivo}`));
    for (const x of op.cambios) t.append(el("span", { className: "cambio" }, `${x.origen} ${x.etiqueta}: ${x.descripcion}`));
    lista.append(t);
  }
  const acciones = el("div", { className: "acciones" });
  const vista = opciones.find((o) => o.modo === estado.vista);
  if (vista) acciones.append(boton(`Aplicar: ${nombre(vista.modo, fusion.a, fusion.b)}`, () => {
    estado.molde = aplicarResolucion(estado.molde, piezaId, vista.modo, hoy(), estado.zona);
    estado.vista = null;
    mostrar();
  }, true, !vista.disponible));
  $("opciones").replaceChildren(el("h3", {}, "Opciones"), lista, acciones);
  dibujar(vista ? [vista.contorno] : resuelta ? [contornoResuelto(estado.molde, resolver, piezaId)] : null);
}

function nombre(modo: ModoCostura, a: string, b: string) {
  return modo === "embebido" ? "Declarar embebido" : modo === "manda_a" ? `Manda ${a}` : modo === "manda_b" ? `Manda ${b}` : "Transición suave";
}

function campoZona() {
  const zona = document.createElement("input");
  Object.assign(zona, { type: "number", min: "10", max: "200", step: "5", value: String(estado.zona) });
  zona.onclick = (e) => e.stopPropagation();
  zona.onchange = () => { estado.zona = Math.max(10, Number(zona.value) || 60); estado.vista = "transicion"; mostrar(); };
  return el("label", { className: "zona" }, "Zona de transición (mm) ", zona);
}

mostrar();
