const OpenAI = require("openai");
const fs = require("fs");
const os = require("os");
const path = require("path");

const reservas = require("./reservas");
const pedidos = require("./pedidos");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `
Eres el asistente virtual de WhatsApp de ${process.env.RESTAURANT_NAME || "el restaurante"}.
Atiendes a clientes en español de España, de forma cercana y breve (estilo WhatsApp, no párrafos largos).
Puedes ayudar a:
- Crear reservas de mesa (pide nombre, fecha, hora y número de personas si faltan).
- Tomar pedidos para recoger o llevar (pide qué productos y cantidad).
- Responder dudas generales sobre horario o el restaurante si el cliente pregunta.

Reglas importantes:
- Nunca inventes disponibilidad, precios ni platos que no te haya confirmado el sistema.
- Si el cliente pide un pedido, dile SIEMPRE que quedará pendiente de confirmación por el restaurante antes de prepararse.
- Si falta información imprescindible (fecha, hora, personas, o qué quiere pedir), pregúntala antes de llamar a una herramienta.
- Sé breve. Nada de firmas ni despedidas largas.
`.trim();

const tools = [
  {
    type: "function",
    function: {
      name: "crearReserva",
      description: "Crea una reserva de mesa para el cliente.",
      parameters: {
        type: "object",
        properties: {
          nombre: { type: "string" },
          fecha: { type: "string", description: "Formato YYYY-MM-DD" },
          hora: { type: "string", description: "Formato HH:mm, 24h" },
          personas: { type: "integer" },
          notas: { type: "string" },
        },
        required: ["nombre", "fecha", "hora", "personas"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "crearPedido",
      description:
        "Registra un pedido del cliente. Queda pendiente de confirmación humana, no se envía a cocina automáticamente.",
      parameters: {
        type: "object",
        properties: {
          nombreCliente: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                producto: { type: "string" },
                cantidad: { type: "integer" },
                notas: { type: "string" },
              },
              required: ["producto", "cantidad"],
            },
          },
          notas: { type: "string" },
        },
        required: ["items"],
      },
    },
  },
];

async function ejecutarHerramienta(nombre, args, telefonoCliente) {
  if (nombre === "crearReserva") {
    const r = await reservas.crearReserva({ ...args, telefono: telefonoCliente });
    return { ok: true, reservaId: r.id };
  }
  if (nombre === "crearPedido") {
    const items = args.items.map((it) => ({ ...it, precio: 0 })); // precios reales se ajustan al confirmar
    const p = await pedidos.crearPedido({
      telefonoCliente,
      nombreCliente: args.nombreCliente,
      items,
      notas: args.notas,
    });
    return { ok: true, pedidoId: p.id };
  }
  return { ok: false, error: "Herramienta no reconocida" };
}

/**
 * Transcribe audio (notas de voz de WhatsApp) usando Whisper.
 * buffer: Buffer de audio, mimeType: p.ej. "audio/ogg; codecs=opus"
 */
async function transcribirAudio(buffer, mimeType) {
  const ext = mimeType.includes("ogg") ? "ogg" : "mp3";
  const tmpPath = path.join(os.tmpdir(), `audio_${Date.now()}.${ext}`);
  fs.writeFileSync(tmpPath, buffer);

  try {
    const res = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tmpPath),
      model: "whisper-1",
      language: "es",
    });
    return res.text;
  } finally {
    fs.unlinkSync(tmpPath);
  }
}

/**
 * Procesa un mensaje de texto (ya transcrito si venía de audio) y devuelve
 * la respuesta final en texto para enviar por WhatsApp.
 * historial: array de mensajes previos [{role, content}] para dar contexto.
 */
async function procesarMensaje(textoUsuario, telefonoCliente, historial = []) {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...historial,
    { role: "user", content: textoUsuario },
  ];

  let response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages,
    tools,
  });

  let choice = response.choices[0];

  // Si el modelo quiere usar una herramienta, la ejecutamos y le devolvemos el resultado
  while (choice.finish_reason === "tool_calls") {
    messages.push(choice.message);

    for (const toolCall of choice.message.tool_calls) {
      const args = JSON.parse(toolCall.function.arguments);
      const resultado = await ejecutarHerramienta(
        toolCall.function.name,
        args,
        telefonoCliente
      );
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(resultado),
      });
    }

    response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      tools,
    });
    choice = response.choices[0];
  }

  return choice.message.content;
}

module.exports = { procesarMensaje, transcribirAudio };
