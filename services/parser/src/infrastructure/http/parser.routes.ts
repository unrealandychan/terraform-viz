import { Router, type Request, type Response } from "express";
import { parsePlanUseCase } from "../../application/parse-plan.use-case.js";

export const parserRouter = Router();

parserRouter.post("/parse", (request: Request, response: Response): void => {
  const result = parsePlanUseCase(request.body);

  if (result.success) {
    response.status(200).json(result.data);
    return;
  }

  response.status(400).json({ error: result.error });
});

parserRouter.get("/health", (_request: Request, response: Response): void => {
  response.status(200).json({ status: "ok", service: "parser" });
});
