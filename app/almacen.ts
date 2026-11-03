// Dónde se guardan los proyectos. En la aplicación instalada: una carpeta del disco, elegida
// con el diálogo del sistema. En el navegador (desarrollo): una carpeta elegida con el
// selector del navegador, si lo tiene.

import type { Almacen } from "../nucleo";

export const enAplicacion = () => "__TAURI_INTERNALS__" in window;

async function almacenTauri(carpeta: string): Promise<Almacen> {
  const fs = await import("@tauri-apps/plugin-fs");
  const path = await import("@tauri-apps/api/path");
  const completa = (ruta: string) => path.join(carpeta, ...ruta.split("/"));
  return {
    nombre: carpeta,
    async leer(ruta) {
      const p = await completa(ruta);
      return (await fs.exists(p)) ? fs.readTextFile(p) : null;
    },
    async escribir(ruta, texto) {
      const p = await completa(ruta);
      await fs.mkdir(await path.dirname(p), { recursive: true });
      // se escribe a un temporal y se renombra: si algo falla a mitad, el archivo anterior queda entero
      await fs.writeTextFile(p + ".tmp", texto);
      await fs.rename(p + ".tmp", p);
    },
    async escribirBytes(ruta, bytes) {
      const p = await completa(ruta);
      await fs.mkdir(await path.dirname(p), { recursive: true });
      await fs.writeFile(p, bytes);
    },
  };
}

type Directorio = FileSystemDirectoryHandle & {
  getDirectoryHandle(n: string, o?: { create?: boolean }): Promise<Directorio>;
};

function almacenNavegador(raiz: Directorio): Almacen {
  const ir = async (ruta: string, crear: boolean) => {
    const partes = ruta.split("/");
    let dir = raiz;
    for (const p of partes.slice(0, -1)) dir = await dir.getDirectoryHandle(p, { create: crear });
    return { dir, archivo: partes[partes.length - 1] };
  };
  return {
    nombre: raiz.name,
    async leer(ruta) {
      try {
        const { dir, archivo } = await ir(ruta, false);
        return await (await (await dir.getFileHandle(archivo)).getFile()).text();
      } catch {
        return null;
      }
    },
    async escribir(ruta, texto) {
      const { dir, archivo } = await ir(ruta, true);
      const w = await (await dir.getFileHandle(archivo, { create: true })).createWritable();
      await w.write(texto);
      await w.close();
    },
    async escribirBytes(ruta, bytes) {
      const { dir, archivo } = await ir(ruta, true);
      const w = await (await dir.getFileHandle(archivo, { create: true })).createWritable();
      await w.write(bytes as unknown as ArrayBuffer);
      await w.close();
    },
  };
}

/** Pide una carpeta. `para` es solo el texto del diálogo. Devuelve null si se cancela. */
export async function elegirCarpeta(para: "abrir" | "guardar"): Promise<Almacen | null> {
  if (enAplicacion()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const carpeta = await open({
      directory: true,
      title: para === "abrir" ? "Abrir un proyecto PATTRN" : "Elegí o creá una carpeta vacía para el proyecto",
    });
    return typeof carpeta === "string" ? almacenTauri(carpeta) : null;
  }
  const picker = (window as unknown as { showDirectoryPicker?: (o: object) => Promise<Directorio> }).showDirectoryPicker;
  if (!picker) throw new Error("Este navegador no puede guardar en carpetas. Usá la aplicación instalada.");
  try {
    return almacenNavegador(await picker({ mode: "readwrite" }));
  } catch {
    return null; // cancelado
  }
}

/** Pregunta antes de perder cambios. true si se puede seguir. */
export async function confirmar(mensaje: string, seguir: string, volver: string): Promise<boolean> {
  if (enAplicacion()) {
    const { ask } = await import("@tauri-apps/plugin-dialog");
    return ask(mensaje, { title: "PATTRN", kind: "warning", okLabel: seguir, cancelLabel: volver });
  }
  return window.confirm(mensaje);
}

/** Avisa si se intenta cerrar la ventana con cambios sin guardar. */
export async function alCerrar(haySinGuardar: () => boolean) {
  if (enAplicacion()) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().onCloseRequested(async (e) => {
      if (!haySinGuardar()) return;
      const cerrar = await confirmar("Hay cambios sin guardar. Si cerrás ahora se pierden.", "Cerrar sin guardar", "Volver");
      if (!cerrar) e.preventDefault();
    });
  } else {
    window.addEventListener("beforeunload", (e) => { if (haySinGuardar()) e.preventDefault(); });
  }
}
