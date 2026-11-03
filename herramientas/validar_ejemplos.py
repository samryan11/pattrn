"""Valida los ejemplos y prueba que los esquemas rechacen casos inválidos. Uso: validar_ejemplos.py <raíz del repo>"""
import copy, json, sys
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker

raiz = Path(sys.argv[1])
esq = {n: json.loads((raiz / "esquemas" / f"{n}.schema.json").read_text(encoding="utf-8")) for n in ("fragmento", "molde")}
for s in esq.values():
    Draft202012Validator.check_schema(s)
val = {n: Draft202012Validator(s, format_checker=FormatChecker()) for n, s in esq.items()}

fallas = 0
ejemplos = sorted((raiz / "esquemas" / "ejemplos").glob("*.json"))
for f in ejemplos:
    doc = json.loads(f.read_text(encoding="utf-8"))
    errs = list(val[doc["tipo"]].iter_errors(doc))
    print(("OK   " if not errs else "FALLA"), f.name)
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

print("\nfallas:", fallas)
sys.exit(1 if fallas else 0)
