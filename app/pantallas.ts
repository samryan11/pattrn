// Las pantallas de PATTRN: de la idea al molde descargado.
//
//   Idea → Contame más → Molde → Descargas, y Mi espacio.
//
// La ventana de uniones y el importador de fotos siguen estando: son el «taller», al que
// se entra desde Mi espacio. Acá no se calcula nada: todo lo que mide o exporta es del núcleo.

import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/700.css";
import "./pantallas.css";
import {
  abrirProyecto, aplanar, archivosDelPaquete, armarPaquete, bytesDeTexto, enTalle, guardarProyecto, lineaDeCorte,
  moldeDeBase, tramoDeBorde, type Fragmento, type PedidoDePaquete, type Proyecto, type Punto,
} from "../nucleo";
import { abrirCarpeta, elegirCarpeta, enAplicacion, guardarArchivo, type AlmacenConBytes } from "./almacen";
import { baseDe, bases, cantidadDeFragmentos, etiquetaDeTalle, licencias, NOMBRE_GRUPO, TALLE_BASE, talles, tallesSugeridos, type Base } from "./patternpedia";
import { anotarDescarga, anotarReciente, guardarPerfil, leerDescargas, leerPerfil, leerRecientes, MEDIDAS } from "./perfil";

type Pantalla = "idea" | "contame" | "molde" | "descargas" | "espacio";
type Modo = "imagen" | "boceto" | "texto";
interface Adjunto { nombre: string; tipo: string; bytes: Uint8Array; url: string }

interface Contexto {
  para_quien: "para_mi" | "otra_persona" | "talle_estandar";
  tipo_prenda: string;
  donantes: string;
  forro: { lleva: boolean; tela: "reusada" | "nueva" | "no_se" };
  experiencia: "primera_prenda" | "algunas" | "seguido";
  maquina: "recta" | "recta_y_overlock" | "a_mano";
}

const sesionNueva = () => ({
  pantalla: "idea" as Pantalla,
  nombre: "",
  modo: "imagen" as Modo,
  tipoImagen: "imagen_ia" as "imagen_ia" | "foto_prenda",
  texto: "",
  adjuntos: { imagen: null, boceto: null, look: null } as Record<"imagen" | "boceto" | "look", Adjunto | null>,
  contexto: {
    para_quien: "para_mi", tipo_prenda: "", donantes: "", forro: { lleva: false, tela: "no_se" },
    experiencia: "primera_prenda", maquina: "recta",
  } as Contexto,
  base: null as string | null,
  talle: TALLE_BASE,
  formatos: { pdf: true, dxf: true, hoja: true },
  almacen: null as AlmacenConBytes | null,
  proyectoId: "",
  moldeId: "",
  aviso: null as { texto: string; error?: boolean } | null,
  ocupado: false,
});

let s = sesionNueva();
const perfil = leerPerfil();

// ---------------------------------------------------------------- utilidades

const SVG = "http://www.w3.org/2000/svg";
type Hijo = Node | string | null | false | undefined;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...hijos: Hijo[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith("aria-") || k === "role" || k === "for") e.setAttribute(k, String(v));
    else (e as unknown as Record<string, unknown>)[k] = v;
  }
  e.append(...hijos.filter((h): h is Node | string => h !== null && h !== false && h !== undefined));
  return e;
}

