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

function mapSyncRow(row) {
  if (!row) {
    return null;
  }

  return {
    streamId: row.stream_id,
    platform: row.platform,
    externalId: row.external_id,
    externalStreamId: row.external_stream_id,
    status: row.status,
    lastError: row.last_error,
    updatedAt: row.updated_at
  };
}

function ensureColumn(db, tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (columns.some((column) => column.name === columnName)) {
    return;
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
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

    CREATE TABLE IF NOT EXISTS stream_platform_sync (
      stream_id INTEGER NOT NULL,
      platform TEXT NOT NULL,
      external_id TEXT,
      external_stream_id TEXT,
      status TEXT NOT NULL,
      last_error TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (stream_id, platform),
      FOREIGN KEY (stream_id) REFERENCES streams(id) ON DELETE CASCADE
    );
  `);

  ensureColumn(db, "stream_platform_sync", "external_stream_id", "TEXT");
}

export function createStreamsRepository(db) {
  const listSyncStatesStatement = db.prepare(
    `
    SELECT stream_id, platform, external_id, external_stream_id, status, last_error, updated_at
    FROM stream_platform_sync
    WHERE stream_id = ?
    ORDER BY platform ASC
  `
  );
  const insertSyncStateStatement = db.prepare(
    `
    INSERT OR IGNORE INTO stream_platform_sync (
      stream_id,
      platform,
      external_id,
      external_stream_id,
      status,
      last_error,
      updated_at
    )
    VALUES (?, ?, NULL, NULL, 'draft', NULL, ?)
  `
  );
  const deleteRemovedSyncStatesStatement = db.prepare(
    "DELETE FROM stream_platform_sync WHERE stream_id = ? AND platform = ?"
  );
  const deleteAllSyncStatesStatement = db.prepare("DELETE FROM stream_platform_sync WHERE stream_id = ?");
  const updateSyncStateStatement = db.prepare(
    `
    UPDATE stream_platform_sync
    SET external_id = ?, external_stream_id = ?, status = ?, last_error = ?, updated_at = ?
    WHERE stream_id = ? AND platform = ?
  `
  );

  function listSyncStates(streamId) {
    return listSyncStatesStatement.all(streamId).map(mapSyncRow);
  }

  function attachSyncStates(stream) {
    if (!stream) {
      return null;
    }

    return {
      ...stream,
      syncStates: listSyncStates(stream.id)
    };
  }

  function syncPlatformRows(streamId, platforms) {
    const now = new Date().toISOString();
    const existingPlatforms = new Set(listSyncStates(streamId).map((item) => item.platform));

    for (const platform of platforms) {
      insertSyncStateStatement.run(streamId, platform, now);
      existingPlatforms.delete(platform);
    }

    for (const platform of existingPlatforms) {
      deleteRemovedSyncStatesStatement.run(streamId, platform);
    }
  }

  return {
    list() {
      const rows = db.prepare("SELECT * FROM streams ORDER BY scheduled_at ASC, id ASC").all();
      return rows.map((row) => {
        const stream = mapRow(row);
        syncPlatformRows(stream.id, stream.platforms);
        return attachSyncStates(stream);
      });
    },

    findById(id) {
      const row = db.prepare("SELECT * FROM streams WHERE id = ?").get(id);
      const stream = mapRow(row);
      if (!stream) {
        return null;
      }

      syncPlatformRows(stream.id, stream.platforms);
      return attachSyncStates(stream);
    },

    create(stream) {
      const createTransaction = db.transaction((nextStream) => {
        const now = new Date().toISOString();
        const result = db
          .prepare(
            `
            INSERT INTO streams (title, description, scheduled_at, timezone, platforms, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `
          )
          .run(
            nextStream.title,
            nextStream.description,
            nextStream.scheduledAt,
            nextStream.timezone,
            JSON.stringify(nextStream.platforms),
            now,
            now
          );

        syncPlatformRows(result.lastInsertRowid, nextStream.platforms);
        return result.lastInsertRowid;
      });

      const id = createTransaction(stream);
      return this.findById(id);
    },

    update(id, stream) {
      const existing = this.findById(id);
      if (!existing) {
        return null;
      }

      const updateTransaction = db.transaction((streamId, nextStream) => {
        const now = new Date().toISOString();
        db.prepare(
          `
          UPDATE streams
          SET title = ?, description = ?, scheduled_at = ?, timezone = ?, platforms = ?, updated_at = ?
          WHERE id = ?
        `
        ).run(
          nextStream.title,
          nextStream.description,
          nextStream.scheduledAt,
          nextStream.timezone,
          JSON.stringify(nextStream.platforms),
          now,
          streamId
        );

        syncPlatformRows(streamId, nextStream.platforms);
      });

      updateTransaction(id, stream);

      return this.findById(id);
    },

    remove(id) {
      const removeTransaction = db.transaction((streamId) => {
        deleteAllSyncStatesStatement.run(streamId);
        return db.prepare("DELETE FROM streams WHERE id = ?").run(streamId);
      });
      const result = removeTransaction(id);
      return result.changes > 0;
    },

    listSyncStates(streamId) {
      return listSyncStates(streamId);
    },

    updateSyncState(streamId, platform, values) {
      updateSyncStateStatement.run(
        values.externalId ?? null,
        values.externalStreamId ?? null,
        values.status,
        values.lastError ?? null,
        new Date().toISOString(),
        streamId,
        platform
      );

      return this.listSyncStates(streamId);
    }
  };
}
