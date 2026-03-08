function mapRow(row) {
  if (!row) {
    return null;
  }

  let platforms = [];
  try {
    platforms = JSON.parse(row.platforms ?? "[]");
  } catch {
    platforms = [];
  }

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    scheduledAt: row.scheduled_at,
    timezone: row.timezone,
    platforms,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function ensureStreamsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS streams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      scheduled_at TEXT NOT NULL,
      timezone TEXT NOT NULL,
      platforms TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

export function createStreamsRepository(db) {
  return {
    list() {
      const rows = db.prepare("SELECT * FROM streams ORDER BY scheduled_at ASC, id ASC").all();
      return rows.map(mapRow);
    },

    findById(id) {
      const row = db.prepare("SELECT * FROM streams WHERE id = ?").get(id);
      return mapRow(row);
    },

    create(stream) {
      const now = new Date().toISOString();
      const result = db
        .prepare(
          `
          INSERT INTO streams (title, description, scheduled_at, timezone, platforms, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `
        )
        .run(
          stream.title,
          stream.description,
          stream.scheduledAt,
          stream.timezone,
          JSON.stringify(stream.platforms),
          now,
          now
        );

      return this.findById(result.lastInsertRowid);
    },

    update(id, stream) {
      const existing = this.findById(id);
      if (!existing) {
        return null;
      }

      const now = new Date().toISOString();
      db.prepare(
        `
        UPDATE streams
        SET title = ?, description = ?, scheduled_at = ?, timezone = ?, platforms = ?, updated_at = ?
        WHERE id = ?
      `
      ).run(
        stream.title,
        stream.description,
        stream.scheduledAt,
        stream.timezone,
        JSON.stringify(stream.platforms),
        now,
        id
      );

      return this.findById(id);
    },

    remove(id) {
      const result = db.prepare("DELETE FROM streams WHERE id = ?").run(id);
      return result.changes > 0;
    }
  };
}