// Ventana de uniones. Muestra la diferencia entre los bordes que se unen y ofrece cómo
// resolverla. Si una fusión cruza telas distintas no la deja resolver: propone convertirla
// en costura. Nada cambia hasta que se toca "Aplicar" o "Convertir".

import {
  abrirProyecto, analizarCosturas, analizarFusiones, aplicarResolucion, aplicarResolucionDeCostura, cm,
  contornoResuelto, contornosResueltosDeCostura, fusionesEntreTelas, guardarProyecto, opcionesDeCostura,
  opcionesDeResolucion, proponerCostura, proyectoNuevo, proyectoVacio, guardarFragmento, tramoDeBorde,
  type Almacen, type Fragmento, type Molde, type ModoCostura, type Proyecto, type PropuestaDeCostura,
  type Tramo, type TramoDePieza,
} from "../nucleo";
import { alCerrar, confirmar, elegirCarpeta } from "./almacen";
import { abrirImportador } from "./importador";
import demo from "../esquemas/ejemplos/demo/mol-demo0telas.json";
import canesu from "../esquemas/ejemplos/frg-oxf9k3b2.json";
import inferior from "../esquemas/ejemplos/frg-cua4m8d1.json";

const MARGEN_POR_DEFECTO = 10; // mm, el del proyecto

const estado = {
  molde: demo as unknown as Molde | null,
  fragmentos: [canesu, inferior] as unknown as Fragmento[],
  /** Opción que se está mirando, todavía sin aplicar. */
  vista: null as ModoCostura | null,
  zona: 60,
  propuesta: null as PropuestaDeCostura | null,
  /** Carpeta del proyecto, si ya tiene una. Con carpeta, cada cambio se guarda solo. */
  almacen: null as Almacen | null,
  proyecto: null as Proyecto | null,
  sinGuardar: false,
  guardadoA: null as string | null,
  error: null as string | null,
  /** Con el importador abierto, la pantalla es de él. */
  importando: false,
  /** Fragmento suelto que se está mirando. */
  fragmentoVisto: null as Fragmento | null,
};

// ---------------------------------------------------------------- archivo

/** Todo cambio de diseño pasa por acá: queda en el molde y, si hay carpeta, se guarda. */
async function cambiar(molde: Molde, fragmentosNuevos: Fragmento[] = []) {
  estado.molde = molde;
  estado.fragmentos.push(...fragmentosNuevos.filter((f) => !estado.fragmentos.some((g) => g.id === f.id && g.version === f.version)));
  estado.sinGuardar = true;
  estado.vista = null;
  if (estado.almacen) await guardar();
  else mostrar();
}

async function guardar() {
  if (!estado.almacen || !estado.molde) return;
  try {
    const proyecto = estado.proyecto ?? proyectoNuevo(estado.molde, hoy());
    const g = await guardarProyecto(estado.almacen, proyecto, estado.molde, estado.fragmentos, hoy());
    estado.proyecto = g.proyecto;
    estado.molde = g.molde;
    estado.sinGuardar = false;
    estado.error = null;
    estado.guardadoA = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  } catch (e) {
    estado.error = `No se pudo guardar: ${(e as Error).message}`;
  }
  mostrar();
}

async function guardarComo() {
  try {
    const almacen = await elegirCarpeta("guardar");
    if (!almacen) return;
    if ((await almacen.leer("proyecto.json")) !== null) {
      estado.error = `${almacen.nombre} ya tiene un proyecto. Elegí una carpeta vacía, o abrí ese proyecto.`;
      return mostrar();
    }
    estado.almacen = almacen;
    estado.proyecto = null;
    await guardar();
  } catch (e) {
    estado.error = (e as Error).message;
    mostrar();
  }
}

async function abrir() {
  if (estado.sinGuardar && !(await confirmar("Hay cambios sin guardar. Si abrís otro proyecto se pierden.", "Abrir igual", "Volver"))) return;
  try {
    const almacen = await elegirCarpeta("abrir");
    if (!almacen) return;
    const a = await abrirProyecto(almacen);
    Object.assign(estado, {
      almacen, proyecto: a.proyecto, molde: a.molde, fragmentos: a.fragmentos,
      vista: null, propuesta: null, sinGuardar: false, error: null, guardadoA: null,
    });
  } catch (e) {
    estado.error = `No se pudo abrir: ${(e as Error).message}`;
  }
  mostrar();
}

