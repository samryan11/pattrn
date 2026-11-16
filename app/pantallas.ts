// Las pantallas de PATTRN: de la idea al molde descargado.
//
//   Idea → Contame más → Molde → Descargas, y Mi espacio.
//
// El molde se arma en un lienzo (pantalla-molde.ts): piezas de Patternpedia que se cortan y se
// cosen. La ventana de uniones y el importador de fotos siguen estando: son el «taller», al que
// se entra desde Mi espacio. Acá no se calcula nada: todo lo que mide o exporta es del núcleo.

import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/700.css";
import "./pantallas.css";
import { abrirProyecto, archivosDelPaquete, armarPaquete, bytesDeTexto, cm, guardarProyecto, type PedidoDePaquete, type Proyecto } from "../nucleo";
import { abrirCarpeta, elegirCarpeta, enAplicacion, guardarArchivo, type AlmacenConBytes } from "./almacen";
import { alDoblez, estadoDeCosturas, lienzoDeMolde, moldeDelLienzo } from "./lienzo";
import { pantallaMolde } from "./pantalla-molde";
import { cantidadDeFragmentos, disenos, etiquetaDeTalle, licencias } from "./patternpedia";
import { anotarDescarga, anotarReciente, guardarPerfil, leerDescargas, leerPerfil, leerRecientes, MEDIDAS } from "./perfil";
import { sesionNueva, type Adjunto, type Contexto, type Modo, type Pantalla } from "./sesion";
import { boton, campo, el, selector } from "./ui";

let s = sesionNueva();
const perfil = leerPerfil();

// ---------------------------------------------------------------- utilidades

const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const idAleatorio = (prefijo: string) =>
  prefijo + Array.from({ length: 8 }, () => "0123456789abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 36)]).join("");
const nombreDelProyecto = () => s.nombre.trim() || "Mi proyecto";
const autor = () => perfil.nombre.trim() || "PATTRN";

function ir(pantalla: Pantalla) {
  s.pantalla = pantalla;
  s.aviso = null;
  s.pendiente = null;
  pintar();
  window.scrollTo({ top: 0 });
}

function avisar(texto: string, error = false) {
  s.aviso = { texto, error };
  pintar();
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
    const ruta = `referencias/${id}-${a.nombre.replace(/^ref\d+-/, "").replace(/[^\w.-]+/g, "_")}`;
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
    lienzo: { posiciones: Object.fromEntries(s.lienzo.piezas.map((p) => [p.id, [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]])) },
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
    if (s.lienzo.piezas.length) {
      const molde = moldeDelLienzo(s.lienzo, s.moldeId, nombreDelProyecto(), autor(), fecha);
      await guardarProyecto(s.almacen, proyecto, molde, s.lienzo.piezas.map((p) => p.fragmento), fecha);
    } else {
      await s.almacen.escribir("proyecto.json", JSON.stringify(proyecto, null, 2) + "\n");
    }
    anotarReciente({ nombre: proyecto.nombre, carpeta: s.almacen.nombre, ruta: s.almacen.ruta ?? null, base: null, fecha });
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
      referencias?: { archivo: string; tipo: string; nota?: string }[]; lienzo?: { posiciones?: Record<string, [number, number]> };
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
      nueva.lienzo = lienzoDeMolde(a.molde, a.fragmentos, p.lienzo?.posiciones);
    } else nueva.moldeId = idAleatorio("mol-");
    nueva.pantalla = nueva.lienzo.piezas.length ? "molde" : "idea";
    s = nueva;
    anotarReciente({ nombre: p.nombre, carpeta: almacen.nombre, ruta: almacen.ruta ?? null, base: null, fecha: hoy() });
    pintar();
  } catch (e) {
    avisar(`No se pudo abrir: ${(e as Error).message}`, true);
  }
}

// ---------------------------------------------------------------- descargas

/** El talle de las piezas, si todas comparten uno; si se mezclaron talles, no hay uno solo. */
function talleComun(): string {
  const t = new Set(s.lienzo.piezas.map((p) => p.fragmento.talle_base as string | undefined));
  const unico = t.size === 1 ? [...t][0] : undefined;
  return unico ? etiquetaDeTalle(unico) : "";
}

