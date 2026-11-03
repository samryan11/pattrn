"""Genera los ejemplos de esquemas/ejemplos con geometría y huellas reales. Uso: generar_ejemplos.py <carpeta>"""
import hashlib, json, math, sys
from pathlib import Path

DEST = Path(sys.argv[1])
DEST.mkdir(parents=True, exist_ok=True)


def r(x):
    return round(x + 0.0, 2)


def norm(o):
    # Aproximación de RFC 8785 suficiente para estos datos: claves ordenadas,
    # sin espacios, enteros sin ".0".
    if isinstance(o, dict):
        return {k: norm(v) for k, v in o.items()}
    if isinstance(o, list):
        return [norm(v) for v in o]
    if isinstance(o, float):
        o = round(o, 2)
        return int(o) if o == int(o) else o
    return o


def huella(f):
    nucleo = {k: f[k] for k in ("hilo", "vertices", "bordes", "marcas", "escalado") if k in f}
    s = json.dumps(norm(nucleo), sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return "sha256:" + hashlib.sha256(s.encode("utf-8")).hexdigest()


def bez(p0, c1, c2, p1, t):
    u = 1 - t
    return [u**3 * p0[i] + 3 * u * u * t * c1[i] + 3 * u * t * t * c2[i] + t**3 * p1[i] for i in (0, 1)]


def split(p0, c1, c2, p1, t):
    lerp = lambda a, b: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    a, b, c = lerp(p0, c1), lerp(c1, c2), lerp(c2, p1)
    d, e = lerp(a, b), lerp(b, c)
    m = lerp(d, e)
    return (p0, a, d, m), (m, e, c, p1)


def largo_bez(p0, c1, c2, p1, n=2000):
    pts = [bez(p0, c1, c2, p1, i / n) for i in range(n + 1)]
    return sum(math.dist(pts[i], pts[i + 1]) for i in range(n))


def t_en_y(p0, c1, c2, p1, y):
    lo, hi = 0.0, 1.0  # y crece monótona en este tramo
    for _ in range(80):
        mid = (lo + hi) / 2
        if bez(p0, c1, c2, p1, mid)[1] < y:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def pt(p):
    return [r(p[0]), r(p[1])]


def guardar(nombre, obj):
    (DEST / nombre).write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


ID_A, ID_B, ID_C, ID_D = "frg-oxf7a2c1", "frg-oxf9k3b2", "frg-oxf9k3b3", "frg-cua4m8d1"
AUTORIA = {"autor": "PATTRN ejemplo", "fecha_creacion": "2026-11-03", "fecha_version": "2026-11-03"}
DONANTE_OXF = [{"descripcion": "camisa Oxford celeste de hombre", "talle": "L", "composicion": "100% algodón"}]

# ---------------------------------------------------------------- A: importado desde foto
V = {"v1": [0, 0], "v2": [255, 0], "v3": [265, 460], "v4": [205, 640], "v5": [75, 690], "v6": [0, 610]}
SISA_C1, SISA_C2 = [240, 500], [215, 580]
ESC_C1, ESC_C2 = [70, 640], [35, 612]
TAPETA = {"que": "tapeta", "descripcion": "tapeta con ojales, doble pespunte", "ancho_mm": 32, "donante": 0}
RUEDO = {"que": "ruedo", "descripcion": "ruedo curvo de camisa", "ancho_mm": 6, "donante": 0}

A = {
    "pattrn": "0.1", "tipo": "fragmento", "id": ID_A, "version": 1, "huella": None,
    "nombre": "Delantero camisa Oxford (mitad derecha)", "unidades": "mm", "licencia": "CC-BY-SA-4.0",
    "autoria": AUTORIA,
    "origen": {
        "metodo": "foto", "foto": "import-0142.jpg", "objeto": "prenda_plana",
        "calibracion": {"referencia": "regla", "largo_referencia_mm": 300, "error_estimado_mm": 0.8,
                        "tolerancia_ajuste_curvas_mm": 0.3},
        "medidas_verificadas": [{"borde": "b3", "largo_mm": 191.0}],
    },
    "donantes": DONANTE_OXF, "talle_base": "L",
    "hilo": {"punto": [130, 300], "angulo_grados": 90, "fuente": "deducido_de_tela", "sentido_unico": False},
    "vertices": V,
    "bordes": [
        {"id": "b1", "de": "v1", "a": "v2", "etiqueta": "ruedo", "tipo": "terminado", "terminado": RUEDO,
         "importacion": {"margen_en_contorno": 0}},
        {"id": "b2", "de": "v2", "a": "v3", "etiqueta": "lateral", "tipo": "costura", "margen_mm": 10,
         "importacion": {"margen_en_contorno": 0}},
        {"id": "b3", "de": "v3", "a": "v4", "curva": {"tipo": "bezier", "c1": SISA_C1, "c2": SISA_C2},
         "etiqueta": "sisa", "tipo": "costura", "margen_mm": 10,
         "importacion": {"margen_en_contorno": 0},
         "piquetes": [{"id": "p1", "pos_mm": 120.0, "cantidad": 1, "nota": "delantero: 1 piquete"}]},
        {"id": "b4", "de": "v4", "a": "v5", "etiqueta": "hombro", "tipo": "costura", "margen_mm": 10,
         "importacion": {"margen_en_contorno": 0}},
        {"id": "b5", "de": "v5", "a": "v6", "curva": {"tipo": "bezier", "c1": ESC_C1, "c2": ESC_C2},
         "etiqueta": "escote", "tipo": "costura", "margen_mm": 7,
         "importacion": {"margen_en_contorno": "no_se"},
         "certeza": {"estado": "incierta", "motivo": "margen_desconocido",
                     "nota": "el cuello tapa la costura en la foto"}},
        {"id": "b6", "de": "v6", "a": "v1", "etiqueta": "centro_frente", "tipo": "terminado", "terminado": TAPETA,
         "importacion": {"margen_en_contorno": 0}},
    ],
    "marcas": [{"id": f"m{i+1}", "tipo": "boton", "puntos": [[16, y]]} for i, y in enumerate([90, 200, 310, 420, 530])],
    "escalado": {"metodo": "deltas", "talles": {}},
}
A["huella"] = huella(A)
guardar(f"{ID_A}.json", A)

# ---------------------------------------------------------------- corte horizontal a y = 520
Y = 520
p0, p1 = V["v3"], V["v4"]
t = t_en_y(p0, SISA_C1, SISA_C2, p1, Y)
abajo, arriba = split(p0, SISA_C1, SISA_C2, p1, t)
P_sisa = pt(abajo[3]); P_sisa[1] = Y
P_cf = [0, Y]
largo_sisa_abajo = largo_bez(*abajo)
largo_corte = P_sisa[0]
ref_A = f"{ID_A}@1"
linaje_A = [{"ref": ref_A, "nombre": A["nombre"], "autor": AUTORIA["autor"], "licencia": "CC-BY-SA-4.0",
             "publicado": False}]
linea = {"inicio": [-10, Y], "tramos": [{"hasta": [290, Y]}]}
identidad = {"traslacion": [0, 0], "rotacion_grados": 0, "espejo": False}


def origen_corte(lado, hermano):
    return {"metodo": "corte", "padre": {"ref": ref_A, "huella": A["huella"]}, "linea": linea, "lado": lado,
            "hermanos": [hermano], "transformacion": identidad, "nota": "canesú para combinar con otra tela"}


borde_corte = {"etiqueta": "canesu", "tipo": "union", "procedencia": {"nacido_de_corte": True}}

# B: lado izquierda de la línea (+y, arriba)
pos_piq = 120.0 - largo_sisa_abajo
B = {
    "pattrn": "0.1", "tipo": "fragmento", "id": ID_B, "version": 1, "huella": None,
    "nombre": "Delantero camisa Oxford (mitad derecha) · corte canesú · lado A",
    "unidades": "mm", "licencia": "CC-BY-SA-4.0", "autoria": AUTORIA,
    "origen": origen_corte("izquierda", ID_C), "linaje": linaje_A, "donantes": DONANTE_OXF, "talle_base": "L",
    "hilo": {"punto": [110, 600], "angulo_grados": 90, "fuente": "deducido_de_tela", "sentido_unico": False},
    "vertices": {"v1": P_cf, "v2": P_sisa, "v3": V["v4"], "v4": V["v5"], "v5": V["v6"]},
    "bordes": [
        {"id": "b1", "de": "v1", "a": "v2", **borde_corte},
        {"id": "b2", "de": "v2", "a": "v3", "curva": {"tipo": "bezier", "c1": pt(arriba[1]), "c2": pt(arriba[2])},
         "etiqueta": "sisa", "tipo": "costura", "margen_mm": 10, "procedencia": {"heredado_de": "b3"},
         "piquetes": [{"id": "p1", "pos_mm": r(pos_piq), "cantidad": 1, "nota": "delantero: 1 piquete"}]},
        {"id": "b3", "de": "v3", "a": "v4", "etiqueta": "hombro", "tipo": "costura", "margen_mm": 10,
         "procedencia": {"heredado_de": "b4"}},
        {"id": "b4", "de": "v4", "a": "v5", "curva": {"tipo": "bezier", "c1": ESC_C1, "c2": ESC_C2},
         "etiqueta": "escote", "tipo": "costura", "margen_mm": 7, "procedencia": {"heredado_de": "b5"},
         "certeza": {"estado": "incierta", "motivo": "margen_desconocido",
                     "nota": "el cuello tapa la costura en la foto"}},
        {"id": "b5", "de": "v5", "a": "v1", "etiqueta": "centro_frente", "tipo": "terminado", "terminado": TAPETA,
         "procedencia": {"heredado_de": "b6"}},
    ],
    "marcas": [{"id": "m1", "tipo": "boton", "puntos": [[16, 530]]}],
    "escalado": {"metodo": "deltas", "talles": {}},
}
B["huella"] = huella(B)
guardar(f"{ID_B}.json", B)

# C: lado derecha (abajo)
C = {
    "pattrn": "0.1", "tipo": "fragmento", "id": ID_C, "version": 1, "huella": None,
    "nombre": "Delantero camisa Oxford (mitad derecha) · corte canesú · lado B",
    "unidades": "mm", "licencia": "CC-BY-SA-4.0", "autoria": AUTORIA,
    "origen": origen_corte("derecha", ID_B), "linaje": linaje_A, "donantes": DONANTE_OXF, "talle_base": "L",
    "hilo": {"punto": [130, 300], "angulo_grados": 90, "fuente": "deducido_de_tela", "sentido_unico": False},
    "vertices": {"v1": V["v1"], "v2": V["v2"], "v3": V["v3"], "v4": P_sisa, "v5": P_cf},
    "bordes": [
        {"id": "b1", "de": "v1", "a": "v2", "etiqueta": "ruedo", "tipo": "terminado", "terminado": RUEDO,
         "procedencia": {"heredado_de": "b1"}},
        {"id": "b2", "de": "v2", "a": "v3", "etiqueta": "lateral", "tipo": "costura", "margen_mm": 10,
         "procedencia": {"heredado_de": "b2"}},
        {"id": "b3", "de": "v3", "a": "v4", "curva": {"tipo": "bezier", "c1": pt(abajo[1]), "c2": pt(abajo[2])},
         "etiqueta": "sisa", "tipo": "costura", "margen_mm": 10, "procedencia": {"heredado_de": "b3"}},
        {"id": "b4", "de": "v4", "a": "v5", **borde_corte},
        {"id": "b5", "de": "v5", "a": "v1", "etiqueta": "centro_frente", "tipo": "terminado", "terminado": TAPETA,
         "procedencia": {"heredado_de": "b6"}},
    ],
    "marcas": [{"id": f"m{i+1}", "tipo": "boton", "puntos": [[16, y]]} for i, y in enumerate([90, 200, 310, 420])],
    "escalado": {"metodo": "deltas", "talles": {}},
}
C["huella"] = huella(C)
guardar(f"{ID_C}.json", C)

# ---------------------------------------------------------------- D: parte inferior de otra donante
D = {
    "pattrn": "0.1", "tipo": "fragmento", "id": ID_D, "version": 2, "version_anterior": 1, "huella": None,
    "nombre": "Delantero inferior camisa a cuadros", "unidades": "mm", "licencia": "CC-BY-SA-4.0",
    "autoria": {"autor": "PATTRN ejemplo", "fecha_creacion": "2026-10-28", "fecha_version": "2026-11-03"},
    "origen": {"metodo": "dibujado"},
    "donantes": [{"descripcion": "camisa de franela a cuadros", "talle": "XL"}], "talle_base": "L",
    "hilo": {"punto": [125, 190], "angulo_grados": 90, "fuente": "declarado", "sentido_unico": False},
    "vertices": {"v1": [0, 0], "v2": [250, 0], "v3": [262, 380], "v4": [0, 380]},
    "bordes": [
        {"id": "b1", "de": "v1", "a": "v2", "etiqueta": "ruedo", "tipo": "terminado",
         "terminado": {"que": "ruedo", "ancho_mm": 8, "donante": 0}},
        {"id": "b2", "de": "v2", "a": "v3", "etiqueta": "lateral", "tipo": "costura", "margen_mm": 10,
         "piquetes": [{"id": "p1", "pos_mm": 200.0}]},
        {"id": "b3", "de": "v3", "a": "v4", "etiqueta": "canesu", "tipo": "union"},
        {"id": "b4", "de": "v4", "a": "v1", "etiqueta": "centro_frente", "tipo": "terminado",
         "terminado": {"que": "tapeta", "descripcion": "tapeta con ojales", "ancho_mm": 30, "donante": 0}},
    ],
    "marcas": [{"id": f"m{i+1}", "tipo": "boton", "puntos": [[16, y]]} for i, y in enumerate([60, 170, 280])],
    "escalado": {"metodo": "deltas", "talles": {}},
}
D["huella"] = huella(D)
guardar(f"{ID_D}.json", D)

# ---------------------------------------------------------------- molde
M = {
    "pattrn": "0.1", "tipo": "molde", "id": "mol-cam0001a", "nombre": "Camisa canesú Oxford sobre cuadros",
    "unidades": "mm", "licencia": "CC-BY-SA-4.0", "autoria": {"autor": "PATTRN ejemplo", "fecha": "2026-11-03"},
    "talle": "L",
    "piezas": [{
        "id": "delantero", "nombre": "Delantero", "cortes": {"cantidad": 1, "tela": "donantes"},
        "instancias": [
            {"id": "canesu", "ref": f"{ID_B}@1", "huella": B["huella"], "transformacion": identidad},
            {"id": "inferior", "ref": f"{ID_D}@2", "huella": D["huella"],
             "transformacion": {"traslacion": [0, Y - 380], "rotacion_grados": 0, "espejo": False}},
        ],
        "fusiones": [{"a": "canesu#b1", "b": "inferior#b3", "alineacion": "inicio",
                      "resolucion": {"modo": "manda_a", "aceptada": "2026-11-03"}}],
    }],
    "notas": f"Unión canesú: {largo_corte:.2f} mm (Oxford) contra 262.00 mm (cuadros); manda el canesú.",
}
guardar("mol-cam0001a.json", M)

print(f"corte en sisa: t={t:.4f} P={P_sisa} largo sisa abajo={largo_sisa_abajo:.2f} piquete B={pos_piq:.2f}")
print(f"largo sisa A={largo_bez(V['v3'], SISA_C1, SISA_C2, V['v4']):.2f}")
