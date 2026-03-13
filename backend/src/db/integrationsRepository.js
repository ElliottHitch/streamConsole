function mapConnectionRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    platform: row.platform,
    accountLabel: row.account_label,
    channelId: row.channel_id,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    expiryDate: row.expiry_date,
    scope: row.scope,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function ensureIntegrationsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS platform_integrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL UNIQUE,
      account_label TEXT NOT NULL,
      channel_id TEXT,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expiry_date TEXT,
      scope TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

export function createIntegrationsRepository(db) {
  const findByPlatformStatement = db.prepare(
    `
    SELECT id, platform, account_label, channel_id, access_token, refresh_token, expiry_date, scope, created_at, updated_at
    FROM platform_integrations
    WHERE platform = ?
  `
  );
  const insertConnectionStatement = db.prepare(
    `
    INSERT INTO platform_integrations (
      platform,
      account_label,
      channel_id,
      access_token,
      refresh_token,
      expiry_date,
      scope,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  );
  const updateConnectionStatement = db.prepare(
    `
    UPDATE platform_integrations
    SET account_label = ?, channel_id = ?, access_token = ?, refresh_token = ?, expiry_date = ?, scope = ?, updated_at = ?
    WHERE platform = ?
  `
  );

  function findByPlatform(platform) {
    return mapConnectionRow(findByPlatformStatement.get(platform));
  }

  return {
    findByPlatform,

    getYouTubeConnection() {
      return findByPlatform("youtube");
    },

    saveYouTubeConnection(connection) {
      const existing = findByPlatform("youtube");
      const now = new Date().toISOString();

      if (!existing) {
        insertConnectionStatement.run(
          "youtube",
          connection.accountLabel,
          connection.channelId ?? null,
          connection.accessToken,
          connection.refreshToken ?? null,
          connection.expiryDate ?? null,
          connection.scope,
          now,
          now
        );
      } else {
        updateConnectionStatement.run(
          connection.accountLabel,
          connection.channelId ?? null,
          connection.accessToken,
          connection.refreshToken ?? existing.refreshToken ?? null,
          connection.expiryDate ?? null,
          connection.scope,
          now,
          "youtube"
        );
      }

      return findByPlatform("youtube");
    },

    updateYouTubeTokens(tokens) {
      const existing = findByPlatform("youtube");
      if (!existing) {
        return null;
      }

      return this.saveYouTubeConnection({
        accountLabel: tokens.accountLabel ?? existing.accountLabel,
        channelId: tokens.channelId ?? existing.channelId,
        accessToken: tokens.accessToken ?? existing.accessToken,
        refreshToken: tokens.refreshToken ?? existing.refreshToken,
        expiryDate: tokens.expiryDate === undefined ? existing.expiryDate : tokens.expiryDate,
        scope: tokens.scope ?? existing.scope
      });
    }
  };
}
