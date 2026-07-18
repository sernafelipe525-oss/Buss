# HottoDigital Assistant

Asistente de WhatsApp para Hotto: responde texto y notas de voz, crea reservas
y toma pedidos (pendientes de confirmación humana) contra Firebase.

## Qué hace ahora mismo

- Recibe mensajes de texto y notas de voz por WhatsApp Cloud API.
- Transcribe el audio con Whisper.
- Usa GPT-4o con function calling para decidir si hay que crear una reserva
  o un pedido, o simplemente responder.
- Guarda reservas en `/reservas` y pedidos en `/pedidosWhatsapp` en Firebase
  Realtime Database.
- Los pedidos NO se envían a cocina automáticamente: quedan en
  `pendiente_confirmacion` y se avisa por WhatsApp al número del encargado.

## Lo que falta antes de usarlo en real

1. Conectar `/pedidosWhatsapp` con tu panel/TPV real para que el encargado
   pueda confirmar desde ahí (ahora mismo solo se crea el registro).
2. Consultar el menú/precios reales de Hotto en vez de precio 0.
3. Revisar disponibilidad real de mesas antes de confirmar una reserva
   (ahora mismo se crea siempre en estado "pendiente").
4. Cambiar el token de acceso temporal por uno de larga duración (ver abajo).

## Configuración paso a paso (desde el móvil)

### 1. Variables de entorno

Copia `.env.example` a `.env` y rellena:

- `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID`, `WHATSAPP_ACCESS_TOKEN`:
  los que ya obtuviste en Meta for Developers.
- `WHATSAPP_VERIFY_TOKEN`: una palabra que inventes tú (la usarás al
  configurar el webhook en Meta).
- `OPENAI_API_KEY`: tu clave de la API de OpenAI (platform.openai.com).
- `FIREBASE_SERVICE_ACCOUNT_JSON`: JSON de la cuenta de servicio de tu
  proyecto Firebase (Firebase Console → ⚙️ Configuración del proyecto →
  Cuentas de servicio → Generar nueva clave privada). Pega el contenido
  completo en una sola línea.
- `FIREBASE_DATABASE_URL`: la URL de tu Realtime Database (la misma que usa
  `tpv-9.html`).
- `ENCARGADO_WHATSAPP`: el número que recibirá el aviso de pedidos nuevos.

### 2. Subir a GitHub

Sube esta carpeta a un repositorio nuevo (por ejemplo
`hottodigital-assistant`) desde github.com en el navegador del móvil:
crea el repo vacío y usa "Upload files" para subir todo.

### 3. Desplegar en Railway

1. Entra a railway.app con tu cuenta de GitHub.
2. "New Project" → "Deploy from GitHub repo" → selecciona el repo.
3. En la pestaña "Variables", añade todas las de tu `.env` (una por una).
4. Railway hará el deploy solo. Cuando termine, te dará una URL pública tipo
   `https://tu-proyecto.up.railway.app`.

### 4. Configurar el webhook en Meta

1. En developers.facebook.com → tu app → WhatsApp → Configuración.
2. En "Webhook", pon:
   - Callback URL: `https://tu-proyecto.up.railway.app/webhook`
   - Verify token: el mismo que pusiste en `WHATSAPP_VERIFY_TOKEN`
3. Suscríbete al campo `messages`.

A partir de ahí, cualquier mensaje al número de prueba (o al tuyo cuando
migres a producción) debería llegar al bot y recibir respuesta.

## Estructura del proyecto

```
server.js              punto de entrada
routes/webhook.js       recibe y responde mensajes de WhatsApp
services/whatsapp.js    enviar texto, descargar audio, marcar leído
services/ia.js          GPT-4o + Whisper + function calling
services/reservas.js    lectura/escritura de /reservas en Firebase
services/pedidos.js     lectura/escritura de /pedidosWhatsapp en Firebase
config/firebase.js      conexión a Firebase Admin SDK
```