const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const idAleatorio = (prefijo: string) =>
  prefijo + Array.from({ length: 8 }, () => "0123456789abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 36)]).join("");
const nombreDelProyecto = () => s.nombre.trim() || (baseDe(s.base)?.nombre ?? "Mi proyecto");
const autor = () => perfil.nombre.trim() || "PATTRN";

function ir(pantalla: Pantalla) {
  s.pantalla = pantalla;
  s.aviso = null;
  pintar();
  window.scrollTo({ top: 0 });
}

function avisar(texto: string, error = false) {
  s.aviso = { texto, error };
  pintar();
}

const boton = (texto: string, accion: () => void, clase = "secundario", deshabilitado = false) =>
  el("button", { type: "button", className: `boton ${clase}`, onclick: accion, disabled: deshabilitado }, texto);

function campo(etiqueta: string, control: HTMLElement, ayuda?: string) {
  const id = control.id || (control.id = "c" + Math.random().toString(36).slice(2, 9));
  return el("div", { className: "campo-pt" }, el("label", { for: id }, etiqueta), control, ayuda ? el("span", { className: "ayuda" }, ayuda) : null);
}

function selector<T extends string>(valor: T, opciones: [T, string][], alCambiar: (v: T) => void) {
  return el("select", { onchange: (e: Event) => alCambiar((e.target as HTMLSelectElement).value as T) },
    ...opciones.map(([v, t]) => el("option", { value: v, selected: v === valor }, t)));
}

// ---------------------------------------------------------------- dibujo de piezas

const COLOR_BORDE: Record<string, string> = { costura: "#1f5fbf", dobladillo: "#0d8089", doblez: "#7b3fa0", union: "#b85f00", terminado: "#1a8a4a" };

/** Las piezas una al lado de la otra, con su línea de corte, sus bordes por tipo y el hilo. */
function dibujoDePiezas(piezas: { nombre: string; fragmento: Fragmento }[], conNombres: boolean, descripcion: string): SVGSVGElement {
  const svg = document.createElementNS(SVG, "svg") as SVGSVGElement;
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", descripcion);
  const nuevo = (tag: string, attrs: Record<string, string | number>) => {
    const n = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    svg.append(n);
    return n;
  };
  let x = 0, alto = 0;
  const colocadas = piezas.map((pz) => {
    const corte = lineaDeCorte(pz.fragmento).flatMap((t) => t.puntos);
    const minX = Math.min(...corte.map((q) => q[0])), maxX = Math.max(...corte.map((q) => q[0]));
    const minY = Math.min(...corte.map((q) => q[1])), maxY = Math.max(...corte.map((q) => q[1]));
    const c = { pz, corte, dx: x - minX, minY, ancho: maxX - minX, alto: maxY - minY };
    x += maxX - minX + 60;
    alto = Math.max(alto, maxY - minY);
    return c;
  });
  const total = x - 60, pie = conNombres ? 70 : 0;
  for (const c of colocadas) {
    // el SVG tiene y hacia abajo; las piezas se apoyan todas en la misma base
    const P = (q: Punto) => `${(q[0] + c.dx).toFixed(1)},${(alto - (q[1] - c.minY)).toFixed(1)}`;
    nuevo("polygon", { points: c.corte.map(P).join(" "), fill: "#fffdf8", stroke: "#8a8478", "stroke-width": 1.2, "vector-effect": "non-scaling-stroke" });
    for (const b of c.pz.fragmento.bordes) {
      nuevo("polyline", {
        points: aplanar(tramoDeBorde(c.pz.fragmento, b)).map(P).join(" "), fill: "none", stroke: COLOR_BORDE[b.tipo],
        "stroke-width": b.tipo === "terminado" ? 4 : 2.2, "vector-effect": "non-scaling-stroke",
        ...(b.tipo === "doblez" ? { "stroke-dasharray": "10 5" } : {}),
      });
    }
    const h = c.pz.fragmento.hilo, a = (h.angulo_grados * Math.PI) / 180, L = Math.min(c.alto, c.ancho) * 0.22;
    const h0: Punto = [h.punto[0] - Math.cos(a) * L, h.punto[1] - Math.sin(a) * L], h1: Punto = [h.punto[0] + Math.cos(a) * L, h.punto[1] + Math.sin(a) * L];
    nuevo("polyline", { points: `${P(h0)} ${P(h1)}`, fill: "none", stroke: "#5f5a50", "stroke-width": 1.4, "stroke-dasharray": "6 5", "vector-effect": "non-scaling-stroke" });
    if (conNombres) {
      const t = nuevo("text", { x: c.dx + Math.min(...c.corte.map((q) => q[0])) + c.ancho / 2, y: alto + 48, "text-anchor": "middle", "font-size": 30, fill: "#201d18" });
      t.textContent = c.pz.nombre;
    }
  }
  svg.setAttribute("viewBox", `-15 -15 ${total + 30} ${alto + pie + 30}`);
  return svg;
}

// ---------------------------------------------------------------- archivos de la persona

function elegirImagen(destino: "imagen" | "boceto" | "look") {
  const entrada = el("input", { type: "file", accept: "image/jpeg,image/png,image/webp" });
  entrada.onchange = async () => {
    const archivo = entrada.files?.[0];
    if (!archivo) return;
    if (s.adjuntos[destino]) URL.revokeObjectURL(s.adjuntos[destino]!.url);
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    s.adjuntos[destino] = { nombre: archivo.name, tipo: archivo.type, bytes, url: URL.createObjectURL(archivo) };
    s.aviso = null;
    pintar();
  };
  entrada.click();
}

function zonaDeImagen(destino: "imagen" | "boceto" | "look", ayuda: string, textoBoton: string) {
  const a = s.adjuntos[destino];
  if (a) {
    return el("div", { className: "vista-imagen" },
      el("img", { src: a.url, alt: `Vista de ${a.nombre}` }),
      el("div", { className: "fila" },
        el("span", { className: "ayuda" }, a.nombre),
        boton("Cambiar", () => elegirImagen(destino)),
        boton("Quitar", () => { URL.revokeObjectURL(a.url); s.adjuntos[destino] = null; pintar(); })));
  }
  return el("div", { className: "zona-subida" }, el("span", {}, ayuda), boton(textoBoton, () => elegirImagen(destino)));
}

// ---------------------------------------------------------------- proyecto: guardar y abrir

function proyectoDeLaSesion(fecha: string) {
  const referencias: Record<string, unknown>[] = [];
  const archivos: { ruta: string; bytes: Uint8Array }[] = [];
  const sumar = (a: Adjunto | null, tipo: string, nota?: string) => {
    if (!a) return null;
    const id = `ref${referencias.length + 1}`;
    const ruta = `referencias/${id}-${a.nombre.replace(/[^\w.-]+/g, "_")}`;
    referencias.push({ id, archivo: ruta, tipo, origen: { metodo: "subida" }, ...(nota ? { nota } : {}) });
    archivos.push({ ruta, bytes: a.bytes });
    return id;
  };
  let modo = "lienzo", activa: string | null = null;
  if (s.modo === "imagen" && s.adjuntos.imagen) { modo = s.tipoImagen === "foto_prenda" ? "foto_prenda" : "imagen_ia_externa"; activa = sumar(s.adjuntos.imagen, s.tipoImagen); }
  else if (s.modo === "boceto" && s.adjuntos.boceto) { modo = "boceto_a_mano"; activa = sumar(s.adjuntos.boceto, "boceto"); }
  else if (s.texto.trim()) modo = "idea_en_texto";
  sumar(s.adjuntos.look, "otra", "look de referencia");
  const c = s.contexto;
  const proyecto: Proyecto = {
    pattrn: "0.1", tipo: "proyecto", id: s.proyectoId, nombre: nombreDelProyecto(), licencia: "CC-BY-SA-4.0",
    autoria: { autor: autor(), fecha_creacion: fecha },
    entrada: { modo, ...(s.texto.trim() ? { texto: s.texto.trim() } : {}) },
    referencias, ...(activa ? { referencia_activa: activa } : {}),
    contexto: {
      para_quien: c.para_quien, ...(c.tipo_prenda.trim() ? { tipo_prenda: c.tipo_prenda.trim() } : {}),
      ...(c.donantes.trim() ? { donantes: c.donantes.trim() } : {}),
      forro: c.forro.lleva ? { lleva: true, tela: c.forro.tela } : { lleva: false },
      experiencia: c.experiencia, maquina: c.maquina,
    },
    arbol: { registrar_ramas: true, actual: "n1", nodos: [{ id: "n1", padre: null, creado: fecha, molde: null, hoja: {} }] },
  };
  return { proyecto, archivos };
}

async function guardar() {
  try {
    if (!s.almacen) {
      const almacen = await elegirCarpeta("guardar");
      if (!almacen) return;
      const existente = await almacen.leer("proyecto.json");
      if (existente !== null) return avisar(`La carpeta «${almacen.nombre}» ya tiene un proyecto. Elegí una carpeta vacía, o abrilo desde Mi espacio.`, true);
      s.almacen = almacen;
      s.proyectoId = idAleatorio("prj-");
      s.moldeId = idAleatorio("mol-");
    }
    const fecha = hoy();
    const { proyecto, archivos } = proyectoDeLaSesion(fecha);
    for (const a of archivos) await s.almacen.escribirBytes(a.ruta, a.bytes);
    const base = baseDe(s.base);
    if (base) {
      const molde = moldeDeBase(s.moldeId, nombreDelProyecto(), s.talle, autor(), fecha,
        base.piezas.map((p) => ({ id: p.id, nombre: p.nombre, fragmento: p.fragmento, cantidad: p.cantidad })));
      await guardarProyecto(s.almacen, proyecto, molde, base.piezas.map((p) => p.fragmento), fecha);
    } else {
      await s.almacen.escribir("proyecto.json", JSON.stringify(proyecto, null, 2) + "\n");
    }
    anotarReciente({ nombre: proyecto.nombre, carpeta: s.almacen.nombre, ruta: s.almacen.ruta ?? null, base: s.base, fecha });
    avisar(`Proyecto guardado en «${s.almacen.nombre}».`);
  } catch (e) {
    avisar(`No se pudo guardar: ${(e as Error).message}`, true);
  }
}

async function abrir(almacen: AlmacenConBytes | null) {
  try {
    if (!almacen) return;
    const a = await abrirProyecto(almacen);
    const p = a.proyecto as Proyecto & {
      entrada: { modo: string; texto?: string }; contexto?: Partial<Contexto> & { forro?: { lleva: boolean; tela?: Contexto["forro"]["tela"] } };
      referencias?: { archivo: string; tipo: string; nota?: string }[];
    };
    const nueva = sesionNueva();
    nueva.almacen = almacen;
    nueva.proyectoId = p.id;
    nueva.nombre = p.nombre;
    nueva.texto = p.entrada.texto ?? "";
    nueva.modo = p.entrada.modo === "boceto_a_mano" ? "boceto" : p.entrada.modo === "idea_en_texto" ? "texto" : "imagen";
    if (p.entrada.modo === "foto_prenda") nueva.tipoImagen = "foto_prenda";
    if (p.contexto) {
      const c = p.contexto;
      Object.assign(nueva.contexto, {
        para_quien: c.para_quien ?? nueva.contexto.para_quien, tipo_prenda: c.tipo_prenda ?? "", donantes: c.donantes ?? "",
        experiencia: c.experiencia ?? nueva.contexto.experiencia, maquina: c.maquina ?? nueva.contexto.maquina,
        forro: { lleva: c.forro?.lleva ?? false, tela: c.forro?.tela ?? "no_se" },
      });
    }
    for (const r of p.referencias ?? []) {
      const bytes = await almacen.leerBytes(r.archivo);
      if (!bytes) continue;
      const destino = r.nota === "look de referencia" ? "look" : r.tipo === "boceto" ? "boceto" : "imagen";
      const tipo = /\.png$/i.test(r.archivo) ? "image/png" : /\.webp$/i.test(r.archivo) ? "image/webp" : "image/jpeg";
      nueva.adjuntos[destino] = {
        nombre: r.archivo.split("/").pop()!.replace(/^ref\d+-/, ""), tipo, bytes,
        url: URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: tipo })),
      };
    }
    if (a.molde) {
      nueva.moldeId = a.molde.id;
      const ref = a.molde.piezas[0]?.instancias[0]?.ref;
      const frag = a.fragmentos.find((f) => `${f.id}@${f.version}` === ref);
      const diseno = (frag?.origen as { fuente?: { id?: string } } | undefined)?.fuente?.id?.split("/")[0] ?? null;
      nueva.base = baseDe(diseno)?.id ?? null;
      const talle = a.molde.talle as string | undefined;
      if (talle && talles.some((t) => t.id === talle)) nueva.talle = talle;
    } else nueva.moldeId = idAleatorio("mol-");
    nueva.pantalla = nueva.base ? "molde" : "idea";
    s = nueva;
    anotarReciente({ nombre: p.nombre, carpeta: almacen.nombre, ruta: almacen.ruta ?? null, base: s.base, fecha: hoy() });
    pintar();
  } catch (e) {
    avisar(`No se pudo abrir: ${(e as Error).message}`, true);
  }
}

