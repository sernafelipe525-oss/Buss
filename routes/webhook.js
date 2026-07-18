const express = require("express");
const router = express.Router();

const whatsapp = require("../services/whatsapp");
const ia = require("../services/ia");

// Memoria simple en RAM por numero de telefono (para dar contexto de conversacion).
// Para produccion real esto deberia vivir en Firebase, pero para arrancar es suficiente.
const historiales = new Map();

function getHistorial(telefono) {
  if (!historiales.has(telefono)) historiales.set(telefono, []);
  return historiales.get(telefono);
}

function guardarTurno(telefono, userMsg, assistantMsg) {
  const h = getHistorial(telefono);
  h.push({ role: "user", content: userMsg });
  h.push({ role: "assistant", content: assistantMsg });
  // Nos quedamos solo con los ultimos 10 turnos para no crecer sin limite
  while (h.length > 20) h.shift();
}

// --- 1) Verificacion del webhook (Meta la llama una vez al configurarlo) ---
router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// --- 2) Recepcion de mensajes entrantes ---
router.post("/", async (req, res) => {
  // Responder rapido a Meta para que no reintente el envio
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message) return; // puede ser un evento de "status" (entregado/leido), lo ignoramos

    const from = message.from; // numero del cliente, formato "34613682500"
    let textoUsuario = null;

    if (message.type === "text") {
      textoUsuario = message.text.body;
    } else if (message.type === "audio") {
      const { buffer, mimeType } = await whatsapp.downloadMedia(message.audio.id);
      textoUsuario = await ia.transcribirAudio(buffer, mimeType);
    } else {
      await whatsapp.sendText(
        from,
        "De momento solo puedo leer texto o notas de voz 🙂"
      );
      return;
    }

    if (message.id) await whatsapp.markAsRead(message.id);

    const historial = getHistorial(from);
    const respuesta = await ia.procesarMensaje(textoUsuario, from, historial);

    guardarTurno(from, textoUsuario, respuesta);
    await whatsapp.sendText(from, respuesta);
  } catch (err) {
    console.error("Error procesando webhook:", err);
  }
});

module.exports = router;
