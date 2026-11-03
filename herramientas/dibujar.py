"""Dibuja fragmentos y moldes PATTRN como SVG, para verificarlos a ojo.

Uso:
    python herramientas/dibujar.py esquemas/ejemplos/*.json -o esquemas/ejemplos/dibujos

Los fragmentos que referencia un molde se buscan como <id>.json en la misma
carpeta del molde. Es una vista previa: el margen se dibuja sin resolver las
esquinas y las fusiones se muestran sin aplicar su resolución.
"""
import argparse
import html
import json
import math
from pathlib import Path

COLOR = {
    "costura": "#1f5fbf",
    "doblez": "#7b3fa0",
    "union": "#e07b00",
    "terminado": "#1a8a4a",
}
ESTILO = {
    "costura": 'stroke-width="2.2"',
    "doblez": 'stroke-width="2.2" stroke-dasharray="14 4 3 4"',
    "union": 'stroke-width="2.4" stroke-dasharray="9 5"',
    "terminado": 'stroke-width="5"',
}
INCIERTO = "#c0392b"
AVISO = "#d62828"
RELLENOS = ["#eaf2fb", "#fbf1e6", "#eef7ef", "#f4eefa"]
MUESTRAS = 240


# ---------------------------------------------------------------- geometría

def bezier(p0, c1, c2, p1, t):
    u = 1 - t
    return (u**3 * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t**3 * p1[0],
            u**3 * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t**3 * p1[1])


def transformar(p, tr):
    """Espejo sobre el eje y, rotación y traslación, en ese orden."""
    if tr is None:
        return tuple(p)
    x, y = p
    if tr["espejo"]:
        x = -x
    a = math.radians(tr["rotacion_grados"])
    x, y = x * math.cos(a) - y * math.sin(a), x * math.sin(a) + y * math.cos(a)
    return (x + tr["traslacion"][0], y + tr["traslacion"][1])


def polilinea_borde(frag, borde, tr=None):
    p0, p1 = frag["vertices"][borde["de"]], frag["vertices"][borde["a"]]
    if "curva" in borde:
        c = borde["curva"]
        pts = [bezier(p0, c["c1"], c["c2"], p1, i / MUESTRAS) for i in range(MUESTRAS + 1)]
    else:
        pts = [tuple(p0), tuple(p1)]
    return [transformar(p, tr) for p in pts]


def largo(pts):
    return sum(math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1))


def en_distancia(pts, s):
    """Punto y tangente unitaria a distancia s sobre la polilínea."""
    acum = 0.0
    for i in range(len(pts) - 1):
        d = math.dist(pts[i], pts[i + 1])
        if acum + d >= s or i == len(pts) - 2:
            t = 0 if d == 0 else min(max((s - acum) / d, 0), 1)
            x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t
            y = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t
            return (x, y), ((pts[i + 1][0] - pts[i][0]) / d, (pts[i + 1][1] - pts[i][1]) / d)
        acum += d


def area_con_signo(pts):
    return sum(pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1] for i in range(len(pts) - 1)) / 2


def adentro_de(p, poligono):
    x, y = p
    dentro = False
    for i in range(len(poligono) - 1):
        (x1, y1), (x2, y2) = poligono[i], poligono[i + 1]
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
            dentro = not dentro
    return dentro


def contorno(frag, tr=None):
    pts = []
    for b in frag["bordes"]:
        pts.extend(polilinea_borde(frag, b, tr)[:-1])
    return pts + [pts[0]]


def centroide(pts):
    a = area_con_signo(pts)
    cx = sum((pts[i][0] + pts[i + 1][0]) * (pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1])
             for i in range(len(pts) - 1)) / (6 * a)
    cy = sum((pts[i][1] + pts[i + 1][1]) * (pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1])
             for i in range(len(pts) - 1)) / (6 * a)
    return (cx, cy)


def cm(mm):
    return f"{mm / 10:.2f}".replace(".", ",") + " cm"


def esc(t):
    return html.escape(str(t), quote=True)


# ---------------------------------------------------------------- lienzo SVG

