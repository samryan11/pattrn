"""Valida los ejemplos y prueba que los esquemas rechacen casos inválidos. Uso: validar_ejemplos.py <raíz del repo>"""
import copy, json, sys
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker

raiz = Path(sys.argv[1])
esq = {n: json.loads((raiz / "esquemas" / f"{n}.schema.json").read_text(encoding="utf-8"))
       for n in ("fragmento", "molde", "proyecto")}
for s in esq.values():
    Draft202012Validator.check_schema(s)
val = {n: Draft202012Validator(s, format_checker=FormatChecker()) for n, s in esq.items()}

fallas = 0
ejemplos = sorted((raiz / "esquemas" / "ejemplos").rglob("*.json"))
for f in ejemplos:
    doc = json.loads(f.read_text(encoding="utf-8"))
    errs = list(val[doc["tipo"]].iter_errors(doc))
    print(("OK   " if not errs else "FALLA"), f.relative_to(raiz / "esquemas" / "ejemplos").as_posix())
    for e in errs:
        fallas += 1
        print("     ", list(e.absolute_path), e.message[:200])

base = json.loads((raiz / "esquemas" / "ejemplos" / "frg-oxf7a2c1.json").read_text(encoding="utf-8"))
corte = json.loads((raiz / "esquemas" / "ejemplos" / "frg-oxf9k3b2.json").read_text(encoding="utf-8"))


def caso(nombre, doc, mutar):
    global fallas
    d = copy.deepcopy(doc)
    mutar(d)
    ok = val["fragmento"].is_valid(d)
    print(("OK   " if not ok else "FALLA"), "rechaza:", nombre)
    fallas += ok


caso("sin hilo", base, lambda d: d.pop("hilo"))
caso("hilo sin punto", base, lambda d: d["hilo"].pop("punto"))
caso("borde sin tipo", base, lambda d: d["bordes"][1].pop("tipo"))
caso("tipo inventado", base, lambda d: d["bordes"][1].update(tipo="sin_tipo"))
caso("costura sin margen", base, lambda d: d["bordes"][1].pop("margen_mm"))
caso("terminado con margen", base, lambda d: d["bordes"][0].update(margen_mm=10))
caso("terminado sin 'terminado'", base, lambda d: d["bordes"][0].pop("terminado"))
caso("'terminado' en costura", base, lambda d: d["bordes"][1].update(terminado={"que": "ruedo"}))
caso("no_se sin certeza", base, lambda d: d["bordes"][4].pop("certeza"))
caso("no_se con certeza cierta", base, lambda d: d["bordes"][4]["certeza"].update(estado="cierta"))
caso("incierta sin motivo", base, lambda d: d["bordes"][4]["certeza"].pop("motivo"))
caso("etiqueta otro sin descripcion", base, lambda d: d["bordes"][1].update(etiqueta="otro"))
caso("version 2 sin version_anterior", base, lambda d: d.update(version=2))
caso("corte sin linaje", corte, lambda d: d.pop("linaje"))
caso("corte sin linea", corte, lambda d: d["origen"].pop("linea"))
caso("licencia distinta", base, lambda d: d.update(licencia="CC-BY-4.0"))

molde = json.loads((raiz / "esquemas" / "ejemplos" / "mol-cam0001a.json").read_text(encoding="utf-8"))
m = copy.deepcopy(molde)
m["piezas"][0]["fusiones"][0]["resolucion"] = {"modo": "transicion"}
ok = val["molde"].is_valid(m)
print(("OK   " if not ok else "FALLA"), "rechaza: transicion sin aceptar")
fallas += ok
m = copy.deepcopy(molde)
m["costuras"] = [{"id": "lateral", "a": {"pieza": "delantero", "bordes": ["canesu#b2", "inferior#b2"]},
                  "b": {"pieza": "espalda", "bordes": ["espalda#b2"]}, "embebido_mm": 0,
                  "piquetes_pares": [["delantero/inferior#b2.p1", "espalda/espalda#b2.p1"]]}]
ok = val["molde"].is_valid(m)
print(("OK   " if ok else "FALLA"), "acepta: costura con cadena y piquetes")
fallas += not ok