/** Carpeta para guardar lo importado: la del proyecto abierto o una nueva. */
async function destinoDeImportacion() {
  if (estado.almacen && estado.proyecto) return { almacen: estado.almacen, proyecto: estado.proyecto };
  if (estado.sinGuardar && !(await confirmar("Hay cambios sin guardar en el ejemplo. Si seguís se pierden.", "Seguir", "Volver"))) return null;
  const almacen = await elegirCarpeta("guardar");
  if (!almacen) return null;
  if ((await almacen.leer("proyecto.json")) !== null) {
    const a = await abrirProyecto(almacen);
    Object.assign(estado, { almacen, proyecto: a.proyecto, molde: a.molde, fragmentos: a.fragmentos, sinGuardar: false });
  } else {
    const nombre = almacen.nombre.split(/[\/]/).pop() || "Proyecto";
    const id = "prj-" + Array.from({ length: 8 }, () => "0123456789abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 36)]).join("");
    Object.assign(estado, { almacen, proyecto: proyectoVacio(nombre, id, hoy()), molde: null, fragmentos: [], sinGuardar: false });
  }
  return { almacen: estado.almacen!, proyecto: estado.proyecto! };
}

function importar(archivo: File) {
  estado.importando = true;
  estado.vista = null;
  abrirImportador(archivo, {
    destino: destinoDeImportacion,
    alGuardar: async (almacen, proyecto, fragmento) => {
      const p = await guardarFragmento(almacen, proyecto, fragmento);
      estado.proyecto = p;
      if (!estado.fragmentos.some((f) => f.id === fragmento.id && f.version === fragmento.version)) estado.fragmentos.push(fragmento);
      estado.guardadoA = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
      mostrarArchivo();
      return p;
    },
    alSalir: () => {
      estado.importando = false;
      mostrar();
    },
  }).catch((e) => {
    estado.importando = false;
    estado.error = `No se pudo abrir la foto: ${(e as Error).message}`;
    mostrar();
  });
}

function mostrarArchivo() {
  const s = $("estado-archivo");
  s.className = estado.error ? "error" : estado.sinGuardar ? "sin-guardar" : "";
  s.textContent = estado.error
    ?? (!estado.almacen ? (estado.sinGuardar ? "Sin guardar: usá «Guardar como…» para no perder los cambios" : "Ejemplo sin carpeta")
      : estado.sinGuardar ? "Guardando…"
      : `Guardado${estado.guardadoA ? ` a las ${estado.guardadoA}` : ""} en ${estado.almacen.nombre}`);
}

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
const descripcionTela = (id: string) => estado.molde!.telas.find((t) => t.id === id)?.descripcion ?? id;

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
  for (const pieza of estado.molde?.piezas ?? []) {
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
  if (estado.fragmentoVisto) {
    const f = estado.fragmentoVisto;
    for (const b of f.bordes) trazo(tramoDeBorde(f, b), `borde ${b.tipo}`);
  }
  // la vista se ajusta a lo dibujado: cada molde tiene su tamaño
  const caja = (svg as SVGSVGElement);
  $("lienzo").replaceChildren(svg);
  if (svg.childElementCount) {
    const b = caja.getBBox();
    const aire = Math.max(b.width, b.height) * 0.06;
    svg.setAttribute("viewBox", `${b.x - aire} ${b.y - aire} ${b.width + 2 * aire} ${b.height + 2 * aire}`);
  }
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
  if (estado.importando) return;
  mostrarArchivo();
  const m = estado.molde;
  $("nombre-molde").textContent = m?.nombre ?? estado.proyecto?.nombre ?? "";
  if (!m) return sinUniones("Este punto del proyecto todavía no tiene molde.");
  const [entre] = fusionesEntreTelas(m);
  estado.fragmentoVisto = null; // solo se mira un fragmento suelto cuando no hay uniones que mostrar
  if (entre) return mostrarFusionEntreTelas(entre.pieza, entre.telaA, entre.telaB);
  if (m.costuras?.length) return mostrarCostura(m.costuras[0].id);
  const conFusion = m.piezas.find((p) => p.fusiones?.length);
  if (conFusion) return mostrarFusion(conFusion.id);
  return sinUniones("Este molde no tiene uniones ni costuras para resolver.");
}

function sinUniones(texto: string) {
  $("aviso").replaceChildren(el("p", { className: "estado" }, texto));
  const sueltos = estado.fragmentos.filter((f) => estado.proyecto?.fragmentos?.includes(`${f.id}@${f.version}`));
  estado.fragmentoVisto = sueltos.find((f) => f.id === estado.fragmentoVisto?.id) ?? sueltos[0] ?? null;
  $("opciones").replaceChildren(...(sueltos.length ? [
    el("h3", {}, `Fragmentos del proyecto (${sueltos.length})`),
    ...sueltos.map((f) => el("button", {
      className: "fragmento-fila", textContent: `${f.nombre} · ${f.bordes.length} bordes`,
      onclick: () => { estado.fragmentoVisto = f; mostrar(); },
    })),
  ] : []));
  dibujar(null);
}

/** Una fusión que cruza telas no se resuelve: se propone coserla. */
async function mostrarFusionEntreTelas(piezaId: string, telaA: string, telaB: string) {
  const molde = estado.molde!;
  const [u] = analizarFusiones(molde, resolver);
  estado.propuesta ??= await proponerCostura(molde, resolver, piezaId, MARGEN_POR_DEFECTO, hoy());
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
      estado.propuesta = null;
      cambiar(p.molde, p.fragmentos);
    }, true)),
  );
  dibujar(null, [u.tramoA.p1, u.tramoB.p0]);
}

