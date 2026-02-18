import { Router } from "express";
import { validate } from "../middlewares/validation";
import { ExecutionController } from "../controllers/execution.controller";
import { executionQuerySchema } from "../../types/backup.types";

export const executionsRouter = Router();

executionsRouter.get(
  "/",
  validate(executionQuerySchema, "query"),
  ExecutionController.list,
);
executionsRouter.get("/:id", ExecutionController.findById);
executionsRouter.post("/:id/cancel", ExecutionController.cancel);
