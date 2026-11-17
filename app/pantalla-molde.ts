// La pantalla de Molde: el lienzo donde se traen piezas de Patternpedia, se cortan y se cosen.
// Lo que sale de acá es un molde nuevo, que no existía en el archivo.

import { aplanar, cm, largoDeBorde, lineaDeCorte, tramoDeBorde, type Fragmento, type Punto, type TipoBorde } from "../nucleo";
import { cajaDe, coser, cortarPorLinea, editarBorde, estadoDeCosturas, piezaDe, quitarPieza, traerPieza, type PiezaL } from "./lienzo";
import { cargarFragmento, disenoDe, disenos, etiquetaDeTalle, grupos, NOMBRE_GRUPO, talles, tallesSugeridos, type Diseno } from "./patternpedia";
import type { Perfil } from "./perfil";
import { armarSegunPlan, PREGUNTAS, type Descripcion } from "./plan";
import type { Herramienta, Sesion } from "./sesion";
import { boton, campo, COLOR_BORDE, el, miniatura, nombreDeEtiqueta, selector, svgEl } from "./ui";

export interface Ctx {
  s: Sesion;
  perfil: Perfil;
  pintar(): void;
  avisar(texto: string, error?: boolean): void;
  ir(pantalla: Sesion["pantalla"]): void;
  autor(): string;
  hoy(): string;
  nombre(): string;
  referencia(): HTMLElement | null;
  /** Guarda el lienzo como está, antes de cambiarlo, para poder deshacer. */
  anotar(): void;
  deshacer(): void;
  rehacer(): void;
}

const AYUDA: Record<Herramienta, string> = {
  mover: "Arrastrá una pieza para moverla. Tocá una pieza o un borde para ver sus datos.",
  cortar: "Marcá dos puntos: la línea corta de lado a lado todas las piezas que toque. Para cortar varias a la misma altura, trazala a través de todas.",
  coser: "Tocá un borde y después el borde con el que se cose. PATTRN te dice si miden lo mismo.",
};

// las miniaturas se guardan: cargar un fragmento del archivo no es instantáneo
const miniaturas = new Map<string, Fragmento>();

function filaDeTalles(c: Ctx) {
  const { s } = c;
  const pecho = Number(c.perfil.medidas.pecho);
  const sugeridos = pecho > 0 ? tallesSugeridos(pecho) : [];
  const fila = (grupo: "con_busto" | "recto") => el("div", { className: "fila-talles", role: "group", "aria-label": `Talles, ${NOMBRE_GRUPO[grupo]}` },
    el("span", { className: "grupo-talle" }, NOMBRE_GRUPO[grupo]),
    ...talles.filter((t) => t.grupo === grupo).map((t) => el("button", {
      type: "button", className: `talle${s.talle === t.id ? " elegido" : ""}${sugeridos.includes(t.id) ? " sugerido" : ""}`,
      "aria-pressed": String(s.talle === t.id), title: `Pecho ${t.pecho_cm} · cintura ${t.cintura_cm} · cadera ${t.cadera_cm} cm`,
      onclick: () => { s.talle = t.id; c.pintar(); },
    }, String(t.pecho_cm))));
  return [fila("con_busto"), fila("recto"), el("span", { className: "ayuda" }, sugeridos.length
    ? `Con tu pecho de ${pecho} cm, los más cercanos están marcados con un punto.`
    : "Cargá tu contorno de pecho en Mi espacio y te marco el talle más cercano.")];
}

