// La aplicación es solo la ventana: toda la lógica de PATTRN está en TypeScript (nucleo/ y app/).

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("no se pudo abrir PATTRN");
}
