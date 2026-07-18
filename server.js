require("dotenv").config();
const express = require("express");
const webhookRoutes = require("./routes/webhook");

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.send("HottoDigital Assistant activo ✅");
});

app.use("/webhook", webhookRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
});
