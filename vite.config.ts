import { defineConfig } from "vitest/config";

export default defineConfig({
  root: "app",
  // rutas relativas: el instalador sirve los archivos desde disco
  base: "./",
  clearScreen: false,
  server: { port: 5173, strictPort: true, fs: { allow: [".."] } },
  build: { outDir: "../dist", emptyOutDir: true },
  test: { root: ".", include: ["nucleo/**/*.test.ts"] },
});