// ---------------------------------------------------------------- descargas

function pedido(base: Base): PedidoDePaquete {
  const c = s.contexto;
  const PARA = { para_mi: "Para mí", otra_persona: "Para otra persona", talle_estandar: "Talle estándar" };
  const notas = [
    [PARA[c.para_quien], c.tipo_prenda.trim()].filter(Boolean).join(" · "),
    c.donantes.trim() ? `Para reusar: ${c.donantes.trim()}` : "",
    c.forro.lleva ? "Lleva forro: los moldes de forro todavía no se generan; por ahora se cortan a partir de estas mismas piezas." : "",
    s.texto.trim() ? `Idea: ${s.texto.trim().slice(0, 160)}` : "",
  ].filter(Boolean);
  return {
    nombre: nombreDelProyecto(), talle: s.talle, etiquetaTalle: etiquetaDeTalle(s.talle), base: `${base.nombre} (${base.fuente})`,
    piezas: base.piezas.map((p) => ({ nombre: p.nombre, fragmento: p.fragmento, cantidad: p.cantidad, alDoblez: p.alDoblez })),
    formatos: s.formatos, notas,
    licencias: licencias.map((l) => ({ nombre: l.nombre, datos: bytesDeTexto(l.texto) })),
  };
}

async function descargar(base: Base) {
  s.ocupado = true;
  s.aviso = { texto: "Armando el paquete…" };
  pintar();
  try {
    const paquete = await armarPaquete(pedido(base));
    const donde = await guardarArchivo(paquete.nombre, paquete.zip, "application/zip");
    s.ocupado = false;
    if (!donde) return avisar("Descarga cancelada.");
    if (s.almacen) await s.almacen.escribirBytes(`exportados/${paquete.nombre}`, paquete.zip);
    anotarDescarga({ archivo: paquete.nombre, proyecto: nombreDelProyecto(), talle: etiquetaDeTalle(s.talle), fecha: hoy() });
    avisar(enAplicacion() ? `Paquete guardado en ${donde}.` : `Paquete descargado: ${paquete.nombre}.`);
  } catch (e) {
    s.ocupado = false;
    avisar(`No se pudo armar el paquete: ${(e as Error).message}`, true);
  }
}