class Lienzo:
    """Acumula elementos en mm con y hacia arriba; los vuelca con y hacia abajo."""

    def __init__(self):
        self.items = []  # (orden, función que recibe el mapeo y devuelve svg)
        self.xs, self.ys = [], []
        self.cajas = []  # rótulos ya ubicados: (x0, x1, y0, y1)

    def libre(self, caja):
        return all(caja[1] < c[0] or caja[0] > c[1] or caja[3] < c[2] or caja[2] > c[3] for c in self.cajas)

    def extender(self, pts):
        for x, y in pts:
            self.xs.append(x)
            self.ys.append(y)

    def agregar(self, f, z=1):
        self.items.append((z, f))

    def svg(self, encabezado, leyenda, pie=None):
        pad = 70
        minx, maxx = min(self.xs) - pad, max(self.xs) + pad
        miny, maxy = min(self.ys) - pad, max(self.ys) + pad
        alto_enc = 22 * len(encabezado) + 30
        ancho = max(maxx - minx, 620)
        # leyenda en filas y pie cortado a lo ancho
        filas, fila, usado = [], [], 0
        for nombre, muestra in leyenda:
            w = 46 + 7.2 * len(nombre) + 22
            if fila and usado + w > ancho - 40:
                filas.append(fila)
                fila, usado = [], 0
            fila.append((nombre, muestra))
            usado += w
        filas.append(fila)
        por_linea = int((ancho - 40) / 6.6)
        lineas_pie = []
        for linea in pie or []:
            sangria = ""
            while len(linea) > por_linea:
                corte = linea.rfind(" ", 0, por_linea)
                corte = corte if corte > 0 else por_linea
                lineas_pie.append(sangria + linea[:corte])
                linea = linea[corte:].lstrip()
                sangria = "⚠   " if lineas_pie[-1].startswith("⚠") else "    "
            lineas_pie.append(sangria + linea)
        pie = lineas_pie
        alto_pie = 40 + 26 * len(filas) + 20 * len(pie)
        alto = alto_enc + (maxy - miny) + alto_pie
        off_x = (ancho - (maxx - minx)) / 2

        def m(p):
            return (p[0] - minx + off_x, alto_enc + (maxy - p[1]))

        out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {ancho:.1f} {alto:.1f}" '
               f'width="{ancho:.0f}" height="{alto:.0f}" font-family="Helvetica, Arial, sans-serif">',
               f'<rect width="100%" height="100%" fill="#ffffff"/>']
        for i, linea in enumerate(encabezado):
            peso, tam = ("bold", 19) if i == 0 else ("normal", 13)
            out.append(f'<text x="20" y="{30 + 22 * i}" font-size="{tam}" font-weight="{peso}" fill="#222">{esc(linea)}</text>')
        for _, f in sorted(self.items, key=lambda it: it[0]):
            out.append(f(m))
        y0 = alto - alto_pie + 25
        for fila in filas:
            x = 20
            for nombre, muestra in fila:
                out.append(muestra(x, y0))
                out.append(f'<text x="{x + 46}" y="{y0 + 4}" font-size="12" fill="#333">{esc(nombre)}</text>')
                x += 46 + 7.2 * len(nombre) + 22
            y0 += 26
        for i, linea in enumerate(pie):
            color = AVISO if linea.startswith("⚠") else "#333"
            texto = linea[1:] if linea.startswith("⚠   ") else linea
            out.append(f'<text x="20" y="{y0 + 12 + 20 * i}" font-size="12.5" fill="{color}" '
                       f'xml:space="preserve">{esc(texto)}</text>')
        out.append("</svg>")
        return "\n".join(out) + "\n"


def pts_svg(m, pts):
    return " ".join(f"{m(p)[0]:.2f},{m(p)[1]:.2f}" for p in pts)


def muestra_linea(tipo):
    return lambda x, y: (f'<line x1="{x}" y1="{y}" x2="{x + 38}" y2="{y}" stroke="{COLOR[tipo]}" '
                         f'{ESTILO[tipo]} fill="none"/>')


LEYENDA = [
    ("costura", muestra_linea("costura")),
    ("doblez", muestra_linea("doblez")),
    ("unión", muestra_linea("union")),
    ("terminado", muestra_linea("terminado")),
    ("incierto", lambda x, y: f'<line x1="{x}" y1="{y}" x2="{x + 38}" y2="{y}" stroke="{INCIERTO}" '
                              f'stroke-width="2" stroke-dasharray="2 4"/>'),
    ("margen (vista previa)", lambda x, y: f'<line x1="{x}" y1="{y}" x2="{x + 38}" y2="{y}" stroke="#999" '
                                           f'stroke-width="1" stroke-dasharray="4 3"/>'),
    ("hilo", lambda x, y: f'<line x1="{x}" y1="{y}" x2="{x + 38}" y2="{y}" stroke="#222" stroke-width="1.6"/>'
                          f'<path d="M{x + 38},{y} l-8,-4 v8 z" fill="#222"/>'),
    ("piquete", lambda x, y: f'<line x1="{x + 19}" y1="{y - 7}" x2="{x + 19}" y2="{y + 7}" stroke="#111" stroke-width="2"/>'),
]


