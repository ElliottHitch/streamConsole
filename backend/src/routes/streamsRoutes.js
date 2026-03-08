import { Router } from "express";
import { AppError } from "../errors.js";
import { validateIdParam, validateStreamPayload } from "../validation/streamValidation.js";

export function createStreamsRouter(streamsRepository) {
  const router = Router();

  router.get("/", (_req, res, next) => {
    try {
      res.json({ data: streamsRepository.list() });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id", (req, res, next) => {
    try {
      const stream = streamsRepository.findById(validateIdParam(req.params.id));
      if (!stream) {
        throw new AppError(404, "Stream not found.", "NOT_FOUND");
      }

      res.json({ data: stream });
    } catch (error) {
      next(error);
    }
  });

  router.post("/", (req, res, next) => {
    try {
      const created = streamsRepository.create(validateStreamPayload(req.body ?? {}));
      res.status(201).json({ data: created });
    } catch (error) {
      next(error);
    }
  });

  router.put("/:id", (req, res, next) => {
    try {
      const id = validateIdParam(req.params.id);
      const updated = streamsRepository.update(id, validateStreamPayload(req.body ?? {}));
      if (!updated) {
        throw new AppError(404, "Stream not found.", "NOT_FOUND");
      }

      res.json({ data: updated });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id", (req, res, next) => {
    try {
      const removed = streamsRepository.remove(validateIdParam(req.params.id));
      if (!removed) {
        throw new AppError(404, "Stream not found.", "NOT_FOUND");
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}