// ---------------------------------------------------------------- pantallas

function pantallaIdea() {
  const modos: [Modo, string, string][] = [
    ["imagen", "Subir una imagen", "Foto o imagen generada con IA de la prenda que querés."],
    ["boceto", "Subir un boceto", "Un dibujo a mano, aunque sea rápido."],
    ["texto", "Escribir la idea", "Contala con tus palabras y arrancamos desde ahí."],
  ];
  const texto = el("textarea", {
    rows: 6, value: s.texto, placeholder: "Ej.: una campera corta hecha con dos camisas, mangas anchas, con forro",
    oninput: (e: Event) => { s.texto = (e.target as HTMLTextAreaElement).value; },
  });
  const principal = s.modo === "texto"
    ? el("div", { className: "panel" }, campo("Contá la idea", texto, "El texto queda guardado como punto de partida del proyecto. Podés sumar una imagen después."))
    : s.modo === "boceto"
      ? el("div", { className: "panel" }, el("h2", {}, "Tu boceto"),
        zonaDeImagen("boceto", "Dibujo a mano fotografiado o escaneado. No tiene que ser prolijo.", "Elegir boceto"))
      : el("div", { className: "panel" }, el("h2", {}, "Imagen de referencia"),
        zonaDeImagen("imagen", "Foto, imagen generada con IA o captura. JPG, PNG o WebP.", "Elegir imagen"),
        s.adjuntos.imagen ? campo("¿Qué es esta imagen?", selector(s.tipoImagen, [["imagen_ia", "Una imagen generada con IA"], ["foto_prenda", "La foto de una prenda que existe"]], (v) => { s.tipoImagen = v; })) : null);
  return el("section", { className: "pantalla" },
    el("div", { className: "portada" }, el("h1", { className: "titulo-portada" }, "Let's upcycle")),
    el("div", { className: "grilla-modos", role: "group", "aria-label": "Con qué empezás" },
      ...modos.map(([id, titulo, desc]) => el("button", {
        type: "button", className: `modo${s.modo === id ? " elegido" : ""}`, "aria-pressed": String(s.modo === id),
        onclick: () => { s.modo = id; pintar(); },
      }, el("strong", {}, titulo), el("span", {}, desc)))),
    el("div", { className: "dos-columnas" },
      el("div", { className: "ancha" }, principal),
      el("div", { className: "panel angosta" },
        el("h2", {}, "Look de referencia ", el("span", { className: "opcional" }, "(opcional)")),
        zonaDeImagen("look", "Una imagen del estilo que buscás: silueta, caída, terminaciones.", "Agregar referencia"))),
    el("div", { className: "fila" }, boton("Seguir: contame más", () => {
      const algo = s.adjuntos.imagen || s.adjuntos.boceto || s.texto.trim();
      if (!algo) return avisar("Para seguir, subí una imagen o un boceto, o escribí la idea.", true);
      ir("contame");
    }, "primario")));
}