function pedido(): PedidoDePaquete {
  const c = s.contexto;
  const PARA = { para_mi: "Para mí", otra_persona: "Para otra persona", talle_estandar: "Talle estándar" };
  const costuras = estadoDeCosturas(s.lienzo).map((e, i) => {
    const a = e.analisis, dif = Math.abs(e.costura.embebido_mm);
    const detalle = !a.dentroDeTolerancia ? ` · ATENCIÓN: sobran ${cm(Math.abs(a.desvio))} en ${a.sobra === "a" ? e.nombreA : e.nombreB}`
      : dif > 0.005 ? ` · ${cm(dif)} de frunce o embebido` : "";
    return `Costura ${i + 1}: ${e.nombreA} con ${e.nombreB} · ${cm(a.largoA)} y ${cm(a.largoB)}${detalle}`;
  });
  const procedencias = [...new Set(s.lienzo.piezas.map((p) => p.procedencia.split(" · ")[0]).filter(Boolean))];
  const notas = [
    [PARA[c.para_quien], c.tipo_prenda.trim()].filter(Boolean).join(" · "),
    c.donantes.trim() ? `Para reusar: ${c.donantes.trim()}` : "",
    c.forro.lleva ? "Lleva forro: los moldes de forro todavía no se generan; por ahora se cortan a partir de estas mismas piezas." : "",
    s.texto.trim() ? `Idea: ${s.texto.trim().slice(0, 160)}` : "",
    ...costuras,
  ].filter(Boolean);
  return {
    nombre: nombreDelProyecto(), etiquetaTalle: talleComun(),
    base: procedencias.length ? `piezas de Patternpedia (${procedencias.join(", ")}), cortadas y combinadas` : "piezas de Patternpedia",
    piezas: s.lienzo.piezas.map((p) => ({ nombre: p.nombre, fragmento: p.fragmento, cantidad: p.cantidad, alDoblez: alDoblez(p.fragmento) })),
    formatos: s.formatos, notas,
    licencias: licencias.map((l) => ({ nombre: l.nombre, datos: bytesDeTexto(l.texto) })),
  };
}

async function descargar() {
  s.ocupado = true;
  s.aviso = { texto: "Armando el paquete…" };
  pintar();
  try {
    const paquete = await armarPaquete(pedido());
    const donde = await guardarArchivo(paquete.nombre, paquete.zip, "application/zip");
    s.ocupado = false;
    if (!donde) return avisar("Descarga cancelada.");
    if (s.almacen) await s.almacen.escribirBytes(`exportados/${paquete.nombre}`, paquete.zip);
    anotarDescarga({ archivo: paquete.nombre, proyecto: nombreDelProyecto(), talle: talleComun() || "talles combinados", fecha: hoy() });
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
        el("span", { className: "ayuda" }, "Queda anotado en el proyecto y en la hoja de pieza. Los moldes de forro todavía no se generan.")),
      el("div", { className: "panel" }, el("h2", {}, "Cómo vas a coser"),
        campo("Experiencia", selector(c.experiencia, [["primera_prenda", "Es mi primera prenda"], ["algunas", "Ya cosí algunas"], ["seguido", "Coso seguido"]], (v) => { c.experiencia = v; })),
        campo("Con qué", selector(c.maquina, [["recta", "Máquina recta familiar"], ["recta_y_overlock", "Recta y overlock"], ["a_mano", "A mano"]], (v) => { c.maquina = v; })))),
    el("div", { className: "fila" }, boton("Seguir: armar el molde", () => ir("molde"), "primario")));
}

function referenciaAlCostado() {
  const a = s.modo === "boceto" ? s.adjuntos.boceto ?? s.adjuntos.imagen : s.adjuntos.imagen ?? s.adjuntos.boceto;
  if (!a && !s.texto.trim()) return null;
  return el("div", { className: "panel" }, el("h2", {}, "Tu punto de partida"),
    a ? el("img", { className: "referencia", src: a.url, alt: "Imagen de referencia del proyecto" }) : null,
    s.texto.trim() ? el("p", { className: "idea" }, s.texto.trim()) : null);
}

