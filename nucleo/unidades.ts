// Cómo se muestran las medidas: cm con dos decimales y coma (resolución 0,1 mm).

export function cm(mm: number): string {
  const decimos = Math.round(mm * 10); // en décimas de mm, para no depender del redondeo binario de toFixed
  return (decimos / 100).toFixed(2).replace(".", ",") + " cm";
}
