import cors from "cors";
import express from "express";
import { createStreamsRouter } from "./routes/streamsRoutes.js";
import { AppError, isAppError } from "./errors.js";
import { createPlatformAdapters } from "./services/platformAdapters.js";

export function createApp({ streamsRepository, platformAdapters = createPlatformAdapters() }) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/streams", createStreamsRouter(streamsRepository, platformAdapters));

  app.use((req, _res, next) => {
    next(new AppError(404, `Route not found: ${req.method} ${req.originalUrl}`, "NOT_FOUND"));
  });

  app.use((error, _req, res, _next) => {
    if (error instanceof SyntaxError && "body" in error) {
      return res.status(400).json({
        error: {
          code: "INVALID_JSON",
          message: "Request body contains invalid JSON."
        }
      });
    }

    if (isAppError(error)) {
      return res.status(error.status).json({
        error: {
          code: error.code,
          message: error.message,
          details: error.details
        }
      });
    }

    console.error(error);
    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unexpected server error."
      }
    });
  });

  return app;
}