/** PATTRN arma el molde: unas preguntas sobre la prenda, y el plan elige, corta y cose. */
function panelDelPlan(c: Ctx): HTMLElement {
  const { s } = c, d = s.descripcion;
  const armar = async () => {
    try {
      c.anotar();
      const r = await armarSegunPlan(d, s.talle, c.autor(), c.hoy());
      s.lienzo = r.lienzo;
      s.notasDelPlan = r.notas;
      s.sel = null; s.selBorde = null; s.pendiente = null; s.herramienta = "mover";
      c.avisar(`Molde armado: ${r.lienzo.piezas.length} piezas y ${r.lienzo.costuras.length} costuras. Podés corregirlo en el lienzo o descargarlo así.`);
    } catch (e) {
      s.historial.pop();
      c.avisar(`No se pudo armar: ${(e as Error).message}`, true);
    }
  };
  return el("div", { className: "panel" },
    el("h2", {}, "Que lo arme PATTRN"),
    el("span", { className: "ayuda" }, "Contestá cómo es la prenda. PATTRN elige las piezas de Patternpedia, las corta y las cose."),
    ...PREGUNTAS.filter((q) => q.siempreQue(d)).map((q) => el("div", { className: "pregunta", role: "group", "aria-label": q.pregunta },
      el("span", { className: "texto-pregunta" }, q.pregunta),
      ...q.opciones.map(([v, t]) => el("button", {
        type: "button", className: `talle opcion${d[q.clave] === v ? " elegido" : ""}`, "aria-pressed": String(d[q.clave] === v),
        onclick: () => { (d as unknown as Record<string, string>)[q.clave] = v; c.pintar(); },
      }, t)))),
    el("h2", {}, "Talle, por contorno de pecho en cm"),
    ...filaDeTalles(c),
    el("div", { className: "fila" }, boton(s.lienzo.piezas.length ? "Armar de nuevo" : "Armar el molde", armar, "primario"),
      s.lienzo.piezas.length ? el("span", { className: "ayuda" }, "Reemplaza lo que hay en el lienzo. Ctrl+Z lo recupera.") : null),
    s.notasDelPlan.length ? el("div", { className: "notas-plan" }, el("strong", {}, "Qué hizo PATTRN"),
      el("ul", {}, ...s.notasDelPlan.map((n) => el("li", {}, n)))) : null);
}

function panelTraer(c: Ctx): HTMLElement {
  const { s } = c;
  const pecho = Number(c.perfil.medidas.pecho);
  const sugeridos = pecho > 0 ? tallesSugeridos(pecho) : [];
  const fila = (grupo: "con_busto" | "recto") => el("div", { className: "fila-talles", role: "group", "aria-label": `Talles, ${NOMBRE_GRUPO[grupo]}` },
    el("span", { className: "grupo-talle" }, NOMBRE_GRUPO[grupo]),
    ...talles.filter((t) => t.grupo === grupo).map((t) => el("button", {
      type: "button", className: `talle${s.talle === t.id ? " elegido" : ""}${sugeridos.includes(t.id) ? " sugerido" : ""}`,
      "aria-pressed": String(s.talle === t.id), title: `Pecho ${t.pecho_cm} · cintura ${t.cintura_cm} · cadera ${t.cadera_cm} cm`,
      onclick: () => { s.talle = t.id; c.pintar(); },
    }, String(t.pecho_cm))));

  const traer = async (d: Diseno, cuales = d.piezas) => {
    try {
      c.anotar();
      let ultima: PiezaL | null = null;
      for (const p of cuales) ultima = await traerPieza(s.lienzo, p, d.nombre, s.talle, c.hoy());
      if (ultima) { s.sel = ultima.id; s.selBorde = null; }
      s.aviso = null;
      c.pintar();
    } catch (e) {
      s.historial.pop(); // si no se trajo nada, no hay qué deshacer
      c.avisar((e as Error).message, true);
    }
  };

  const piezasDe = (abierto: Diseno) => el("div", { className: "piezas-archivo" },
    el("span", { className: "nombre-diseno" }, abierto.nombre),
    ...abierto.piezas.map((p) => {
      const caja = el("span", { className: "mini" });
      const clave = p.archivo;
      const poner = (f: Fragmento) => caja.replaceChildren(miniatura([f], `Forma de ${p.nombre}`));
      if (miniaturas.has(clave)) poner(miniaturas.get(clave)!);
      else cargarFragmento(p).then((f) => { miniaturas.set(clave, f); poner(f); }).catch(() => undefined);
      return el("button", { type: "button", className: "pieza-archivo", title: `Traer ${p.nombre} al lienzo`, onclick: () => traer(abierto, [p]) }, caja, el("span", {}, p.nombre));
    }),
    boton("Traer todas", () => traer(abierto)));
  const abiertos = s.disenosAbiertos.map(disenoDe).filter((d): d is Diseno => d !== null);

  if (!s.aMano) {
    return el("div", { className: "panel plegado" },
      el("div", { className: "fila entre" },
        el("div", {}, el("h2", {}, "Armarlo o corregirlo a mano"), el("span", { className: "ayuda" }, "Opcional: traer piezas sueltas de Patternpedia para cortarlas y combinarlas vos.")),
        boton("Mostrar las piezas", () => { s.aMano = true; c.pintar(); })));
  }
  return el("div", { className: "panel" },
    el("div", { className: "fila entre" }, el("h2", {}, "Traer piezas de Patternpedia"), boton("Ocultar", () => { s.aMano = false; c.pintar(); })),
    el("span", { className: "ayuda" }, "No son moldes para usar enteros: son material. Traé piezas de las prendas que quieras, y después cortalas y combinalas."),
    ...grupos.map((g) => el("div", { className: "fila-disenos" }, el("span", { className: "grupo-talle" }, g),
      ...disenos.filter((d) => d.grupo === g).map((d) => el("button", {
        type: "button", className: `diseno${s.disenosAbiertos.includes(d.id) ? " elegido" : ""}`, "aria-expanded": String(s.disenosAbiertos.includes(d.id)), title: d.descripcion,
        onclick: () => { s.disenosAbiertos = s.disenosAbiertos.includes(d.id) ? s.disenosAbiertos.filter((x) => x !== d.id) : [...s.disenosAbiertos, d.id]; c.pintar(); },
      }, d.nombre)))),
    abiertos.length ? el("p", { className: "ayuda" }, "Tocá una pieza para traerla al lienzo. Podés dejar abiertas varias prendas a la vez.") : null,
    ...abiertos.map(piezasDe),
    el("h2", {}, "Talle de las piezas que traigas, por contorno de pecho en cm"),
    fila("con_busto"), fila("recto"),
    el("span", { className: "ayuda" }, sugeridos.length
      ? `Con tu pecho de ${pecho} cm, los más cercanos están marcados con un punto. Podés traer piezas en talles distintos.`
      : "Cargá tu contorno de pecho en Mi espacio y te marco el talle más cercano. Podés traer piezas en talles distintos."));
}

