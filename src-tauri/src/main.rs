// Sin consola de Windows en la versión instalada.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    pattrn_lib::run()
}
