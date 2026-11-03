# Decisión: stack de PATTRN

Fecha: 2026-11-03 · Estado: aceptada

## Decisión

PATTRN se escribe **en un solo lenguaje, TypeScript**: el núcleo de geometría, el lienzo, la importación desde foto y la exportación. Se distribuye como **aplicación de escritorio con Tauri**, con instaladores que se compilan solos en GitHub. El mismo código podrá publicarse después como sitio en PATTERNPEDIA.

## Condiciones que tenía que cumplir

1. **Instalar y abrir sin terminal.** La persona descarga un instalador, hace doble clic y lo abre como cualquier programa.
2. **El lienzo es lo más importante.** Arrastrar fragmentos, verlos unirse y ver la diferencia de largos en vivo tiene que ir fluido.
3. **Mantenible por alguien que no programa.** Pocas piezas, pocas dependencias, nada que compilar a mano.

## Por qué

- **Una sola geometría.** El cálculo vive en el mismo lugar que el lienzo, así que no hay una segunda implementación que pueda dar otro número. Una diferencia que muestra PATTRN es una diferencia de la prenda, nunca del software.
- **Fluidez por arquitectura.** Mover un vértice recalcula el largo y el aviso en el mismo cuadro de pantalla, sin ida y vuelta a otro proceso.
- **Web después, sin reescribir.** El núcleo corre igual en la aplicación y en un navegador.
- **Un solo camino de compilación.** GitHub Actions genera los instaladores. Quien mantiene no compila nada ni toca Rust, el lenguaje interno de Tauri.

## Alternativa descartada

**Núcleo en Python con interfaz web, empaquetado como aplicación.** Tenía mejores bibliotecas para DXF (ezdxf) y fotos (OpenCV). Se descartó por cuatro motivos:

- Al editar la forma, cada movimiento tenía que ir y volver de otro proceso.
- Invitaba a duplicar la geometría en la interfaz para ganar velocidad.
- Los instaladores superaban los 100 MB, y en Windows suelen caer en falsos positivos del antivirus.
- Eran dos lenguajes y dos formas de compilar.

## Lo que se acepta a cambio

- **Exportador DXF propio.** Solo escribimos DXF, nunca lo leemos, y el formato de texto para plotters es simple. Se prueba contra plotters y software reales antes de darlo por bueno.
- **OpenCV en WebAssembly** para la importación desde foto: unos 8 MB y documentación más pobre que en Python.
- **Las herramientas de `herramientas/` en Python quedan como referencia** hasta que se porten. `dibujar.py` calcula largos sobre polilíneas, así que **no es la geometría de PATTRN**. Las pruebas del núcleo usan sus números solo como verificación cruzada.
- **Instaladores sin firma digital al principio.** Windows va a mostrar el aviso de SmartScreen la primera vez. Hay programas de firma gratuita para software libre; se tramita más adelante.

## Piezas

| Pieza | Herramienta | Licencia |
|---|---|---|
| Lenguaje | TypeScript | Apache 2.0 |
| Núcleo de geometría | propio (`nucleo/`): Bézier exactas, corte, fusión, huellas | GPLv3 |
| Lienzo | SVG; Svelte cuando crezca la interfaz | MIT |
| Empaquetado | Tauri 2 | MIT / Apache 2.0 |
| Pruebas | Vitest | MIT |
| Compilación | GitHub Actions | — |

## Regla de verificación

El núcleo en TypeScript tiene que reproducir **idénticos** los números de los ejemplos del formato v0.1:

- la unión del molde: **23,72 cm** contra **26,20 cm**, diferencia **2,48 cm**
- los largos de todos los bordes de los ejemplos
- el punto de corte y los puntos de control de la sisa cortada
- la `huella` guardada en cada fragmento

Si alguno no coincide, algo se rompió en el camino. Las pruebas corren en cada cambio, antes de compilar el instalador.