/** Los puntos de un borde en coordenadas del lienzo. */
const puntosDeBorde = (p: PiezaL, bordeId: string): Punto[] => {
  const b = p.fragmento.bordes.find((x) => x.id === bordeId)!;
  return aplanar(tramoDeBorde(p.fragmento, b)).map((q) => [p.x + q[0], p.y - q[1]] as Punto);
};
const medio = (pts: Punto[]) => pts[Math.floor(pts.length / 2)];

function lienzo(c: Ctx): HTMLElement {
  const { s } = c, l = s.lienzo;
  if (!l.piezas.length) {
    return el("div", { className: "lienzo-vacio" },
      el("strong", {}, "El lienzo está vacío"),
      el("span", {}, "Contestá las preguntas de arriba y tocá «Armar el molde». O, si preferís, traé piezas sueltas y armalo a mano."));
  }
  const cajas = l.piezas.map(cajaDe);
  const x0 = Math.min(...cajas.map((k) => k.x0)) - 80, x1 = Math.max(...cajas.map((k) => k.x1)) + 80;
  const y0 = Math.min(...cajas.map((k) => k.y0)) - 80, y1 = Math.max(...cajas.map((k) => k.y1)) + 130;
  const ancho = x1 - x0, letra = Math.max(18, ancho / 60);
  const svg = svgEl("svg", {
    viewBox: `${x0} ${y0} ${ancho} ${y1 - y0}`, role: "application",
    "aria-label": `Lienzo con ${l.piezas.length} piezas. Herramienta: ${s.herramienta}.`, class: `lienzo-svg ${s.herramienta}`,
  }) as SVGSVGElement;
  const estados = estadoDeCosturas(l);

  l.piezas.forEach((p, i) => {
    const elegida = s.sel === p.id;
    const g = svgEl("g", { "data-pieza": p.id, transform: `translate(${p.x} ${p.y}) scale(1 -1)`, class: `pieza-l${elegida ? " elegida" : ""}` });
    const corte = lineaDeCorte(p.fragmento).flatMap((t) => t.puntos);
    g.append(svgEl("polygon", { points: corte.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(" "), class: "corte-l", "vector-effect": "non-scaling-stroke" }));
    for (const b of p.fragmento.bordes) {
      const pts = aplanar(tramoDeBorde(p.fragmento, b)).map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(" ");
      const marcado = (elegida && s.selBorde === b.id)
        || (s.pendiente !== null && !Array.isArray(s.pendiente) && (s.pendiente as { pieza: string; borde: string }).pieza === p.id && (s.pendiente as { pieza: string; borde: string }).borde === b.id);
      g.append(svgEl("polyline", {
        points: pts, fill: "none", stroke: COLOR_BORDE[b.tipo], "stroke-width": marcado ? 6 : b.tipo === "terminado" ? 4 : 2.4, "vector-effect": "non-scaling-stroke",
        ...(b.tipo === "doblez" ? { "stroke-dasharray": "10 5" } : {}),
      }));
      // una franja ancha e invisible encima, para que el borde sea fácil de tocar
      g.append(svgEl("polyline", { points: pts, fill: "none", stroke: "transparent", "stroke-width": 18, "vector-effect": "non-scaling-stroke", "data-borde": b.id, class: "toque" }));
    }
    const h = p.fragmento.hilo, a = (h.angulo_grados * Math.PI) / 180, k = cajas[i], L = Math.min(k.x1 - k.x0, k.y1 - k.y0) * 0.2;
    g.append(svgEl("line", {
      x1: h.punto[0] - Math.cos(a) * L, y1: h.punto[1] - Math.sin(a) * L, x2: h.punto[0] + Math.cos(a) * L, y2: h.punto[1] + Math.sin(a) * L,
      class: "hilo-l", "vector-effect": "non-scaling-stroke",
    }));
    svg.append(g);
    svg.append(svgEl("text", { x: (k.x0 + k.x1) / 2, y: k.y1 + letra * 1.5, "text-anchor": "middle", "font-size": letra, class: `nombre-l${elegida ? " elegida" : ""}`, "data-nombre": p.id }, p.nombre));
    if (elegida) {
      for (const b of p.fragmento.bordes) {
        const m = medio(puntosDeBorde(p, b.id));
        svg.append(svgEl("text", { x: m[0], y: m[1], "text-anchor": "middle", "font-size": letra * 0.8, class: "borde-l", dy: "0.35em" }, b.id));
      }
    }
  });

  estados.forEach((e, i) => {
    const pa = piezaDe(l, e.costura.a.pieza)!, pb = piezaDe(l, e.costura.b.pieza)!;
    const ma = medio(puntosDeBorde(pa, e.costura.a.borde)), mb = medio(puntosDeBorde(pb, e.costura.b.borde));
    const bien = e.analisis.dentroDeTolerancia;
    svg.append(svgEl("line", { x1: ma[0], y1: ma[1], x2: mb[0], y2: mb[1], class: `costura-l${bien ? "" : " mal"}`, "vector-effect": "non-scaling-stroke" }));
    const cx = (ma[0] + mb[0]) / 2, cy = (ma[1] + mb[1]) / 2;
    svg.append(svgEl("circle", { cx, cy, r: letra * 0.85, class: `costura-n${bien ? "" : " mal"}` }));
    svg.append(svgEl("text", { x: cx, y: cy, "text-anchor": "middle", dy: "0.35em", "font-size": letra * 0.9, class: "costura-t" }, String(i + 1)));
  });

  const previa = svgEl("line", { class: "previa-corte", "vector-effect": "non-scaling-stroke", visibility: "hidden" });
  svg.append(previa);
  if (s.herramienta === "cortar" && Array.isArray(s.pendiente)) {
    svg.append(svgEl("circle", { cx: (s.pendiente as Punto)[0], cy: (s.pendiente as Punto)[1], r: letra * 0.35, class: "punto-corte" }));
  }

  // ---- interacción
  const enLienzo = (e: PointerEvent): Punto => {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const q = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return [q.x, q.y];
  };
  // un corte casi horizontal o casi vertical se endereza: es lo que casi siempre se quiere
  const enderezar = (a: Punto, b: Punto): Punto => {
    const dx = Math.abs(b[0] - a[0]), dy = Math.abs(b[1] - a[1]);
    if (dy < dx * 0.07) return [b[0], a[1]];
    if (dx < dy * 0.07) return [a[0], b[1]];
    return b;
  };
  const piezaEn = (t: EventTarget | null) => (t as Element | null)?.closest?.("[data-pieza]")?.getAttribute("data-pieza") ?? (t as Element | null)?.getAttribute?.("data-nombre") ?? null;
  const bordeEn = (t: EventTarget | null) => (t as Element | null)?.getAttribute?.("data-borde") ?? null;

  svg.addEventListener("pointerdown", async (e) => {
    const id = piezaEn(e.target), borde = bordeEn(e.target), q = enLienzo(e);
    if (s.herramienta === "mover") {
      if (!id) { if (s.sel) { s.sel = null; s.selBorde = null; c.pintar(); } return; }
      const p = piezaDe(l, id)!, g = svg.querySelector(`[data-pieza="${id}"]`)!;
      const dx = q[0] - p.x, dy = q[1] - p.y;
      let movio = false;
      const mover = (m: PointerEvent) => {
        const r = enLienzo(m);
        if (!movio && Math.hypot(r[0] - q[0], r[1] - q[1]) < 4) return;
        if (!movio) c.anotar();
        movio = true;
        p.x = r[0] - dx; p.y = r[1] - dy;
        g.setAttribute("transform", `translate(${p.x} ${p.y}) scale(1 -1)`);
      };
      const soltar = () => {
        svg.removeEventListener("pointermove", mover);
        svg.removeEventListener("pointerup", soltar);
        svg.removeEventListener("pointercancel", soltar);
        s.sel = id;
        if (!movio) s.selBorde = borde;
        c.pintar();
      };
      svg.setPointerCapture(e.pointerId);
      svg.addEventListener("pointermove", mover);
      svg.addEventListener("pointerup", soltar);
      svg.addEventListener("pointercancel", soltar);
      return;
    }
    if (s.herramienta === "cortar") {
      if (!Array.isArray(s.pendiente)) {
        s.pendiente = q;
        s.aviso = null;
        return c.pintar();
      }
      const a = s.pendiente as Punto, b = enderezar(a, q);
      s.pendiente = null;
      // menos de unos 14 píxeles entre los dos puntos es un doble clic, no una línea
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 14 / svg.getScreenCTM()!.a) return c.avisar("Los dos puntos están muy juntos: marcá el segundo más lejos.", true);
      try {
        c.anotar();
        const r = await cortarPorLinea(l, a, b, c.autor(), c.hoy());
        s.sel = r.nuevas[0].id; s.selBorde = null; s.herramienta = "mover";
        const cuantas = r.nuevas.length / 2;
        c.avisar(`${cuantas === 1 ? `Cortada en dos: «${r.nuevas[0].nombre}» y «${r.nuevas[1].nombre}».` : `${cuantas} piezas cortadas con la misma línea.`} Quitá las partes que no uses.`
          + (r.noCortadas.length ? ` No se cortó: ${r.noCortadas.join(", ")} (la línea no la atraviesa una sola vez).` : "")
          + (r.costurasSueltas ? ` Se soltaron ${r.costurasSueltas} costuras.` : "") + " Ctrl+Z deshace.");
      } catch (err) {
        s.historial.pop(); // no cambió nada: no hay qué deshacer
        c.avisar((err as Error).message, true);
      }
      return;
    }
    // coser
    if (!id || !borde) return c.avisar("Tocá sobre un borde de una pieza.", true);
    if (s.pendiente === null || Array.isArray(s.pendiente)) {
      s.pendiente = { pieza: id, borde };
      s.sel = id; s.selBorde = borde; s.aviso = null;
      return c.pintar();
    }
    const primero = s.pendiente as { pieza: string; borde: string };
    s.pendiente = null;
    try {
      c.anotar();
      const nueva = coser(l, primero, { pieza: id, borde });
      const e2 = estadoDeCosturas(l).find((x) => x.costura.id === nueva.id)!;
      c.avisar(e2.analisis.dentroDeTolerancia
        ? `Costura hecha: los dos bordes miden ${cm(e2.analisis.largoA)}.`
        : `Costura hecha, pero no miden lo mismo: ${cm(e2.analisis.largoA)} y ${cm(e2.analisis.largoB)}. Mirá el panel de costuras.`, !e2.analisis.dentroDeTolerancia);
    } catch (err) {
      s.historial.pop();
      c.avisar((err as Error).message, true);
    }
  });
  svg.addEventListener("pointermove", (e) => {
    if (s.herramienta !== "cortar" || !Array.isArray(s.pendiente)) return;
    const a = s.pendiente as Punto, b = enderezar(a, enLienzo(e));
    // se dibuja larga, porque lo que corta es la recta entera
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, k = ancho * 2 / L;
    previa.setAttribute("x1", String(a[0] - dx * k)); previa.setAttribute("y1", String(a[1] - dy * k));
    previa.setAttribute("x2", String(a[0] + dx * k)); previa.setAttribute("y2", String(a[1] + dy * k));
    previa.setAttribute("visibility", "visible");
  });

  const herramientas: [Herramienta, string][] = [["mover", "Mover"], ["cortar", "Cortar"], ["coser", "Coser"]];
  return el("div", { className: "panel" },
    el("div", { className: "fila", role: "group", "aria-label": "Herramienta" },
      ...herramientas.map(([id, t]) => el("button", {
        type: "button", className: `herramienta${s.herramienta === id ? " elegido" : ""}`, "aria-pressed": String(s.herramienta === id),
        onclick: () => { s.herramienta = id; s.pendiente = null; s.aviso = null; c.pintar(); },
      }, t)),
      el("button", { type: "button", className: "herramienta", title: "Deshacer (Ctrl+Z)", disabled: !s.historial.length, onclick: () => c.deshacer() }, "Deshacer"),
      el("button", { type: "button", className: "herramienta", title: "Rehacer (Ctrl+Y)", disabled: !s.rehacer.length, onclick: () => c.rehacer() }, "Rehacer")),
    el("span", { className: "ayuda" }, AYUDA[s.herramienta]),
    el("div", { className: "lienzo-piezas" }, svg),
    el("ul", { className: "leyenda-pt" },
      ...[["costura", "costura"], ["dobladillo", "dobladillo"], ["doblez", "al doblez"]].map(([k, t]) =>
        el("li", {}, el("span", { className: "muestra-pt", style: `background:${COLOR_BORDE[k]}` }), t)),
      el("li", {}, el("span", { className: "muestra-pt", style: "background:#8a8478" }), "línea de corte, con margen"),
      el("li", {}, el("span", { className: "muestra-pt", style: "background:#0d8089" }), "costura entre piezas")));
}

