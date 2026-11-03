# PATTRN

Software libre de moldería para upcycling.

PATTRN traduce un diseño a molde. Está hecho para piezas únicas que se arman combinando fragmentos de otros moldes y de prendas donantes. No compite con el CAD industrial y no tiene fines comerciales.

La unidad del sistema es el **fragmento**: un polígono de molde con sus bordes etiquetados (escote, sisa, lateral…) y tipados (costura, doblez, unión, terminado). El software combina fragmentos de orígenes distintos, resuelve la unión entre ellos y verifica que los largos de costura coincidan. El resultado es un molde completo y preciso.

Cada fragmento y cada molde se pueden publicar en **PATTERNPEDIA**, un archivo abierto de moldes. Cada corte que se hace produce material que cualquiera puede reutilizar.

## Descargar

El instalador de Windows se compila solo en GitHub con cada cambio. Hay dos lugares para encontrarlo:

- **Versiones publicadas:** en *Releases*, el `.exe` de la última versión. No hace falta cuenta.
- **Última compilación:** en *Actions* → *Compilar* → la ejecución más reciente → *PATTRN-windows*. Hace falta iniciar sesión en GitHub.

El instalador todavía no tiene firma digital. La primera vez, Windows puede mostrar "Windows protegió su PC": hay que hacer clic en *Más información* → *Ejecutar de todos modos*.

## Estado

El formato de datos v0.1 está cerrado y el núcleo de geometría ya está en TypeScript, verificado contra los ejemplos del formato. La aplicación importa moldes desde fotos, resuelve uniones y costuras, y abre y guarda proyectos; el lienzo viene después.

- [Decisión de stack](especificacion/decision-stack.md)
- [Especificación del formato](especificacion/formato-v0.1.md)
- [JSON Schema del fragmento](esquemas/fragmento.schema.json)
- [JSON Schema del molde](esquemas/molde.schema.json)
- [JSON Schema del proyecto](esquemas/proyecto.schema.json)
- [Ejemplos](esquemas/ejemplos/) y [sus dibujos](esquemas/ejemplos/dibujos/index.html)

## Desarrollo

Solo para quien quiera modificar el código; para usar PATTRN alcanza con el instalador.

```bash
npm install
```

```bash
npm test
```

```bash
npm run dev
```

`npm test` verifica el núcleo contra los números de los ejemplos. Si alguno no da idéntico, algo se rompió.

## Herramientas de referencia (Python)

Generan y validan los ejemplos del formato. No son la geometría de PATTRN, que vive en `nucleo/`.

```bash
python herramientas/generar_ejemplos.py esquemas/ejemplos
python herramientas/validar_ejemplos.py .
python herramientas/dibujar.py esquemas/ejemplos/*.json esquemas/ejemplos/proyecto-camisa-canesu/proyecto.json -o esquemas/ejemplos/dibujos
```

`validar_ejemplos.py` necesita `jsonschema`. `dibujar.py` hace SVG de vista previa, con bordes coloreados por tipo, hilo, piquetes y avisos; no es la exportación 1:1.

## Licencias

- **Código:** GNU General Public License v3.0. Ver [LICENSE](LICENSE).
- **Moldes y fragmentos de PATTERNPEDIA:** [Creative Commons Atribución-CompartirIgual 4.0 Internacional (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/deed.es).

  Cada fragmento lleva dentro su cadena de atribución (`linaje`), así que se puede publicar solo y seguir cumpliendo la licencia.