# ---------------------------------------------------------------- fragmento

def dibujar_fragmento(lz, frag, tr=None, relleno="#f3f6fa", rotulo=None, sin_rotulo=frozenset()):
    cont = contorno(frag, tr)
    lz.extender(cont)
    sentido = 1 if area_con_signo(cont) > 0 else -1  # el espejo invierte el contorno

    lz.agregar(lambda m: f'<polygon points="{pts_svg(m, cont)}" fill="{relleno}" stroke="none"/>', 0)

    # el rótulo del hilo se reserva primero para que los de borde lo esquiven
    ph0 = transformar(frag["hilo"]["punto"], tr)
    texto_hilo = f'HILO {frag["hilo"]["angulo_grados"]:g}° · {frag["hilo"]["fuente"].replace("_", " ")}'
    lz.cajas.append((ph0[0] + 5, ph0[0] + 12 + 6.2 * len(texto_hilo), ph0[1] - 8, ph0[1] + 10))
    # la flecha del hilo también es un obstáculo (mismo largo que al dibujarla)
    alto_frag = max(v[1] for v in frag["vertices"].values()) - min(v[1] for v in frag["vertices"].values())
    a0 = math.radians(frag["hilo"]["angulo_grados"])
    pc0 = frag["hilo"]["punto"]
    for k in range(-5, 6):
        q = transformar((pc0[0] + math.cos(a0) * min(240, 0.45 * alto_frag) / 2 * k / 5,
                         pc0[1] + math.sin(a0) * min(240, 0.45 * alto_frag) / 2 * k / 5), tr)
        lz.cajas.append((q[0] - 8, q[0] + 8, q[1] - 8, q[1] + 8))

    textos = []
    for b in frag["bordes"]:
        pts = polilinea_borde(frag, b, tr)
        L = largo(pts)
        tipo = b["tipo"]
        incierto = b.get("certeza", {}).get("estado") == "incierta"

        lz.agregar(lambda m, pts=pts, tipo=tipo: f'<polyline points="{pts_svg(m, pts)}" fill="none" '
                                                 f'stroke="{COLOR[tipo]}" {ESTILO[tipo]} stroke-linejoin="round"/>', 2)
        if incierto:
            lz.agregar(lambda m, pts=pts: f'<polyline points="{pts_svg(m, pts)}" fill="none" stroke="{INCIERTO}" '
                                          f'stroke-width="2" stroke-dasharray="2 4" transform=""/>', 3)

        def normal_ext(t):
            return (t[1] * sentido, -t[0] * sentido)

        if tipo == "costura":
            off = []
            for i in range(len(pts)):
                a, c = pts[max(i - 1, 0)], pts[min(i + 1, len(pts) - 1)]
                d = math.dist(a, c)
                n = normal_ext(((c[0] - a[0]) / d, (c[1] - a[1]) / d))
                off.append((pts[i][0] + n[0] * b["margen_mm"], pts[i][1] + n[1] * b["margen_mm"]))
            lz.extender(off)
            lz.agregar(lambda m, off=off: f'<polyline points="{pts_svg(m, off)}" fill="none" stroke="#999" '
                                          f'stroke-width="1" stroke-dasharray="4 3"/>', 1)

        for pq in b.get("piquetes", []):
            p, t = en_distancia(pts, pq["pos_mm"])
            n = normal_ext(t)
            for k in range(pq.get("cantidad", 1)):
                desp = (k - (pq.get("cantidad", 1) - 1) / 2) * 4
                q = (p[0] + t[0] * desp, p[1] + t[1] * desp)
                ext = (q[0] + n[0] * 12, q[1] + n[1] * 12)
                lz.agregar(lambda m, q=q, ext=ext: f'<line x1="{m(q)[0]:.2f}" y1="{m(q)[1]:.2f}" x2="{m(ext)[0]:.2f}" '
                                                   f'y2="{m(ext)[1]:.2f}" stroke="#111" stroke-width="2.2"/>', 4)
            et = (p[0] + n[0] * 22, p[1] + n[1] * 22)
            etiqueta_pq = f'{pq["id"]} · {cm(pq["pos_mm"])}'
            lz.cajas.append((et[0] - 40, et[0] + 40, et[1] - 8, et[1] + 8))
            lz.agregar(lambda m, et=et, s=etiqueta_pq: f'<text x="{m(et)[0]:.1f}" y="{m(et)[1] + 4:.1f}" font-size="10" '
                                                       f'text-anchor="middle" fill="#111" paint-order="stroke" '
                                                       f'stroke="#ffffff" stroke-width="3">{esc(s)}</text>', 5)

        # rótulo del borde, hacia adentro
        p, t = en_distancia(pts, L / 2)
        n = normal_ext(t)
        adentro = (-n[0], -n[1])
        lineas = [f'{b["id"]} {b["etiqueta"]}{" ?" if incierto else ""}', cm(L)]
        if rotulo:  # en el molde alcanza con nombre y largo: el color ya dice el tipo
            pass
        elif tipo == "terminado":
            tm = b["terminado"]
            lineas.append(f'TERMINADO · {tm["que"]}' + (f' {tm["ancho_mm"]:g} mm' if "ancho_mm" in tm else ""))
        elif tipo == "doblez":
            lineas.append("AL DOBLEZ")
        elif tipo == "union":
            lineas.append("unión")
        else:
            lineas.append(f'margen {b["margen_mm"]:g} mm')
        if b["id"] not in sin_rotulo:  # los bordes fusionados se rotulan con su cota
            textos.append((p, adentro, lineas, INCIERTO if incierto else COLOR[tipo]))

    for p, adentro, lineas, color in textos:
        # el texto crece hacia adentro de la pieza y se corre si choca con otro rótulo
        ancla = "start" if adentro[0] > 0.5 else "end" if adentro[0] < -0.5 else "middle"
        alto = 14 * (len(lineas) - 1)
        dy = -alto if adentro[1] > 0.5 else -alto / 2 if adentro[1] >= -0.5 else 10
        ancho = 6.3 * max(len(s) for s in lineas)
        tang = (adentro[1], -adentro[0])
        candidatos = sorted(((k, s) for k in range(8) for s in range(-90, 91, 15)),
                            key=lambda ks: ks[0] * 8 + abs(ks[1]) * 0.5)
        elegido = None
        for k, s in candidatos:
            q = (p[0] + adentro[0] * (14 + 8 * k) + tang[0] * s,
                 p[1] + adentro[1] * (14 + 8 * k) + tang[1] * s)
            x0 = q[0] if ancla == "start" else q[0] - ancho if ancla == "end" else q[0] - ancho / 2
            caja = (x0, x0 + ancho, q[1] - dy - alto - 3, q[1] - dy + 10)
            centro = ((caja[0] + caja[1]) / 2, (caja[2] + caja[3]) / 2)
            if lz.libre(caja) and adentro_de(centro, cont):
                elegido = (q, caja)
                break
        if elegido is None:  # pieza muy chica: el primer lugar, aunque se encime
            k, s = candidatos[0]
            q = (p[0] + adentro[0] * 14, p[1] + adentro[1] * 14)
            x0 = q[0] if ancla == "start" else q[0] - ancho if ancla == "end" else q[0] - ancho / 2
            elegido = (q, (x0, x0 + ancho, q[1] - dy - alto - 3, q[1] - dy + 10))
        q, caja = elegido
        lz.cajas.append(caja)

        def f(m, q=q, lineas=lineas, color=color, ancla=ancla, dy=dy):
            x, y = m(q)
            y += dy
            spans = "".join(f'<tspan x="{x:.1f}" dy="{0 if i == 0 else 14}"'
                            f'{" font-weight=\"bold\"" if i == 0 else ""}>{esc(s)}</tspan>'
                            for i, s in enumerate(lineas))
            return (f'<text x="{x:.1f}" y="{y:.1f}" font-size="11" text-anchor="{ancla}" fill="{color}" '
                    f'paint-order="stroke" stroke="#ffffff" stroke-width="3" stroke-linejoin="round">{spans}</text>')
        lz.agregar(f, 6)

    # vértices
    for vid, v in frag["vertices"].items():
        p = transformar(v, tr)
        lz.agregar(lambda m, p=p, vid=vid: f'<circle cx="{m(p)[0]:.2f}" cy="{m(p)[1]:.2f}" r="2.5" fill="#555"/>'
                                           f'<text x="{m(p)[0] + 5:.1f}" y="{m(p)[1] - 5:.1f}" font-size="9" fill="#888">{vid}</text>', 7)

    # marcas
    for mk in frag.get("marcas", []):
        if mk["tipo"] == "boton":
            p = transformar(mk["puntos"][0], tr)
            lz.agregar(lambda m, p=p: f'<circle cx="{m(p)[0]:.2f}" cy="{m(p)[1]:.2f}" r="6" fill="none" stroke="#444" stroke-width="1.2"/>'
                                      f'<path d="M{m(p)[0] - 3:.2f},{m(p)[1]:.2f} h6 M{m(p)[0]:.2f},{m(p)[1] - 3:.2f} v6" stroke="#444" stroke-width="1"/>', 4)

    # hilo
    h = frag["hilo"]
    alto = max(v[1] for v in frag["vertices"].values()) - min(v[1] for v in frag["vertices"].values())
    lh = min(240, 0.45 * alto)
    a = math.radians(h["angulo_grados"])
    d = (math.cos(a) * lh / 2, math.sin(a) * lh / 2)
    pc = h["punto"]
    p1 = transformar((pc[0] - d[0], pc[1] - d[1]), tr)
    p2 = transformar((pc[0] + d[0], pc[1] + d[1]), tr)
    ph = transformar(pc, tr)

    def flecha(m, punta, cola):
        (x1, y1), (x2, y2) = m(cola), m(punta)
        ang = math.atan2(y2 - y1, x2 - x1)
        a1, a2 = ang + math.radians(155), ang - math.radians(155)
        return (f'<path d="M{x2:.2f},{y2:.2f} L{x2 + 13 * math.cos(a1):.2f},{y2 + 13 * math.sin(a1):.2f} '
                f'L{x2 + 13 * math.cos(a2):.2f},{y2 + 13 * math.sin(a2):.2f} z" fill="#222"/>')

    def hilo_svg(m):
        s = (f'<line x1="{m(p1)[0]:.2f}" y1="{m(p1)[1]:.2f}" x2="{m(p2)[0]:.2f}" y2="{m(p2)[1]:.2f}" '
             f'stroke="#222" stroke-width="1.6"/>' + flecha(m, p2, p1))
        if not h.get("sentido_unico"):
            s += flecha(m, p1, p2)
        s += f'<circle cx="{m(ph)[0]:.2f}" cy="{m(ph)[1]:.2f}" r="3.5" fill="#222"/>'
        fuente = h["fuente"].replace("_", " ")
        s += (f'<text x="{m(ph)[0] + 9:.1f}" y="{m(ph)[1] + 4:.1f}" font-size="11" fill="#222">'
              f'HILO {h["angulo_grados"]:g}° · {esc(fuente)}{" · sentido único" if h.get("sentido_unico") else ""}</text>')
        return s

    lz.agregar(hilo_svg, 8)

    if rotulo:
        # el nombre de la instancia se ubica último, en el primer lugar libre dentro de la pieza
        w = 7.6 * len(rotulo)
        for dx, dy in sorted(((dx, dy) for dx in range(-120, 121, 20) for dy in range(-200, 201, 20)),
                             key=lambda d: abs(d[0]) + abs(d[1])):
            pr = (ph0[0] + dx, ph0[1] + dy)
            caja = (pr[0] - w / 2, pr[0] + w / 2, pr[1] - 6, pr[1] + 16)
            if lz.libre(caja) and all(adentro_de(c, cont) for c in ((caja[0], caja[2]), (caja[1], caja[3]))):
                lz.cajas.append(caja)
                lz.agregar(lambda m, pr=pr: f'<text x="{m(pr)[0]:.1f}" y="{m(pr)[1]:.1f}" font-size="14" '
                                            f'font-weight="bold" text-anchor="middle" fill="#555" paint-order="stroke" '
                                            f'stroke="#ffffff" stroke-width="3">{esc(rotulo)}</text>', 6)
                break