function panelDePieza(c: Ctx, p: PiezaL): HTMLElement {
  const { s } = c;
  const nombre = el("input", { type: "text", value: p.nombre, onchange: (e: Event) => { c.anotar(); p.nombre = (e.target as HTMLInputElement).value.trim() || p.nombre; c.pintar(); } });
  const cantidad = el("input", { type: "number", min: "1", step: "1", value: String(p.cantidad), onchange: (e: Event) => { c.anotar(); p.cantidad = Math.max(1, Math.round(Number((e.target as HTMLInputElement).value) || 1)); c.pintar(); } });
  const cambiar = async (bordeId: string, cambio: { tipo?: TipoBorde; margen_mm?: number }) => {
    c.anotar();
    await editarBorde(p, bordeId, cambio, c.hoy());
    c.pintar();
  };
  return el("div", { className: "panel" },
    el("h2", {}, "Pieza elegida"),
    campo("Nombre", nombre),
    campo("Cuántas se cortan", cantidad),
    p.procedencia ? el("span", { className: "ayuda" }, `Viene de: ${p.procedencia} · talle ${etiquetaDeTalle(p.fragmento.talle_base as string)}`) : null,
    el("h2", {}, "Bordes"),
    el("ul", { className: "bordes-l" }, ...p.fragmento.bordes.map((b) => {
      const editable = b.tipo === "costura" || b.tipo === "dobladillo";
      return el("li", { className: s.selBorde === b.id ? "elegido" : "" },
        el("button", { type: "button", className: "nombre-borde", onclick: () => { s.selBorde = b.id; c.pintar(); } },
          el("strong", {}, b.id), ` ${nombreDeEtiqueta(b.etiqueta)} · ${cm(largoDeBorde(p.fragmento, b.id))}`),
        editable
          ? el("div", { className: "fila" },
            selector(b.tipo as "costura" | "dobladillo", [["costura", "costura"], ["dobladillo", "dobladillo"]], (v) => cambiar(b.id, { tipo: v })),
            el("label", { className: "margen" }, "margen",
              el("input", { type: "number", min: "0", step: "0.5", value: String((b.margen_mm ?? 0) / 10), "aria-label": `Margen de ${b.id} en centímetros`,
                onchange: (e: Event) => cambiar(b.id, { margen_mm: Math.max(0, Math.round(Number((e.target as HTMLInputElement).value) * 10)) }) }), "cm"))
          : el("span", { className: "ayuda" }, b.tipo === "doblez" ? "va al doblez de la tela: sin margen" : b.tipo));
    })),
    boton("Quitar esta pieza", () => {
      c.anotar();
      const sueltas = quitarPieza(s.lienzo, p.id);
      s.sel = null; s.selBorde = null;
      c.avisar(`Quitaste «${p.nombre}».${sueltas ? ` Se soltaron ${sueltas} costuras.` : ""} Ctrl+Z deshace.`);
    }));
}

