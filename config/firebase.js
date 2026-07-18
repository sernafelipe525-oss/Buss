const admin = require("firebase-admin");

let initialized = false;

function initFirebase() {
  if (initialized) return admin;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw || raw === "{}") {
    throw new Error(
      "Falta FIREBASE_SERVICE_ACCOUNT_JSON en las variables de entorno. " +
      "Genera la clave privada desde Firebase Console > Configuracion del proyecto > Cuentas de servicio."
    );
  }

  const serviceAccount = JSON.parse(raw);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });

  initialized = true;
  return admin;
}

function db() {
  return initFirebase().database();
}

module.exports = { initFirebase, db };