def encabezado_fragmento(frag):
    o = frag["origen"]
    if o["metodo"] == "foto":
        orig = f'importado desde foto ({o["objeto"].replace("_", " ")}), error estimado ±{o["calibracion"]["error_estimado_mm"]:g} mm'
    elif o["metodo"] == "corte":
        orig = f'corte de {o["padre"]["ref"]}, lado {o["lado"]}'
    elif o["metodo"] == "fusion":
        orig = "fusión de " + ", ".join(p["ref"] for p in o["padres"])
    else:
        orig = "dibujado"
    lineas = [frag["nombre"], f'{frag["id"]}@{frag["version"]} · {orig}']
    if frag.get("donantes"):
        lineas.append("donantes: " + "; ".join(d["descripcion"] for d in frag["donantes"]))
    return lineas


def svg_fragmento(frag):
    lz = Lienzo()
    dibujar_fragmento(lz, frag)
    o = frag["origen"]
    if o["metodo"] == "corte":
        lin = o["linea"]
        pts = [tuple(lin["inicio"])] + [tuple(t["hasta"]) for t in lin["tramos"]]
        lz.extender(pts)
        lz.agregar(lambda m: f'<polyline points="{pts_svg(m, pts)}" fill="none" stroke="#999" stroke-width="1" '
                             f'stroke-dasharray="2 3"/><text x="{m(pts[-1])[0] + 5:.1f}" y="{m(pts[-1])[1] + 4:.1f}" '
                             f'font-size="10" fill="#888">línea de corte</text>', 1)
    return lz.svg(encabezado_fragmento(frag), LEYENDA, pie_fragmento(frag))


