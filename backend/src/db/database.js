import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { createStreamsRepository, ensureStreamsTable } from "./streamsRepository.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function defaultDatabasePath() {
  return path.resolve(__dirname, "../../data/streamConsole.sqlite");
}

export function createDatabase(dbPath = defaultDatabasePath()) {
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  ensureStreamsTable(db);

  return {
    db,
    streamsRepository: createStreamsRepository(db)
  };
}