function pantallaDescargas() {
  if (!s.lienzo.piezas.length) {
    return el("section", { className: "pantalla" },
      el("div", { className: "encabezado" }, el("h1", {}, "Descargas"), el("p", {}, "Todavía no hay piezas en el lienzo. Armá el molde primero.")),
      el("div", { className: "fila" }, boton("Ir a armar el molde", () => ir("molde"), "primario")));
  }
  const formatos: [keyof typeof s.formatos, string, string][] = [
    ["pdf", "PDF A4 para imprimir en casa", "Cada pieza en hojas A4 a escala 1:1, con marcas de pegado y hoja de control."],
    ["dxf", "DXF para plotter o taller", "Archivo CAD de patronaje, en milímetros, con hilo y piquetes."],
    ["hoja", "Hoja de pieza", "Lista de piezas, cuántas cortar, la medida y el margen de cada borde, y las costuras."],
  ];
  const archivos = archivosDelPaquete(pedido()), talle = talleComun();
  const pendientes = estadoDeCosturas(s.lienzo).filter((e) => !e.analisis.dentroDeTolerancia).length;
  return el("section", { className: "pantalla" },
    el("div", { className: "encabezado" }, el("h1", {}, "Descargas"),
      el("p", {}, "Todo a escala 1:1, con el margen de costura incluido. Un solo paquete ZIP, para imprimir en casa o llevar a un taller.")),
    el("div", { className: "dos-columnas" },
      el("div", { className: "ancha columna" }, ...formatos.map(([k, titulo, desc]) =>
        el("label", { className: "panel formato" },
          el("input", { type: "checkbox", checked: s.formatos[k], onchange: (e: Event) => { s.formatos[k] = (e.target as HTMLInputElement).checked; pintar(); } }),
          el("span", {}, el("strong", {}, titulo), el("span", { className: "ayuda" }, desc))))),
      el("div", { className: "panel angosta" }, el("h2", {}, talle ? `${nombreDelProyecto()} · talle ${talle}` : nombreDelProyecto()),
        el("span", { className: "ayuda" }, `${s.lienzo.piezas.length} piezas${talle ? "" : ", en talles combinados"}.`),
        pendientes ? el("p", { className: "atencion" }, `Hay ${pendientes} ${pendientes === 1 ? "costura cuyos bordes no miden" : "costuras cuyos bordes no miden"} lo mismo. Se puede descargar igual; queda anotado en la hoja de pieza.`) : null,
        archivos.length
          ? el("ul", { className: "archivos" }, ...archivos.map((a) => el("li", {}, a)))
          : el("p", { className: "ayuda" }, "Elegí al menos un formato."),
        boton("Descargar ZIP", () => descargar(), "primario", !archivos.length || s.ocupado),
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
      el("div", { className: "panel angosta" }, el("h2", {}, "Perfil"), campo("Nombre", nombre, "Va como autoría en los proyectos que guardes y en los fragmentos que cortes."),
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
            }, el("strong", {}, r.nombre), el("span", { className: "ayuda" }, r.fecha))))
            : el("p", { className: "ayuda" }, "Todavía no guardaste ningún proyecto. Se guardan desde Descargas.")),
        el("div", { className: "grilla-paneles" },
          el("div", { className: "panel" }, el("h2", {}, "Mis descargas"),
            descargas.length
              ? el("ul", { className: "lista-piezas" }, ...descargas.slice(0, 6).map((d) => el("li", {}, el("span", {}, d.archivo), el("span", { className: "ayuda" }, d.fecha))))
              : el("p", { className: "ayuda" }, "Los paquetes que descargues quedan listados acá.")),
          el("div", { className: "panel" }, el("h2", {}, "Patternpedia"),
            el("p", { className: "ayuda" }, `${cantidadDeFragmentos} fragmentos libres de ${disenos.length} prendas, convertidos de FreeSewing. Son material para cortar y combinar.`),
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
    : s.pantalla === "molde" ? pantallaMolde({ s, perfil, pintar, avisar, ir, autor, hoy, nombre: nombreDelProyecto, referencia: referenciaAlCostado })
      : s.pantalla === "descargas" ? pantallaDescargas() : pantallaEspacio();
  const abajo = window.scrollY; // repintar no tiene que mover la página
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
  window.scrollTo({ top: abajo });
}

document.getElementById("volver-del-taller")!.onclick = cerrarTaller;
pintar();
