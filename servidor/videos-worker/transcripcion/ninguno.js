"use strict";
// Sin servicio de transcripción (lo normal hoy): el análisis devuelve `transcripcion: null` con este motivo.
module.exports = {
  nombre: "ninguno",
  comprobar() {
    return "El servidor no tiene servicio de transcripción configurado (TRANSCRIPCION en el .env): lo que se dice en el video hay que escribirlo a mano.";
  },
  async transcribir() {
    throw new Error("No hay servicio de transcripción.");
  },
};
