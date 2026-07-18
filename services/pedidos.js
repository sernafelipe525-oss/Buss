const { db } = require("../config/firebase");
const whatsapp = require("./whatsapp");

/**
 * Crea un pedido en estado "pendiente_confirmacion".
 * NO se envia a cocina todavia -- eso lo hace el encargado desde el panel.
 * Estructura en Firebase: /pedidosWhatsapp/{id}
 */
async function crearPedido({ telefonoCliente, nombreCliente, items, notas }) {
  const ref = db().ref("pedidosWhatsapp").push();

  const total = items.reduce(
    (sum, it) => sum + (Number(it.precio) || 0) * (Number(it.cantidad) || 1),
    0
  );

  const pedido = {
    id: ref.key,
    telefonoCliente,
    nombreCliente: nombreCliente || "",
    items, // [{ producto, cantidad, precio, notas }]
    total,
    notas: notas || "",
    estado: "pendiente_confirmacion", // pendiente_confirmacion | confirmado | rechazado | enviado_cocina
    origen: "whatsapp_ai",
    creadoEn: Date.now(),
  };

  await ref.set(pedido);

  // Avisa al encargado para que confirme
  const encargado = process.env.ENCARGADO_WHATSAPP;
  if (encargado) {
    const resumen = items
      .map((it) => `- ${it.cantidad}x ${it.producto}`)
      .join("\n");
    await whatsapp.sendText(
      encargado,
      `🆕 Pedido por WhatsApp de ${nombreCliente || telefonoCliente}\n${resumen}\nTotal aprox: ${total.toFixed(2)}€\n\nRevísalo en el panel para confirmarlo.`
    );
  }

  return pedido;
}

async function confirmarPedido(id) {
  await db().ref(`pedidosWhatsapp/${id}`).update({ estado: "confirmado" });
}

async function rechazarPedido(id, motivo) {
  await db()
    .ref(`pedidosWhatsapp/${id}`)
    .update({ estado: "rechazado", motivoRechazo: motivo || "" });
}

module.exports = { crearPedido, confirmarPedido, rechazarPedido };