function panelDeCosturas(c: Ctx): HTMLElement | null {
  const estados = estadoDeCosturas(c.s.lienzo);
  if (!estados.length) return null;
  return el("div", { className: "panel" }, el("h2", {}, "Costuras"),
    el("ul", { className: "costuras-l" }, ...estados.map((e, i) => {
      const a = e.analisis, declarada = Math.abs(e.costura.embebido_mm) > 0.005;
      const largos = `${cm(a.largoA)} y ${cm(a.largoB)}`;
      return el("li", { className: a.dentroDeTolerancia ? "" : "mal" },
        el("strong", {}, `${i + 1}. ${e.nombreA} con ${e.nombreB}`),
        a.dentroDeTolerancia
          ? el("span", {}, declarada ? `${largos}: ${cm(Math.abs(e.costura.embebido_mm))} de diferencia, declarados como frunce o embebido.` : `Miden lo mismo: ${cm(a.largoA)}.`)
          : el("span", {}, `${largos}: sobran ${cm(Math.abs(a.desvio))} en ${a.sobra === "a" ? e.nombreA : e.nombreB}.`),
        el("div", { className: "fila" },
          !a.dentroDeTolerancia ? boton("Es a propósito: se frunce o se embebe", () => {
            c.anotar();
            e.costura.embebido_mm = Math.round((a.largoA - a.largoB) * 100) / 100;
            c.pintar();
          }) : null,
          declarada ? boton("Quitar la declaración", () => { c.anotar(); e.costura.embebido_mm = 0; c.pintar(); }) : null,
          boton("Quitar costura", () => { c.anotar(); c.s.lienzo.costuras = c.s.lienzo.costuras.filter((x) => x.id !== e.costura.id); c.pintar(); })));
    })),
    estados.some((e) => !e.analisis.dentroDeTolerancia)
      ? el("span", { className: "ayuda" }, "Si la diferencia no es a propósito, cortá de nuevo o cambiá de talle una de las piezas. Ajustar el largo de un borde desde acá todavía no está.")
      : null);
}