async function mostrarCostura(costuraId: string) {
  const molde = estado.molde!;
  const an = analizarCosturas(molde, resolver).find((x) => x.costura.id === costuraId)!;
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

  const opciones = opcionesDeCostura(molde, resolver, costuraId, estado.zona);
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
        cambiar(aplicarResolucionDeCostura(molde, resolver, costuraId, op.modo, hoy(), estado.zona));
      }, true, !op.disponible),
      boton("Cancelar", () => { estado.vista = null; mostrar(); }),
    );
  } else if (resuelta || embebidoDeclarado) {
    acciones.append(boton("Quitar la resolución", () => {
      cambiar(aplicarResolucionDeCostura(molde, resolver, costuraId, "ninguna", hoy()));
    }));
  }
  $("opciones").replaceChildren(el("h3", {}, resuelta || embebidoDeclarado ? "Cambiar la resolución" : "Opciones"), lista, acciones);

  const vista = estado.vista ? opciones.find((o) => o.modo === estado.vista)! : null;
  if (vista && vista.modo !== "embebido") dibujar(Object.values(vista.contornos));
  else if (resuelta) dibujar(Object.values(contornosResueltosDeCostura(molde, resolver, costuraId)));
  else dibujar(null);
}

/** Fusión entre fragmentos de la misma tela: tres opciones. */
async function mostrarFusion(piezaId: string) {
  const molde = estado.molde!;
  const fusion = molde.piezas.find((p) => p.id === piezaId)!.fusiones![0];
  const [u] = analizarFusiones(molde, resolver);
  const resuelta = fusion.resolucion.modo !== "ninguna";
  $("aviso").replaceChildren(
    el("p", { className: "titulo-aviso" }, "Los bordes de unión no miden lo mismo"),
    medida(fusion.a, cm(u.largoA)), medida(fusion.b, cm(u.largoB)),
    el("p", { className: "sobra" }, `Sobran ${cm(Math.abs(u.diferencia))} en ${u.sobra === "a" ? fusion.a : fusion.b}`),
  );
  const opciones = opcionesDeResolucion(molde, resolver, piezaId, estado.zona);
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
    cambiar(aplicarResolucion(molde, piezaId, vista.modo, hoy(), estado.zona));
  }, true, !vista.disponible));
  $("opciones").replaceChildren(el("h3", {}, "Opciones"), lista, acciones);
  dibujar(vista ? [vista.contorno] : resuelta ? [contornoResuelto(molde, resolver, piezaId)] : null);
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

$("importar").onclick = () => $("foto-entrada").click();
$("foto-entrada").onchange = (e) => {
  const entrada = e.target as HTMLInputElement;
  if (entrada.files?.[0]) importar(entrada.files[0]);
  entrada.value = "";
};
$("abrir").onclick = () => abrir();
$("guardar-como").onclick = () => guardarComo();
alCerrar(() => estado.sinGuardar);
mostrar();
