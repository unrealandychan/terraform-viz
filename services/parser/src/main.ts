import express from "express";
import { parserRouter } from "./infrastructure/http/parser.routes.js";

const PORT = Number(process.env["PORT"] ?? 3001);
const app = express();

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: false }));

app.use((_req, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  next();
});

app.use(parserRouter);

app.listen(PORT, () => {
  process.stdout.write(`[parser] listening on port ${PORT}\n`);
});