function pantallaContame() {
  const c = s.contexto;
  const nombre = el("input", { type: "text", value: s.nombre, placeholder: "Ej.: campera de dos camisas", oninput: (e: Event) => { s.nombre = (e.target as HTMLInputElement).value; } });
  const tipo = el("input", { type: "text", value: c.tipo_prenda, placeholder: "Campera, camisa, remera, falda…", oninput: (e: Event) => { c.tipo_prenda = (e.target as HTMLInputElement).value; } });
  const donantes = el("textarea", { rows: 3, value: c.donantes, placeholder: "Ej.: dos camisas de hombre, un jean", oninput: (e: Event) => { c.donantes = (e.target as HTMLTextAreaElement).value; } });
  const lleva = el("input", { type: "checkbox", checked: c.forro.lleva, onchange: (e: Event) => { c.forro.lleva = (e.target as HTMLInputElement).checked; pintar(); } });
  return el("section", { className: "pantalla" },
    el("div", { className: "encabezado" }, el("h1", {}, "Contame más"),
      el("p", {}, "Lo que la imagen no dice. Con esto el molde sale pensado para tu cuerpo, tus telas y lo que sabés hacer.")),
    el("div", { className: "grilla-paneles" },
      el("div", { className: "panel" }, el("h2", {}, "El proyecto"),
        campo("Nombre", nombre),
        campo("Para quién es", selector(c.para_quien, [["para_mi", "Para mí (uso mis medidas)"], ["otra_persona", "Para otra persona"], ["talle_estandar", "Talle estándar"]], (v) => { c.para_quien = v; })),
        campo("Tipo de prenda", tipo)),
      el("div", { className: "panel" }, el("h2", {}, "Qué tenés para reusar"),
        campo("Prendas donantes", donantes, "Los bordes ya terminados (ruedos, tapetas) se aprovechan tal cual.")),
      el("div", { className: "panel" }, el("h2", {}, "Forrería"),
        el("label", { className: "casilla" }, lleva, "Esta prenda lleva forro"),
        c.forro.lleva ? campo("Tela del forro", selector(c.forro.tela, [["reusada", "Reusada de otra prenda"], ["nueva", "Tela nueva"], ["no_se", "Todavía no sé"]], (v) => { c.forro.tela = v; })) : null,
        el("span", { className: "ayuda" }, "Queda anotado en el proyecto y en la hoja de pieza. Los moldes de forro todavía no se generan: es el próximo paso de PATTRN.")),
      el("div", { className: "panel" }, el("h2", {}, "Cómo vas a coser"),
        campo("Experiencia", selector(c.experiencia, [["primera_prenda", "Es mi primera prenda"], ["algunas", "Ya cosí algunas"], ["seguido", "Coso seguido"]], (v) => { c.experiencia = v; })),
        campo("Con qué", selector(c.maquina, [["recta", "Máquina recta familiar"], ["recta_y_overlock", "Recta y overlock"], ["a_mano", "A mano"]], (v) => { c.maquina = v; })))),
    el("div", { className: "fila" }, boton("Seguir: ver el molde", () => ir("molde"), "primario")));
}