export function pantallaMolde(c: Ctx): HTMLElement {
  const { s } = c, elegida = piezaDe(s.lienzo, s.sel);
  return el("section", { className: "pantalla" },
    el("div", { className: "encabezado" }, el("h1", {}, c.nombre()),
      el("p", {}, "PATTRN arma el molde con piezas de Patternpedia. Después podés corregirlo a mano, si querés.")),
    panelDelPlan(c),
    panelTraer(c),
    el("div", { className: "dos-columnas" },
      el("div", { className: "ancha" }, lienzo(c)),
      el("div", { className: "angosta columna" },
        elegida ? panelDePieza(c, elegida) : s.lienzo.piezas.length ? el("div", { className: "panel" }, el("h2", {}, `${s.lienzo.piezas.length} piezas en el lienzo`),
          el("ul", { className: "lista-piezas" }, ...s.lienzo.piezas.map((p) => el("li", {},
            el("button", { type: "button", className: "nombre-borde", onclick: () => { s.sel = p.id; s.selBorde = null; c.pintar(); } }, p.nombre),
            el("span", { className: "ayuda" }, `cortar ${p.cantidad}`))))) : null,
        panelDeCosturas(c),
        c.referencia(),
        boton("Seguir: descargar", () => c.ir("descargas"), "primario", !s.lienzo.piezas.length))));
}
