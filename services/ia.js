const { GoogleGenerativeAI, SchemaType } = require("@google/generative-ai");

const reservas = require("./reservas");
const pedidos = require("./pedidos");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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
    functionDeclarations: [
      {
        name: "crearReserva",
        description: "Crea una reserva de mesa para el cliente.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            nombre: { type: SchemaType.STRING },
            fecha: { type: SchemaType.STRING, description: "Formato YYYY-MM-DD" },
            hora: { type: SchemaType.STRING, description: "Formato HH:mm, 24h" },
            personas: { type: SchemaType.INTEGER },
            notas: { type: SchemaType.STRING },
          },
          required: ["nombre", "fecha", "hora", "personas"],
        },
      },
      {
        name: "crearPedido",
        description:
          "Registra un pedido del cliente. Queda pendiente de confirmación humana, no se envía a cocina automáticamente.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            nombreCliente: { type: SchemaType.STRING },
            items: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  producto: { type: SchemaType.STRING },
                  cantidad: { type: SchemaType.INTEGER },
                  notas: { type: SchemaType.STRING },
                },
                required: ["producto", "cantidad"],
              },
            },
            notas: { type: SchemaType.STRING },
          },
          required: ["items"],
        },
      },
    ],
  },
];

function getModel() {
  return genAI.getGenerativeModel({
    model: "gemini-flash-latest",
    systemInstruction: SYSTEM_PROMPT,
    tools,
  });
}

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

/** Convierte el historial guardado ({role: "user"|"assistant", content}) al formato de Gemini */
function convertirHistorial(historial) {
  return historial.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

/**
 * Transcribe una nota de voz de WhatsApp usando Gemini directamente
 * (Gemini acepta audio como entrada, no hace falta un servicio aparte tipo Whisper).
 */
async function transcribirAudio(buffer, mimeType) {
  const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
  const result = await model.generateContent([
    { inlineData: { data: buffer.toString("base64"), mimeType } },
    { text: "Transcribe este audio a texto en español. Devuelve solo la transcripción, sin comentarios ni explicaciones." },
  ]);
  return result.response.text().trim();
}

/**
 * Procesa un mensaje de texto (ya transcrito si venía de audio) y devuelve
 * la respuesta final en texto para enviar por WhatsApp.
 */
async function procesarMensaje(textoUsuario, telefonoCliente, historial = []) {
  const model = getModel();
  const chat = model.startChat({ history: convertirHistorial(historial) });

  let result = await chat.sendMessage(textoUsuario);
  let response = result.response;
  let calls = response.functionCalls();

  while (calls && calls.length > 0) {
    const respuestasFuncion = [];
    for (const call of calls) {
      const resultado = await ejecutarHerramienta(call.name, call.args, telefonoCliente);
      respuestasFuncion.push({
        functionResponse: { name: call.name, response: resultado },
      });
    }
    result = await chat.sendMessage(respuestasFuncion);
    response = result.response;
    calls = response.functionCalls();
  }

  return response.text();
}

module.exports = { procesarMensaje, transcribirAudio };
