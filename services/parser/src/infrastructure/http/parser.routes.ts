import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { parsePlanUseCase } from "../../application/parse-plan.use-case.js";

export const parserRouter = Router();

const parseSchema = z.record(z.string(), z.unknown());

parserRouter.post("/parse", (request: Request, response: Response): void => {
  const parsed = parseSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Validation failed", details: parsed.error });
    return;
  }
  const result = parsePlanUseCase(parsed.data);

  if (result.success) {
    response.status(200).json(result.data);
    return;
  }

  response.status(400).json({ error: result.error });
});

parserRouter.get("/health", (_request: Request, response: Response): void => {
  response.status(200).json({ status: "ok", service: "parser" });
});
