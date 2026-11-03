// Pantalla del importador de fotos, paso a paso: regla → pieza → bordes → hilo → datos.
// El software propone el contorno y las esquinas; los bordes los etiqueta la persona.

import {
  aplanar, bordesDesdeContorno, calibrar, cm, exportarFragmentoPdf, fragmentoDesdeFoto, largoDeBorde, segmentar, seguirBorde,
  type Almacen, type BordeDetectado, type Calibracion, type Fragmento, type Imagen, type MarcaDeRegla, type Proyecto,
  type Punto, type RespuestaDeBorde, type TipoBorde,
} from "../nucleo";

const ETIQUETAS = [
  "escote", "hombro", "sisa", "lateral", "centro_frente", "centro_espalda", "ruedo", "cintura", "cadera", "canesu",
  "linea_diseno", "copa_manga", "costura_manga", "puno", "cuello", "pie_cuello", "solapa", "tapeta", "vista", "pretina",
  "tiro", "entrepierna", "bolsillo", "otro",
];
const TIPOS: TipoBorde[] = ["costura", "doblez", "union", "terminado"];
const COLORES = ["#1f5fbf", "#c2185b", "#1a8a4a", "#e07b00", "#7b3fa0", "#00838f", "#6d4c41", "#d62828"];

export interface ContextoImportador {
  /** Carpeta y proyecto donde guardar; los pide si todavía no hay. */
  destino: () => Promise<{ almacen: Almacen; proyecto: Proyecto } | null>;
  alGuardar: (almacen: Almacen, proyecto: Proyecto, fragmento: Fragmento) => Promise<Proyecto>;
  alSalir: () => void;
}

type Paso = "regla" | "pieza" | "bordes" | "hilo" | "datos";
interface Marca { px: Punto; cm: number | null; de: "regla" | "escuadra" }
interface Respuesta { etiqueta: string; descripcion: string; tipo: TipoBorde; margen: string; noSe: boolean; margenMm: string; que: string }

const $ = (id: string) => document.getElementById(id)!;
const num = (x: number, decimales = 1) => x.toFixed(decimales).replace(".", ",");
/** A partir de este desvío, el borde probablemente tiene una esquina sin marcar. */
const DESVIO_SOSPECHOSO = 1.5;
const SVG = "http://www.w3.org/2000/svg";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...hijos: (Node | string)[]) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...hijos);
  return e;
}

function svgEl(tag: string, attrs: Record<string, string | number>, texto?: string) {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (texto) e.textContent = texto;
  return e;
}