def pie_fragmento(frag):
    pie = []
    largos = {b["id"]: largo(polilinea_borde(frag, b)) for b in frag["bordes"]}
    for b in frag["bordes"]:
        if b["tipo"] == "terminado":
            tm = b["terminado"]
            donante = frag["donantes"][tm["donante"]]["descripcion"] if "donante" in tm else "donante sin indicar"
            pie.append(f'terminado {b["id"]} {b["etiqueta"]}: {tm["que"]}'
                       + (f' {tm["ancho_mm"]:g} mm' if "ancho_mm" in tm else "")
                       + f' · {donante} · sin margen, se puede acortar, no alargar')
    for b in frag["bordes"]:
        c = b.get("certeza", {})
        if c.get("estado") == "incierta":
            pie.append(f'⚠ borde_incierto {b["id"]} {b["etiqueta"]}: {c["motivo"].replace("_", " ")}'
                       + (f' ({c["nota"]})' if c.get("nota") else ""))
    o = frag["origen"]
    for med in o.get("medidas_verificadas", []):
        dif = med["largo_mm"] - largos[med["borde"]]
        error = o["calibracion"]["error_estimado_mm"]
        estado = "dentro del error de importación" if abs(dif) <= error else "⚠ medida_no_coincide"
        pie.append(f'cinta {med["borde"]}: {cm(med["largo_mm"])} contra {cm(largos[med["borde"]])} calculado, '
                   f'diferencia {cm(abs(dif))} · {estado}'.lstrip())
    return pie


