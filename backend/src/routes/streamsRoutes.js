import { Router } from "express";
import { AppError } from "../errors.js";
import { validateIdParam, validateStreamPayload } from "../validation/streamValidation.js";

export function createStreamsRouter(streamsRepository, platformAdapters) {
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

  router.get("/:id/sync-status", (req, res, next) => {
    try {
      const id = validateIdParam(req.params.id);
      const stream = streamsRepository.findById(id);

      if (!stream) {
        throw new AppError(404, "Stream not found.", "NOT_FOUND");
      }

      res.json({ data: streamsRepository.listSyncStates(id) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/sync", async (req, res, next) => {
    try {
      const id = validateIdParam(req.params.id);
      const stream = streamsRepository.findById(id);

      if (!stream) {
        throw new AppError(404, "Stream not found.", "NOT_FOUND");
      }

      for (const platform of stream.platforms) {
        streamsRepository.updateSyncState(id, platform, {
          externalId: null,
          status: "pending",
          lastError: null
        });

        try {
          const result = await platformAdapters[platform].schedule(stream);
          streamsRepository.updateSyncState(id, platform, {
            externalId: result.externalId,
            status: "synced",
            lastError: null
          });
        } catch (error) {
          streamsRepository.updateSyncState(id, platform, {
            externalId: null,
            status: "failed",
            lastError: error instanceof Error ? error.message : "Unknown sync error."
          });
        }
      }

      res.json({ data: streamsRepository.listSyncStates(id) });
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
