import { Router } from "express";
import { renderOAuthResultPage } from "../services/youtubeIntegrationService.js";

export function createIntegrationsRouter(youtubeIntegrationService) {
  const router = Router();

  router.get("/youtube/status", (_req, res, next) => {
    try {
      res.json({ data: youtubeIntegrationService.getStatus() });
    } catch (error) {
      next(error);
    }
  });

  router.get("/youtube/connect", (_req, res) => {
    try {
      res.redirect(youtubeIntegrationService.getConnectUrl());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start YouTube OAuth.";
      res.status(500).type("html").send(
        renderOAuthResultPage({
          success: false,
          message
        })
      );
    }
  });

  router.get("/youtube/callback", async (req, res) => {
    try {
      if (typeof req.query.error === "string" && req.query.error.length > 0) {
        throw new Error(`Google OAuth returned: ${req.query.error}.`);
      }

      const code = typeof req.query.code === "string" ? req.query.code : "";
      const state = typeof req.query.state === "string" ? req.query.state : "";
      if (!code) {
        throw new Error("Google OAuth callback did not include an authorization code.");
      }

      await youtubeIntegrationService.handleCallback(code, state);
      res.type("html").send(
        renderOAuthResultPage({
          success: true,
          message: "YouTube is connected. Return to streamConsole."
        })
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? youtubeIntegrationService.parseError(error, "Unable to finish YouTube OAuth.")
          : "Unable to finish YouTube OAuth.";

      res.status(400).type("html").send(
        renderOAuthResultPage({
          success: false,
          message
        })
      );
    }
  });

  return router;
}