function referenciaAlCostado() {
  const a = s.modo === "boceto" ? s.adjuntos.boceto ?? s.adjuntos.imagen : s.adjuntos.imagen ?? s.adjuntos.boceto;
  if (!a && !s.texto.trim()) return null;
  return el("div", { className: "panel" }, el("h2", {}, "Tu punto de partida"),
    a ? el("img", { className: "referencia", src: a.url, alt: "Imagen de referencia del proyecto" }) : null,
    s.texto.trim() ? el("p", { className: "idea" }, s.texto.trim()) : null);
}

function elegirBase() {
  return el("section", { className: "pantalla" },
    el("div", { className: "encabezado" }, el("h1", {}, "Elegí una base"),
      el("p", {}, "Son moldes libres de Patternpedia. Elegí el que más se parece a lo que querés hacer: es el punto de partida, y sale en tu talle.")),
    el("div", { className: "dos-columnas" },
      el("div", { className: "ancha grilla-bases" },
        ...bases.map((b) => el("button", { type: "button", className: "base", onclick: () => { s.base = b.id; s.aviso = null; pintar(); } },
          dibujoDePiezas(b.piezas, false, `Piezas de ${b.nombre}`),
          el("strong", {}, b.nombre), el("span", {}, b.descripcion),
          el("span", { className: "ayuda" }, `${b.piezas.length} piezas · ${b.fuente}`)))),
      el("div", { className: "angosta columna" }, referenciaAlCostado(),
        el("div", { className: "panel" }, el("h2", {}, "Por ahora elegís vos"),
          el("p", { className: "ayuda" }, "PATTRN todavía no propone la base a partir de tu imagen. Tu imagen queda a la vista para comparar.")))));
}

function pantallaMolde() {
  const base = baseDe(s.base);
  if (!base) return elegirBase();
  const caja = el("div", { className: "lienzo-piezas" }, el("p", { className: "ayuda" }, "Dibujando…"));
  Promise.all(base.piezas.map(async (p) => ({ nombre: p.nombre, fragmento: await enTalle(p.fragmento, s.talle) })))
    .then((piezas) => caja.replaceChildren(dibujoDePiezas(piezas, true, `Piezas de ${base.nombre} en talle ${etiquetaDeTalle(s.talle)}`)))
    .catch((e) => caja.replaceChildren(el("p", { className: "ayuda" }, `No se pudo dibujar: ${(e as Error).message}`)));
  const pecho = Number(perfil.medidas.pecho);
  const sugeridos = pecho > 0 ? tallesSugeridos(pecho) : [];
  const fila = (grupo: "con_busto" | "recto") => el("div", { className: "fila-talles", role: "group", "aria-label": `Talles, ${NOMBRE_GRUPO[grupo]}` },
    el("span", { className: "grupo-talle" }, NOMBRE_GRUPO[grupo]),
    ...talles.filter((t) => t.grupo === grupo).map((t) => el("button", {
      type: "button", className: `talle${s.talle === t.id ? " elegido" : ""}${sugeridos.includes(t.id) ? " sugerido" : ""}`,
      "aria-pressed": String(s.talle === t.id), title: `Pecho ${t.pecho_cm} · cintura ${t.cintura_cm} · cadera ${t.cadera_cm} cm`,
      onclick: () => { s.talle = t.id; pintar(); },
    }, String(t.pecho_cm))));
  return el("section", { className: "pantalla" },
    el("div", { className: "encabezado" }, el("h1", {}, nombreDelProyecto()),
      el("p", {}, `Base: ${base.nombre} · molde a escala real · talle ${etiquetaDeTalle(s.talle)}`)),
    el("div", { className: "panel" }, el("h2", {}, "Talle, por contorno de pecho en cm"),
      fila("con_busto"), fila("recto"),
      el("span", { className: "ayuda" }, sugeridos.length
        ? `Con tu pecho de ${pecho} cm, los más cercanos están marcados con un punto.`
        : "Cargá tu contorno de pecho en Mi espacio y te marco el talle más cercano. El talle a medida todavía no está.")),
    el("div", { className: "dos-columnas" },
      el("div", { className: "panel ancha" }, caja,
        el("ul", { className: "leyenda-pt" },
          ...[["costura", "costura"], ["dobladillo", "dobladillo"], ["doblez", "al doblez"]].map(([k, t]) =>
            el("li", {}, el("span", { className: "muestra-pt", style: `background:${COLOR_BORDE[k]}` }), t)),
          el("li", {}, el("span", { className: "muestra-pt", style: "background:#8a8478" }), "línea de corte, con margen"))),
      el("div", { className: "angosta columna" },
        el("div", { className: "panel" }, el("h2", {}, "Piezas"),
          el("ul", { className: "lista-piezas" }, ...base.piezas.map((p) =>
            el("li", {}, el("span", {}, p.nombre), el("span", { className: "ayuda" }, `cortar ${p.cantidad}${p.alDoblez ? ", al doblez" : ""}`))))),
        referenciaAlCostado(),
        boton("Cambiar de base", () => { s.base = null; pintar(); }),
        boton("Seguir: descargar", () => ir("descargas"), "primario"))));
}