# ---------------------------------------------------------------- molde

def subpolilinea(pts, s0, s1):
    """Tramo de la polilínea entre las distancias s0 y s1."""
    out = [en_distancia(pts, s0)[0]]
    acum = 0.0
    for i in range(len(pts) - 1):
        acum += math.dist(pts[i], pts[i + 1])
        if s0 < acum < s1:
            out.append(pts[i + 1])
    return out + [en_distancia(pts, s1)[0]]


def dibujar_cota(lz, pts, L, ref, sentido):
    """Línea de cota paralela al borde, hacia adentro de su pieza, con el largo escrito."""
    def interior(p, t, d):
        return (p[0] - t[1] * sentido * d, p[1] + t[0] * sentido * d)

    cota = []
    for i in range(len(pts)):
        a, c = pts[max(i - 1, 0)], pts[min(i + 1, len(pts) - 1)]
        d = math.dist(a, c)
        cota.append(interior(pts[i], ((c[0] - a[0]) / d, (c[1] - a[1]) / d), 16))
    _, t0 = en_distancia(pts, 0)
    _, t1 = en_distancia(pts, L)
    marcas = [(interior(pts[0], t0, 9), interior(pts[0], t0, 23)), (interior(pts[-1], t1, 9), interior(pts[-1], t1, 23))]
    p, t = en_distancia(pts, L / 2)
    texto = f"{ref} · {cm(L)}"
    q = interior(p, t, 30)
    w = 7.2 * len(texto)
    lz.cajas.append((q[0] - w / 2, q[0] + w / 2, q[1] - 10, q[1] + 10))

    def f(m):
        s = f'<polyline points="{pts_svg(m, cota)}" fill="none" stroke="#222" stroke-width="1.2"/>'
        for a, b in marcas:
            s += f'<line x1="{m(a)[0]:.2f}" y1="{m(a)[1]:.2f}" x2="{m(b)[0]:.2f}" y2="{m(b)[1]:.2f}" stroke="#222" stroke-width="1.2"/>'
        return s + (f'<text x="{m(q)[0]:.1f}" y="{m(q)[1] + 5:.1f}" font-size="13" font-weight="bold" text-anchor="middle" '
                    f'fill="#222" paint-order="stroke" stroke="#ffffff" stroke-width="3">{esc(texto)}</text>')
    lz.agregar(f, 9)