# ---------------------------------------------------------------- proyecto
carpeta = raiz / "esquemas" / "ejemplos" / "proyecto-camisa-canesu"
proyecto = json.loads((carpeta / "proyecto.json").read_text(encoding="utf-8"))


def caso_proyecto(nombre, mutar):
    global fallas
    d = copy.deepcopy(proyecto)
    mutar(d)
    ok = val["proyecto"].is_valid(d)
    print(("OK   " if not ok else "FALLA"), "rechaza:", nombre)
    fallas += ok


caso_proyecto("generada sin prompt", lambda d: d["referencias"][1]["origen"].pop("prompt"))
caso_proyecto("boceto sin referencias", lambda d: (d.update(referencias=[]), d["entrada"].update(modo="boceto_a_mano")))
caso_proyecto("sin referencia activa", lambda d: d.pop("referencia_activa"))
caso_proyecto("modificada sin resultado", lambda d: d["sugerencias"][0].update(estado="modificada"))
caso_proyecto("nodo sin hoja", lambda d: d["arbol"]["nodos"][0].pop("hoja"))
caso_proyecto("sin interruptor", lambda d: d["arbol"].pop("registrar_ramas"))
d = copy.deepcopy(proyecto)
d.update(entrada={"modo": "lienzo"}, referencias=[])
d.pop("referencia_activa")
ok = val["proyecto"].is_valid(d)
print(("OK   " if ok else "FALLA"), "acepta: lienzo sin referencias")
fallas += not ok

# reglas semánticas del proyecto (§11, 14–20)
semantica = []
nodos = {n["id"]: n for n in proyecto["arbol"]["nodos"]}
if len(nodos) != len(proyecto["arbol"]["nodos"]):
    semantica.append("ids de nodo repetidos")
raices = [n for n in nodos.values() if n["padre"] is None]
if len(raices) != 1:
    semantica.append(f"{len(raices)} raíces")
for n in nodos.values():
    visto, p = set(), n["id"]
    while p is not None:
        if p in visto or p not in nodos:
            semantica.append(f"{n['id']}: padre inexistente o ciclo")
            break
        visto.add(p)
        p = nodos[p]["padre"]
if proyecto["arbol"]["actual"] not in nodos:
    semantica.append("actual inexistente")
refs = {r["id"]: r for r in proyecto["referencias"]}
if proyecto.get("referencia_activa") not in refs:
    semantica.append("referencia_activa inexistente")
for r in refs.values():
    if r["origen"]["metodo"] == "generada_en_pattrn" and refs.get(r["origen"]["desde"], {}).get("tipo") != "boceto":
        semantica.append(f"{r['id']}: 'desde' no es un boceto")
usados = [n["molde"]["id"] for n in nodos.values() if n["molde"]]
if len(usados) != len(set(usados)):
    semantica.append("un molde aparece en dos nodos")
for n in nodos.values():
    if not n["molde"]:
        continue
    archivo = carpeta / n["molde"]["archivo"]
    if not archivo.exists():
        semantica.append(f"{n['id']}: falta {n['molde']['archivo']}")
        continue
    mo = json.loads(archivo.read_text(encoding="utf-8"))
    if mo["id"] != n["molde"]["id"]:
        semantica.append(f"{n['id']}: el archivo tiene otro id de molde")
    costuras = {c["id"] for c in mo.get("costuras", [])}
    for paso in n["hoja"].get("orden_armado", []):
        for c in paso.get("costuras", []):
            if c not in costuras:
                semantica.append(f"{n['id']}: orden_armado cita la costura inexistente {c}")
    for pieza in mo["piezas"]:
        for inst in pieza["instancias"]:
            copia = carpeta / "fragmentos" / f"{inst['ref']}.json"
            if not copia.exists():
                semantica.append(f"{n['id']}: falta la copia fragmentos/{inst['ref']}.json")
            elif json.loads(copia.read_text(encoding="utf-8"))["huella"] != inst["huella"]:
                semantica.append(f"{n['id']}: la copia de {inst['ref']} tiene otra huella")
print(("OK   " if not semantica else "FALLA"), "reglas semánticas del proyecto")
for s in semantica:
    print("     ", s)
fallas += len(semantica)

print("\nfallas:", fallas)
sys.exit(1 if fallas else 0)
