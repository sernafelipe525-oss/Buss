const axios = require("axios");

const GRAPH_URL = "https://graph.facebook.com/v21.0";

function client() {
  return axios.create({
    baseURL: `${GRAPH_URL}/${process.env.WHATSAPP_PHONE_NUMBER_ID}`,
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
  });
}

/** Envia un mensaje de texto simple a un numero de WhatsApp */
async function sendText(to, body) {
  return client().post("/messages", {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body },
  });
}

/**
 * Descarga un archivo de medios (audio, imagen) usando su media_id.
 * Devuelve un Buffer con los bytes del archivo.
 */
async function downloadMedia(mediaId) {
  const meta = await axios.get(`${GRAPH_URL}/${mediaId}`, {
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` },
  });

  const fileUrl = meta.data.url;
  const fileRes = await axios.get(fileUrl, {
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` },
    responseType: "arraybuffer",
  });

  return {
    buffer: Buffer.from(fileRes.data),
    mimeType: meta.data.mime_type,
  };
}

/** Marca un mensaje entrante como leido (doble check azul) */
async function markAsRead(messageId) {
  return client().post("/messages", {
    messaging_product: "whatsapp",
    status: "read",
    message_id: messageId,
  });
}

module.exports = { sendText, downloadMedia, markAsRead };