def svg_molde(molde, carpeta):
    lz = Lienzo()
    pie = []
    frags = {}
    for i, pieza in enumerate(molde["piezas"]):
        insts = {}
        fusionados = {}
        for fu in pieza.get("fusiones", []):
            for ref in (fu["a"], fu["b"]):
                inst_id, borde_id = ref.split("#")
                fusionados.setdefault(inst_id, set()).add(borde_id)
        for j, inst in enumerate(pieza["instancias"]):
            fid, ver = inst["ref"].split("@")
            frag = json.loads((carpeta / f"{fid}.json").read_text(encoding="utf-8"))
            if frag["version"] != int(ver) or frag["huella"] != inst["huella"]:
                pie.append(f'⚠ {inst["id"]}: el archivo {fid}.json no es la versión {ver} con esa huella')
            insts[inst["id"]] = (frag, inst["transformacion"])
            frags[(pieza["id"], inst["id"])] = (frag, inst["transformacion"])

        for fu in pieza.get("fusiones", []):
            (ia, ba), (ib, bb) = fu["a"].split("#"), fu["b"].split("#")
            fa, ta = insts[ia]
            fb, tb = insts[ib]
            pa = polilinea_borde(fa, next(b for b in fa["bordes"] if b["id"] == ba), ta)
            pb = polilinea_borde(fb, next(b for b in fb["bordes"] if b["id"] == bb), tb)
            la, lb = largo(pa), largo(pb)
            if fu["alineacion"] == "inicio":
                ancla, (qa, qb) = (pa[0], pb[-1]), (pa[-1], pb[0])
            elif fu["alineacion"] == "fin":
                ancla, (qa, qb) = (pa[-1], pb[0]), (pa[0], pb[-1])
            else:
                ancla, (qa, qb) = None, (pa[-1], pb[0])
            dif = lb - la

            # cota de cada borde sobre su propia pieza
            for ref, pts, L, fr, trf in ((fu["a"], pa, la, fa, ta), (fu["b"], pb, lb, fb, tb)):
                sentido = 1 if area_con_signo(contorno(fr, trf)) > 0 else -1
                dibujar_cota(lz, pts, L, ref, sentido)

            # el tramo que sobra, sobre el borde más largo, medido desde la alineación
            if abs(dif) > 0.05:
                largo_pts, corto = (pb, la) if dif > 0 else (pa, lb)
                L_largo = max(la, lb)
                # 'inicio' ancla a.de con b.a: lo que sobra de b está al principio de b, lo de a al final de a
                if fu["alineacion"] == "centro":
                    tramos = [(0, abs(dif) / 2), (L_largo - abs(dif) / 2, L_largo)]
                elif (fu["alineacion"] == "inicio") == (dif > 0):
                    tramos = [(0, abs(dif))]
                else:
                    tramos = [(corto, L_largo)]
                quien = fu["b"] if dif > 0 else fu["a"]
                for s0, s1 in tramos:
                    seg = subpolilinea(largo_pts, s0, s1)
                    lz.agregar(lambda m, seg=seg: f'<polyline points="{pts_svg(m, seg)}" fill="none" stroke="{AVISO}" '
                                                  f'stroke-width="7" stroke-opacity="0.55" stroke-linecap="butt"/>', 9)
                fin = max(subpolilinea(largo_pts, *tramos[-1]), key=lambda p: p[0])
                texto = f"sobran {cm(abs(dif))} en {quien}"
                lz.cajas.append((fin[0] + 10, fin[0] + 10 + 7.5 * len(texto), fin[1] - 10, fin[1] + 10))
                lz.extender([(fin[0] + 10 + 7.5 * len(texto), fin[1])])
                lz.agregar(lambda m, fin=fin, texto=texto: f'<text x="{m(fin)[0] + 14:.1f}" y="{m(fin)[1] + 5:.1f}" '
                                                           f'font-size="14" font-weight="bold" fill="{AVISO}">{esc(texto)}</text>', 10)
            r = fu["resolucion"]
            res = "sin resolver (solo aviso)" if r["modo"] == "ninguna" else \
                f'{r["modo"].replace("_", " ")} aceptada {r["aceptada"]}, no aplicada en este dibujo'
            pie.append(f'⚠ union_distinta {fu["a"]} ↔ {fu["b"]}: {cm(la)} contra {cm(lb)}, '
                       f'diferencia {cm(abs(dif))} · {res}')
            if ancla and math.dist(*ancla) > 0.05:
                pie.append(f'⚠ los bordes no coinciden en el punto de alineación: separación {cm(math.dist(*ancla))}')

            def extremos(m, qa=qa, qb=qb):
                return "".join(f'<circle cx="{m(q)[0]:.2f}" cy="{m(q)[1]:.2f}" r="5" fill="none" stroke="{AVISO}" '
                               f'stroke-width="2"/>' for q in (qa, qb))
            lz.agregar(extremos, 10)

        # las instancias se dibujan después de las cotas, para que sus rótulos las esquiven
        for j, inst in enumerate(pieza["instancias"]):
            frag, tr = insts[inst["id"]]
            dibujar_fragmento(lz, frag, tr, RELLENOS[(i + j) % len(RELLENOS)],
                              f'{inst["id"]} · {frag["id"]}@{frag["version"]}',
                              frozenset(fusionados.get(inst["id"], ())))

    pie.insert(0, "instancias: " + "; ".join(f'{inst} = {frag["id"]}@{frag["version"]} ({frag["nombre"]})'
                                             for (_, inst), (frag, _) in frags.items()))

    # avisos que el dibujo puede calcular
    cosidos = {(c[l]["pieza"], ref) for c in molde.get("costuras", []) for l in ("a", "b") for ref in c[l]["bordes"]}
    sin_pareja, inciertos = [], []
    for (pieza, inst), (frag, _) in frags.items():
        for b in frag["bordes"]:
            ref = f'{inst}#{b["id"]}'
            if b["tipo"] == "costura" and (pieza, ref) not in cosidos:
                sin_pareja.append(f'{ref} ({b["etiqueta"]})')
            if b.get("certeza", {}).get("estado") == "incierta":
                inciertos.append(f'{ref} ({b["etiqueta"]}): {b["certeza"]["motivo"].replace("_", " ")}')
    for s in inciertos:
        pie.append(f"⚠ borde_incierto {s}")
    if sin_pareja:
        pie.append("costura_sin_pareja (el molde no tiene espalda todavía): " + ", ".join(sin_pareja))

    enc = [molde["nombre"], f'{molde["id"]} · talle {molde.get("talle", "—")} · '
                            f'{len(molde["piezas"])} pieza(s), {len(frags)} instancia(s)']
    return lz.svg(enc, LEYENDA, pie)


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("archivos", nargs="+", type=Path)
    ap.add_argument("-o", "--salida", type=Path, required=True)
    args = ap.parse_args()
    args.salida.mkdir(parents=True, exist_ok=True)
    svgs = []
    # fragmentos primero, moldes al final
    docs = [(f, json.loads(f.read_text(encoding="utf-8"))) for f in args.archivos]
    for f, doc in sorted(docs, key=lambda fd: fd[1]["tipo"] != "fragmento"):
        svg = svg_fragmento(doc) if doc["tipo"] == "fragmento" else svg_molde(doc, f.parent)
        destino = args.salida / f"{f.stem}.svg"
        destino.write_text(svg, encoding="utf-8")
        svgs.append(svg)
        print(destino)
    # página única con los SVG en línea, para verlos todos sin servidor
    secciones = "\n".join(f"<section>{s}</section>" for s in svgs)
    (args.salida / "index.html").write_text(
        '<!doctype html>\n<html lang="es"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1"><title>PATTRN dibujos</title>'
        "<style>body{margin:0;padding:16px;background:#f2f2f2;font-family:Helvetica,Arial,sans-serif}"
        "section{background:#fff;margin:0 0 16px;padding:8px;border-radius:6px}"
        "section svg{display:block;max-width:100%;max-height:96vh;width:auto;height:auto;margin:0 auto}</style>"
        f"</head><body>\n{secciones}\n</body></html>\n", encoding="utf-8")


if __name__ == "__main__":
    main()
