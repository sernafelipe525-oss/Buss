const { db } = require("../config/firebase");

/**
 * Crea una reserva nueva.
 * Estructura en Firebase: /reservas/{id}
 */
async function crearReserva({ nombre, telefono, fecha, hora, personas, notas }) {
  const ref = db().ref("reservas").push();
  const reserva = {
    id: ref.key,
    nombre,
    telefono,
    fecha, // formato "YYYY-MM-DD"
    hora, // formato "HH:mm"
    personas: Number(personas),
    notas: notas || "",
    estado: "pendiente", // pendiente | confirmada | cancelada
    origen: "whatsapp_ai",
    creadoEn: Date.now(),
  };
  await ref.set(reserva);
  return reserva;
}

/** Consulta las reservas existentes para una fecha, para poder valorar disponibilidad */
async function consultarReservasPorFecha(fecha) {
  const snap = await db()
    .ref("reservas")
    .orderByChild("fecha")
    .equalTo(fecha)
    .once("value");

  const data = snap.val() || {};
  return Object.values(data).filter((r) => r.estado !== "cancelada");
}

async function cancelarReserva(id) {
  await db().ref(`reservas/${id}`).update({ estado: "cancelada" });
}

module.exports = { crearReserva, consultarReservasPorFecha, cancelarReserva };