function pantallaDescargas() {
  const base = baseDe(s.base);
  if (!base) {
    return el("section", { className: "pantalla" },
      el("div", { className: "encabezado" }, el("h1", {}, "Descargas"), el("p", {}, "Primero elegí una base para tener un molde que descargar.")),
      el("div", { className: "fila" }, boton("Ir a elegir una base", () => ir("molde"), "primario")));
  }
  const formatos: [keyof typeof s.formatos, string, string][] = [
    ["pdf", "PDF A4 para imprimir en casa", "Cada pieza en hojas A4 a escala 1:1, con marcas de pegado y hoja de control."],
    ["dxf", "DXF para plotter o taller", "Archivo CAD de patronaje, en milímetros, con hilo y piquetes."],
    ["hoja", "Hoja de pieza", "Lista de piezas, cuántas cortar, y la medida y el margen de cada borde."],
  ];
  const p = pedido(base), archivos = archivosDelPaquete(p);
  const zip = `${nombreDelProyecto()} · talle ${etiquetaDeTalle(s.talle)}`;
  return el("section", { className: "pantalla" },
    el("div", { className: "encabezado" }, el("h1", {}, "Descargas"),
      el("p", {}, "Todo a escala 1:1, con el margen de costura incluido. Un solo paquete ZIP, para imprimir en casa o llevar a un taller.")),
    el("div", { className: "dos-columnas" },
      el("div", { className: "ancha columna" }, ...formatos.map(([k, titulo, desc]) =>
        el("label", { className: "panel formato" },
          el("input", { type: "checkbox", checked: s.formatos[k], onchange: (e: Event) => { s.formatos[k] = (e.target as HTMLInputElement).checked; pintar(); } }),
          el("span", {}, el("strong", {}, titulo), el("span", { className: "ayuda" }, desc))))),
      el("div", { className: "panel angosta" }, el("h2", {}, zip),
        archivos.length
          ? el("ul", { className: "archivos" }, ...archivos.map((a) => el("li", {}, a)))
          : el("p", { className: "ayuda" }, "Elegí al menos un formato."),
        boton("Descargar ZIP", () => descargar(base), "primario", !archivos.length || s.ocupado),
        boton(s.almacen ? "Guardar el proyecto" : "Guardar el proyecto en una carpeta…", () => guardar()),
        el("span", { className: "ayuda" }, "Antes de cortar: imprimí al 100 % y medí el cuadrado de control de 10 × 10 cm."))));
}