export async function abrirImportador(archivo: File, ctx: ContextoImportador) {
  const bitmap = await createImageBitmap(archivo);
  const lienzoCanvas = document.createElement("canvas");
  lienzoCanvas.width = bitmap.width;
  lienzoCanvas.height = bitmap.height;
  const c2d = lienzoCanvas.getContext("2d", { willReadFrequently: true })!;
  c2d.drawImage(bitmap, 0, 0);
  const pixeles = c2d.getImageData(0, 0, bitmap.width, bitmap.height);
  const img: Imagen = { ancho: bitmap.width, alto: bitmap.height, datos: pixeles.data };
  const url = URL.createObjectURL(archivo);

  const st = {
    paso: "regla" as Paso,
    marcando: "regla" as "regla" | "escuadra",
    marcas: [] as Marca[],
    cal: null as Calibracion | null,
    contornoMm: null as Punto[] | null,
    extra: [] as Punto[],
    sacar: [] as Punto[],
    bordes: [] as BordeDetectado[],
    esquinas: [] as Punto[],
    avisosPieza: [] as string[],
    respuestas: [] as Respuesta[],
    bordeElegido: null as number | null,
    hilo: [] as Punto[],
    fuente: "marcado_en_original" as "marcado_en_original" | "declarado",
    nombre: archivo.name.replace(/\.[^.]+$/, ""),
    autor: "",
    talle: "",
    fragmento: null as Fragmento | null,
    avisos: [] as string[],
    guardado: null as string | null,
    error: null as string | null,
  };
  let vb = { x: 0, y: 0, w: img.ancho, h: img.alto };

  // ---------------------------------------------------------------- foto y zoom

  const svg = svgEl("svg", { class: "foto" }) as SVGSVGElement;
  svg.append(svgEl("image", { href: url, x: 0, y: 0, width: img.ancho, height: img.alto }));
  const capa = svgEl("g", {});
  svg.append(capa);
  const ponerVista = () => svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  ponerVista();
  $("lienzo").replaceChildren(svg);

  const aFoto = (e: { clientX: number; clientY: number }): Punto => {
    const m = svg.getScreenCTM()!.inverse();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return [p.x, p.y];
  };
  /** Tamaño en unidades de la foto de `n` píxeles de pantalla: lo dibujado no cambia al hacer zoom. */
  const enPantalla = (n: number) => n * Math.abs(svg.getScreenCTM()?.inverse().a ?? 1);

  svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    const [px, py] = aFoto(e);
    const f = e.deltaY > 0 ? 1.25 : 0.8;
    vb = { x: px - (px - vb.x) * f, y: py - (py - vb.y) * f, w: vb.w * f, h: vb.h * f };
    ponerVista();
    dibujar();
  }, { passive: false });

  let arrastre: { x: number; y: number; vx: number; vy: number; movio: boolean } | null = null;
  svg.addEventListener("pointerdown", (e) => {
    arrastre = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y, movio: false };
  });
  svg.addEventListener("pointermove", (e) => {
    if (!arrastre) return;
    const dx = e.clientX - arrastre.x, dy = e.clientY - arrastre.y;
    if (Math.hypot(dx, dy) > 4) arrastre.movio = true;
    if (arrastre.movio) {
      const k = enPantalla(1);
      vb.x = arrastre.vx - dx * k;
      vb.y = arrastre.vy - dy * k;
      ponerVista();
    }
  });
  svg.addEventListener("pointerup", (e) => {
    const fue = arrastre;
    arrastre = null;
    if (fue && !fue.movio) clic(aFoto(e));
  });

  // ---------------------------------------------------------------- clics sobre la foto

  function clic(p: Punto) {
    if (st.paso === "regla") {
      st.marcas.push({ px: p, cm: null, de: st.marcando });
      mostrar();
      const entradas = document.querySelectorAll<HTMLInputElement>(".marca input");
      entradas[entradas.length - 1]?.focus();
    } else if (st.paso === "pieza") {
      if (!st.contornoMm) return detectar(p);
      editarEsquina(p);
    } else if (st.paso === "hilo") {
      st.hilo = st.hilo.length >= 2 ? [p] : [...st.hilo, p];
      mostrar();
    }
  }

  function detectar(semilla: Punto) {
    st.error = null;
    st.avisosPieza = [];
    const seg = segmentar(img, semilla);
    const area = seg.mascara.reduce((s, v) => s + v, 0) / (img.ancho * img.alto);
    if (seg.contraste < 40) st.avisosPieza.push("El papel y el fondo se distinguen poco: revisá que el contorno siga el borde.");
    if (seg.tocaElBorde) st.avisosPieza.push("La pieza toca el borde de la foto: quedó cortada. Conviene volver a sacarla.");
    if (area > 0.7 || area < 0.002) {
      st.error = "No pude separar esa pieza del fondo. Hacé clic en el medio del papel, lejos de las letras.";
      return mostrar();
    }
    st.contornoMm = seguirBorde(img, seg).map(st.cal!.aMm);
    calcularBordes();
    mostrar();
  }

  /** Cuánto se tolera que el ajuste se aparte del papel: las ondas del corte a mano no son la forma. */
  function tolerancia() {
    return Math.max(0.8, Math.round(2 * st.cal!.escalaRegla * 100) / 100);
  }

  function calcularBordes() {
    try {
      const d = bordesDesdeContorno(st.contornoMm!, tolerancia(), {}, st.extra, st.sacar);
      st.bordes = d.bordes;
      st.esquinas = d.bordes.map((b) => b.tramos[0].p0);
      st.error = null;
    } catch (e) {
      st.error = (e as Error).message;
    }
  }

  function editarEsquina(pPx: Punto) {
    const p = st.cal!.aMm(pPx);
    const radio = enPantalla(10) * st.cal!.escalaRegla;
    const cerca = st.esquinas.find((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < radio);
    if (cerca) {
      st.extra = st.extra.filter((q) => Math.hypot(q[0] - cerca[0], q[1] - cerca[1]) >= 5);
      st.sacar.push(cerca);
    } else {
      st.sacar = st.sacar.filter((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) >= 5);
      st.extra.push(p);
    }
    calcularBordes();
    mostrar();
  }

  // ---------------------------------------------------------------- dibujo sobre la foto

  function dibujar() {
    capa.replaceChildren();
    const r = enPantalla(5), linea = enPantalla(2), letra = enPantalla(14);
    if (st.paso === "regla") {
      for (const m of st.marcas) {
        const color = m.de === "regla" ? "#d62828" : "#1f5fbf";
        capa.append(
          svgEl("line", { x1: m.px[0] - r * 2, y1: m.px[1], x2: m.px[0] + r * 2, y2: m.px[1], stroke: color, "stroke-width": linea / 1.5 }),
          svgEl("line", { x1: m.px[0], y1: m.px[1] - r * 2, x2: m.px[0], y2: m.px[1] + r * 2, stroke: color, "stroke-width": linea / 1.5 }),
          svgEl("text", { x: m.px[0] + r * 2, y: m.px[1] - r, fill: color, "font-size": letra, "font-weight": "bold" }, m.cm === null ? "?" : `${m.cm} cm`),
        );
      }
    }
    if (st.cal && st.bordes.length && st.paso !== "regla") {
      st.bordes.forEach((b, i) => {
        const color = COLORES[i % COLORES.length];
        const pts = b.tramos.flatMap((t) => aplanar(t)).map(st.cal!.aPx);
        const elegido = st.bordeElegido === i;
        capa.append(svgEl("polyline", {
          points: pts.map((q) => `${q[0]},${q[1]}`).join(" "), fill: "none", stroke: color,
          "stroke-width": elegido ? linea * 2.5 : linea,
        }));
        const medio = pts[Math.floor(pts.length / 2)];
        capa.append(svgEl("circle", { cx: medio[0], cy: medio[1], r: r * 2, fill: color }));
        capa.append(svgEl("text", { x: medio[0], y: medio[1] + letra * 0.35, fill: "#fff", "font-size": letra, "font-weight": "bold", "text-anchor": "middle" }, String(i + 1)));
      });
      if (st.paso === "pieza") {
        for (const q of st.esquinas) {
          const p = st.cal.aPx(q);
          capa.append(svgEl("circle", { cx: p[0], cy: p[1], r, fill: "#fff", stroke: "#000", "stroke-width": linea / 2 }));
        }
      }
    }
    if (st.paso === "hilo" || st.paso === "datos") {
      for (const q of st.hilo) capa.append(svgEl("circle", { cx: q[0], cy: q[1], r, fill: "#111" }));
      if (st.hilo.length === 2) {
        capa.append(svgEl("line", { x1: st.hilo[0][0], y1: st.hilo[0][1], x2: st.hilo[1][0], y2: st.hilo[1][1], stroke: "#111", "stroke-width": linea }));
      }
    }
  }

  // ---------------------------------------------------------------- panel

  const boton = (texto: string, accion: () => void, primario = false, deshabilitado = false) =>
    el("button", { textContent: texto, onclick: accion, className: primario ? "primario" : "", disabled: deshabilitado });
  const nota = (texto: string, clase = "estado") => el("p", { className: clase }, texto);

  function mostrar() {
    const titulos: Record<Paso, string> = {
      regla: "1 de 5 · Regla", pieza: "2 de 5 · Pieza", bordes: "3 de 5 · Bordes", hilo: "4 de 5 · Hilo", datos: "5 de 5 · Datos",
    };
    $("nombre-molde").textContent = `Importar: ${archivo.name}`;
    $("aviso").replaceChildren(el("h3", {}, titulos[st.paso]), ...(st.error ? [nota(st.error, "motivo")] : []));
    const panel = { regla: panelRegla, pieza: panelPieza, bordes: panelBordes, hilo: panelHilo, datos: panelDatos }[st.paso]();
    $("opciones").replaceChildren(panel, el("div", { className: "acciones" }, boton("Salir del importador", () => { URL.revokeObjectURL(url); ctx.alSalir(); })));
    dibujar();
  }

  function panelRegla() {
    const caja = el("div", {});
    caja.append(nota("Hacé clic sobre marcas de la regla y escribí cuántos cm marca cada una. Con la rueda del mouse se acerca la foto; arrastrando se mueve."));
    caja.append(nota("Usá al menos dos marcas bien separadas. Con tres se detecta si la foto está inclinada a lo largo de la regla."));
    const selector = el("div", { className: "acciones" },
      boton("Marcando: regla", () => { st.marcando = "regla"; mostrar(); }, st.marcando === "regla"),
      boton("Marcando: escuadra", () => { st.marcando = "escuadra"; mostrar(); }, st.marcando === "escuadra"));
    caja.append(selector);
    st.marcas.forEach((m, i) => {
      const entrada = document.createElement("input");
      Object.assign(entrada, { type: "number", step: "0.1", value: m.cm ?? "" });
      entrada.onchange = () => { m.cm = entrada.value === "" ? null : Number(entrada.value); mostrar(); };
      caja.append(el("div", { className: "marca" }, `${m.de} · `, entrada, " cm ",
        boton("Quitar", () => { st.marcas.splice(i, 1); mostrar(); })));
    });
    const regla = st.marcas.filter((m) => m.de === "regla" && m.cm !== null);
    const faltan = st.marcas.some((m) => m.cm === null);
    caja.append(el("div", { className: "acciones" }, boton("Calibrar y seguir", () => {
      try {
        const aMarca = (m: Marca): MarcaDeRegla => ({ px: m.px, mm: m.cm! * 10 });
        const esc = st.marcas.filter((m) => m.de === "escuadra").map(aMarca);
        st.cal = calibrar(regla.map(aMarca), esc.length >= 2 ? esc : undefined);
        st.error = null;
        st.paso = "pieza";
      } catch (e) {
        st.error = (e as Error).message;
      }
      mostrar();
    }, true, regla.length < 2 || faltan)));
    return caja;
  }

  function panelPieza() {
    const caja = el("div", {});
    const c = st.cal!;
    caja.append(nota(`Escala: ${num(1 / c.escalaRegla, 2)} píxeles por mm${c.conEscuadra ? `; regla y escuadra difieren ${num(c.anisotropia * 100, 2)} %` : ""}.`));
    for (const a of c.avisos) caja.append(nota(a, "motivo"));
    if (!st.contornoMm) {
      caja.append(nota("Hacé clic en el medio de la pieza que querés importar."));
      return caja;
    }
    for (const a of st.avisosPieza) caja.append(nota(a, "motivo"));
    caja.append(nota(`Encontré ${st.bordes.length} bordes. Revisá las esquinas: clic sobre un círculo blanco la saca; clic sobre el contorno agrega una.`));
    st.bordes.forEach((b, i) => caja.append(el("div", { className: "medida" }, `Borde ${i + 1}`,
      el("strong", {}, `${cm(b.largo)} · se aparta del papel ${num(b.desvio)} mm`))));
    st.bordes.forEach((b, i) => {
      if (b.desvio > DESVIO_SOSPECHOSO) caja.append(nota(`El borde ${i + 1} se aparta ${num(b.desvio)} mm del papel: quizá le falta una esquina.`, "motivo"));
    });
    caja.append(el("div", { className: "acciones" },
      boton("Las esquinas están bien", () => {
        st.respuestas = st.bordes.map(() => ({ etiqueta: "", descripcion: "", tipo: "costura", margen: "", noSe: false, margenMm: "10", que: "ruedo" }));
        st.bordeElegido = 0;
        st.paso = "bordes";
        mostrar();
      }, true, st.bordes.length < 2),
      boton("Elegir otra pieza", () => { st.contornoMm = null; st.bordes = []; st.extra = []; st.sacar = []; mostrar(); })));
    return caja;
  }

  function panelBordes() {
    const caja = el("div", {});
    caja.append(nota("Decí qué es cada borde. El número es el del círculo sobre la foto. Si no sabés cuánto margen trae el papel en un borde, marcá «no sé»: queda como incierto, sin inventar un número."));
    const comun = document.createElement("input");
    Object.assign(comun, { type: "number", min: "0", step: "0.5", placeholder: "mm" });
    caja.append(el("div", { className: "marca" }, "Mismo margen del papel en todos: ", comun, " ",
      boton("Aplicar", () => { if (comun.value !== "") { st.respuestas.forEach((r) => { r.margen = comun.value; r.noSe = false; }); mostrar(); } })));
    st.bordes.forEach((b, i) => {
      const r = st.respuestas[i];
      const etiqueta = el("select", { onchange: (e: Event) => { r.etiqueta = (e.target as HTMLSelectElement).value; mostrar(); } },
        el("option", { value: "", textContent: "elegí…", selected: r.etiqueta === "" }),
        ...ETIQUETAS.map((t) => el("option", { value: t, textContent: t.replace("_", " "), selected: r.etiqueta === t })));
      const tipo = el("select", { onchange: (e: Event) => { r.tipo = (e.target as HTMLSelectElement).value as TipoBorde; mostrar(); } },
        ...TIPOS.map((t) => el("option", { value: t, textContent: t === "union" ? "unión" : t, selected: r.tipo === t })));
      const margen = document.createElement("input");
      Object.assign(margen, { type: "number", min: "0", step: "0.5", value: r.margen, disabled: r.noSe });
      margen.onchange = () => { r.margen = margen.value; mostrar(); };
      const noSe = document.createElement("input");
      Object.assign(noSe, { type: "checkbox", checked: r.noSe });
      noSe.onchange = () => { r.noSe = noSe.checked; mostrar(); };
      const fila = el("div", {
        className: `borde-form${st.bordeElegido === i ? " elegida" : ""}`,
        onclick: () => { if (st.bordeElegido !== i) { st.bordeElegido = i; dibujar(); document.querySelectorAll(".borde-form").forEach((x, k) => x.classList.toggle("elegida", k === i)); } },
      },
        el("strong", { style: `color:${COLORES[i % COLORES.length]}` }, `Borde ${i + 1} · ${cm(b.largo)}`),
        el("label", {}, "Qué es ", etiqueta), el("label", {}, "Tipo ", tipo),
        el("label", {}, "Margen que trae el papel (mm) ", margen), el("label", {}, noSe, " no sé"));
      if (r.etiqueta === "otro") {
        const d = document.createElement("input");
        Object.assign(d, { value: r.descripcion, placeholder: "descripción" });
        d.onchange = () => { r.descripcion = d.value; };
        fila.append(el("label", {}, "Descripción ", d));
      }
      if (r.tipo === "costura") {
        const m = document.createElement("input");
        Object.assign(m, { type: "number", min: "0", step: "0.5", value: r.margenMm });
        m.onchange = () => { r.margenMm = m.value; };
        fila.append(el("label", {}, "Margen a cortar (mm) ", m));
      }
      if (r.tipo === "terminado") {
        const q = el("select", { onchange: (e: Event) => { r.que = (e.target as HTMLSelectElement).value; } },
          ...["ruedo", "tapeta", "orillo", "puno", "pretina", "vivo", "ojalera", "otro"].map((t) => el("option", { value: t, textContent: t, selected: r.que === t })));
        fila.append(el("label", {}, "Terminación ", q));
      }
      caja.append(fila);
    });
    const completo = st.respuestas.every((r) => r.etiqueta && (r.noSe || r.margen !== ""));
    caja.append(el("div", { className: "acciones" },
      boton("Seguir", () => { st.paso = "hilo"; mostrar(); }, true, !completo),
      boton("Volver a las esquinas", () => { st.paso = "pieza"; mostrar(); })));
    if (!completo) caja.append(nota("Falta decir qué es cada borde y su margen (o «no sé»)."));
    return caja;
  }

  function panelHilo() {
    const caja = el("div", {});
    caja.append(nota("Hacé dos clics sobre la línea de hilo que está dibujada en el papel, bien separados. Si no tiene línea, marcá la dirección que corresponde y elegí «la indico yo»."));
    const fuente = el("select", { onchange: (e: Event) => { st.fuente = (e.target as HTMLSelectElement).value as typeof st.fuente; } },
      el("option", { value: "marcado_en_original", textContent: "está marcada en el papel", selected: st.fuente === "marcado_en_original" }),
      el("option", { value: "declarado", textContent: "la indico yo", selected: st.fuente === "declarado" }));
    caja.append(el("label", {}, "La línea de hilo ", fuente));
    caja.append(el("div", { className: "acciones" },
      boton("Seguir", () => { st.paso = "datos"; mostrar(); }, true, st.hilo.length !== 2),
      boton("Volver a los bordes", () => { st.paso = "bordes"; mostrar(); })));
    return caja;
  }

  function panelDatos() {
    const caja = el("div", {});
    const campo = (nombre: string, valor: string, cambiar: (v: string) => void) => {
      const i = document.createElement("input");
      i.value = valor;
      i.onchange = () => { cambiar(i.value); st.fragmento = null; mostrar(); };
      return el("label", { className: "campo" }, nombre, " ", i);
    };
    caja.append(campo("Nombre de la pieza", st.nombre, (v) => { st.nombre = v; }),
      campo("Autoría (para la atribución CC BY-SA)", st.autor, (v) => { st.autor = v; }),
      campo("Talle (si tiene)", st.talle, (v) => { st.talle = v; }));

    if (!st.fragmento) {
      caja.append(el("div", { className: "acciones" },
        boton("Armar el fragmento", armar, true, !st.nombre.trim() || !st.autor.trim()),
        boton("Volver al hilo", () => { st.paso = "hilo"; mostrar(); })));
      return caja;
    }
    const f = st.fragmento;
    caja.append(el("h3", {}, "Línea neta del fragmento"));
    for (const b of f.bordes) {
      caja.append(el("div", { className: "medida" }, `${b.id} ${b.etiqueta}${b.certeza?.estado === "incierta" ? " (incierto)" : ""}`, el("strong", {}, cm(largoDeBorde(f, b.id)))));
    }
    const cal = f.origen.calibracion as { error_estimado_mm: number };
    caja.append(nota(`Error estimado de la importación: ±${num(cal.error_estimado_mm, 2)} mm.`));
    for (const a of st.avisos) caja.append(nota(a, "motivo"));
    if (st.guardado) caja.append(nota(st.guardado));
    caja.append(el("div", { className: "acciones" },
      boton("Guardar y exportar PDF", guardar, true),
      boton("Importar otra pieza de esta foto", otraPieza, false, !st.guardado)));
    return caja;
  }

  async function armar() {
    try {
      const c = st.cal!;
      const respuestas: RespuestaDeBorde[] = st.respuestas.map((r) => ({
        etiqueta: r.etiqueta, descripcion: r.descripcion || undefined, tipo: r.tipo,
        margenEnContorno: r.noSe ? "no_se" : Number(r.margen),
        margenMm: Number(r.margenMm) || 0,
        terminado: r.tipo === "terminado" ? { que: r.que } : undefined,
      }));
      const d = new Date();
      const { fragmento, avisos } = await fragmentoDesdeFoto({
        nombre: st.nombre.trim(), autor: st.autor.trim(), talle: st.talle.trim() || undefined,
        fecha: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
        foto: archivo.name, calibracion: c, bordes: st.bordes, respuestas, tolerancia: tolerancia(),
        hilo: { desde: c.aMm(st.hilo[0]), hasta: c.aMm(st.hilo[1]), fuente: st.fuente },
      });
      st.fragmento = fragmento;
      st.avisos = avisos;
      st.error = null;
    } catch (e) {
      st.error = (e as Error).message;
    }
    mostrar();
  }

  async function guardar() {
    try {
      const destino = await ctx.destino();
      if (!destino) return;
      const f = st.fragmento!;
      await ctx.alGuardar(destino.almacen, destino.proyecto, f);
      const pdf = `exportados/${f.id}@${f.version}.pdf`;
      await destino.almacen.escribirBytes(pdf, exportarFragmentoPdf(f).pdf);
      st.guardado = `Guardado en ${destino.almacen.nombre}: fragmentos/${f.id}@${f.version}.json y ${pdf}. Imprimí el PDF al 100 % y apoyalo sobre el molde de papel.`;
      st.error = null;
    } catch (e) {
      st.error = `No se pudo guardar: ${(e as Error).message}`;
    }
    mostrar();
  }

  function otraPieza() {
    Object.assign(st, {
      paso: "pieza", contornoMm: null, extra: [], sacar: [], bordes: [], esquinas: [], avisosPieza: [], respuestas: [],
      bordeElegido: null, hilo: [], nombre: "", talle: "", fragmento: null, avisos: [], guardado: null, error: null,
    });
    vb = { x: 0, y: 0, w: img.ancho, h: img.alto };
    ponerVista();
    mostrar();
  }

  mostrar();
}
