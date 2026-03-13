import { createApp } from "./app.js";
import { createDatabase } from "./db/database.js";

const host = process.env.HOST ?? "0.0.0.0";
const port = Number.parseInt(process.env.PORT ?? "4000", 10);
const dbPath = process.env.DB_PATH;

const { db, streamsRepository, integrationsRepository } = createDatabase(dbPath);
const app = createApp({ streamsRepository, integrationsRepository });

const server = app.listen(port, host, () => {
  console.log(`streamConsole backend listening on http://${host}:${port}`);
});

function shutdown(signal) {
  console.log(`Received ${signal}, shutting down...`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