function pantallaEspacio() {
  const nombre = el("input", { type: "text", value: perfil.nombre, placeholder: "Tu nombre", oninput: (e: Event) => { perfil.nombre = (e.target as HTMLInputElement).value; guardarPerfil(perfil); } });
  const recientes = leerRecientes(), descargas = leerDescargas();
  return el("section", { className: "pantalla" },
    el("div", { className: "encabezado" }, el("h1", {}, "Mi espacio"),
      el("p", {}, "Tu perfil, tus medidas y lo que produjiste. Queda guardado en esta computadora: no hay cuenta ni contraseña.")),
    el("div", { className: "dos-columnas" },
      el("div", { className: "panel angosta" }, el("h2", {}, "Perfil"), campo("Nombre", nombre, "Va como autoría en los proyectos que guardes."),
        el("h2", {}, "Mis medidas (cm)"),
        el("div", { className: "grilla-medidas" }, ...MEDIDAS.map(([k, t]) => campo(t, el("input", {
          type: "number", min: "0", step: "0.5", value: perfil.medidas[k] ?? "",
          oninput: (e: Event) => { perfil.medidas[k] = (e.target as HTMLInputElement).value; guardarPerfil(perfil); },
        })))),
        el("span", { className: "ayuda" }, "Por ahora se usa el contorno de pecho, para marcarte el talle más cercano.")),
      el("div", { className: "ancha columna" },
        el("div", { className: "panel" },
          el("div", { className: "fila entre" }, el("h2", {}, "Mis proyectos"),
            el("div", { className: "fila" }, boton("Abrir proyecto…", async () => abrir(await elegirCarpeta("abrir"))),
              boton("Proyecto nuevo", () => { s = sesionNueva(); pintar(); }, "primario"))),
          recientes.length
            ? el("div", { className: "grilla-proyectos" }, ...recientes.map((r) => el("button", {
              type: "button", className: "proyecto",
              onclick: async () => {
                if (r.ruta && enAplicacion()) return abrir(await abrirCarpeta(r.ruta));
                avisar(`Para abrir «${r.nombre}», usá «Abrir proyecto…» y elegí la carpeta «${r.carpeta}».`);
              },
            }, el("strong", {}, r.nombre), el("span", { className: "ayuda" }, `${baseDe(r.base)?.nombre ?? "sin base"} · ${r.fecha}`))))
            : el("p", { className: "ayuda" }, "Todavía no guardaste ningún proyecto. Se guardan desde Descargas.")),
        el("div", { className: "grilla-paneles" },
          el("div", { className: "panel" }, el("h2", {}, "Mis descargas"),
            descargas.length
              ? el("ul", { className: "lista-piezas" }, ...descargas.slice(0, 6).map((d) => el("li", {}, el("span", {}, d.archivo), el("span", { className: "ayuda" }, d.fecha))))
              : el("p", { className: "ayuda" }, "Los paquetes que descargues quedan listados acá.")),
          el("div", { className: "panel" }, el("h2", {}, "Patternpedia"),
            el("p", { className: "ayuda" }, `${cantidadDeFragmentos} fragmentos libres en ${bases.length} bases, convertidos de FreeSewing.`),
            el("h2", {}, "Taller"),
            el("p", { className: "ayuda" }, "Importar un molde de papel desde una foto y resolver uniones entre fragmentos."),
            boton("Abrir el taller", () => abrirTaller()))))));
}

// ---------------------------------------------------------------- marco

async function abrirTaller() {
  document.getElementById("app")!.hidden = true;
  document.getElementById("taller")!.hidden = false;
  document.body.classList.add("en-taller");
  await import("./main"); // la ventana de uniones se enciende la primera vez que se entra
}

function cerrarTaller() {
  document.getElementById("taller")!.hidden = true;
  document.getElementById("app")!.hidden = false;
  document.body.classList.remove("en-taller");
}

function pintar() {
  const pasos: [Pantalla, string][] = [["idea", "Idea"], ["contame", "Contame más"], ["molde", "Molde"], ["descargas", "Descargas"]];
  const cuerpo = s.pantalla === "idea" ? pantallaIdea() : s.pantalla === "contame" ? pantallaContame()
    : s.pantalla === "molde" ? pantallaMolde() : s.pantalla === "descargas" ? pantallaDescargas() : pantallaEspacio();
  document.getElementById("app")!.replaceChildren(
    el("div", { className: "barra", role: "banner" },
      el("div", { className: "marca-pt" }, el("span", { className: "logo" }, "PATTRN"), el("span", { className: "lema" }, "Moldería libre para upcycling")),
      el("nav", { "aria-label": "Pasos" }, ...pasos.map(([id, t], i) => el("button", {
        type: "button", className: `paso${s.pantalla === id ? " actual" : ""}`, ...(s.pantalla === id ? { "aria-current": "step" } : {}),
        onclick: () => ir(id),
      }, `${i + 1} · ${t}`))),
      el("button", { type: "button", className: `paso espacio${s.pantalla === "espacio" ? " actual" : ""}`, onclick: () => ir("espacio") }, "Mi espacio")),
    el("div", { className: "contenido", role: "main" },
      s.aviso ? el("p", { className: `aviso-pt${s.aviso.error ? " error" : ""}`, role: "status" }, s.aviso.texto) : null,
      cuerpo));
}

document.getElementById("volver-del-taller")!.onclick = cerrarTaller;
pintar();
