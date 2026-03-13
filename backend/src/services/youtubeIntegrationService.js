import crypto from "node:crypto";
import { google } from "googleapis";

const YOUTUBE_OAUTH_SCOPES = ["https://www.googleapis.com/auth/youtube"];
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function formatExpiryDate(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  return new Date(value).toISOString();
}

function toGoogleExpiryDate(value) {
  if (!value) {
    return undefined;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function parseGoogleErrorMessage(error, fallbackMessage) {
  if (error?.response?.data?.error?.message) {
    return error.response.data.error.message;
  }

  if (Array.isArray(error?.errors) && error.errors[0]?.message) {
    return error.errors[0].message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallbackMessage;
}

function buildBroadcastDescription(stream) {
  const parts = [];

  if (stream.description?.trim()) {
    parts.push(stream.description.trim());
  }

  parts.push(`Timezone: ${stream.timezone}`);
  return parts.join("\n\n");
}

function createStateStore() {
  const states = new Map();

  function prune() {
    const now = Date.now();
    for (const [state, expiresAt] of states.entries()) {
      if (expiresAt <= now) {
        states.delete(state);
      }
    }
  }

  return {
    issue() {
      prune();
      const state = crypto.randomBytes(24).toString("hex");
      states.set(state, Date.now() + OAUTH_STATE_TTL_MS);
      return state;
    },

    consume(state) {
      prune();
      if (!state || !states.has(state)) {
        return false;
      }

      states.delete(state);
      return true;
    }
  };
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderOAuthResultPage({ success, message }) {
  const title = success ? "YouTube connected" : "YouTube connection failed";
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #0b1220;
        color: #eef4ff;
        font: 16px/1.5 "Segoe UI", sans-serif;
      }
      main {
        max-width: 460px;
        padding: 24px;
        border-radius: 18px;
        background: rgba(17, 25, 40, 0.92);
        border: 1px solid rgba(255, 255, 255, 0.12);
        box-shadow: 0 24px 48px rgba(2, 8, 23, 0.35);
      }
      h1 {
        margin: 0 0 12px;
        font-size: 28px;
      }
      p {
        margin: 0;
        color: rgba(238, 244, 255, 0.82);
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${safeTitle}</h1>
      <p>${safeMessage}</p>
    </main>
    <script>
      window.opener?.focus?.();
    </script>
  </body>
</html>`;
}

export function createYouTubeIntegrationService({
  integrationsRepository,
  env = process.env,
  googleApi = google,
  stateStore = createStateStore()
}) {
  function isConfigured() {
    return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI);
  }

  function createOAuthClient(connection = null) {
    const oauth2Client = new googleApi.auth.OAuth2(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
      env.GOOGLE_REDIRECT_URI
    );

    if (connection) {
      oauth2Client.setCredentials({
        access_token: connection.accessToken,
        refresh_token: connection.refreshToken ?? undefined,
        expiry_date: toGoogleExpiryDate(connection.expiryDate)
      });

      oauth2Client.on("tokens", (tokens) => {
        if (!tokens.access_token && !tokens.refresh_token && !tokens.expiry_date) {
          return;
        }

        integrationsRepository.updateYouTubeTokens({
          accessToken: tokens.access_token ?? connection.accessToken,
          refreshToken: tokens.refresh_token ?? connection.refreshToken,
          expiryDate:
            tokens.expiry_date === undefined ? connection.expiryDate : formatExpiryDate(tokens.expiry_date)
        });
      });
    }

    return oauth2Client;
  }

  function createYouTubeClient(auth) {
    return googleApi.youtube({
      version: "v3",
      auth
    });
  }

  function getStatus() {
    const connection = integrationsRepository.getYouTubeConnection();

    return {
      platform: "youtube",
      configured: isConfigured(),
      connected: Boolean(connection),
      accountLabel: connection?.accountLabel ?? null,
      channelId: connection?.channelId ?? null,
      scope: connection?.scope ?? null,
      expiryDate: connection?.expiryDate ?? null,
      updatedAt: connection?.updatedAt ?? null
    };
  }

  return {
    isConfigured,
    getStatus,

    getConnectUrl() {
      if (!isConfigured()) {
        throw new Error("Google OAuth is not configured on the server.");
      }

      const oauth2Client = createOAuthClient();
      const state = stateStore.issue();

      return oauth2Client.generateAuthUrl({
        access_type: "offline",
        include_granted_scopes: true,
        prompt: "consent",
        scope: YOUTUBE_OAUTH_SCOPES,
        state
      });
    },

    async handleCallback(code, state) {
      if (!isConfigured()) {
        throw new Error("Google OAuth is not configured on the server.");
      }

      if (!stateStore.consume(state)) {
        throw new Error("Invalid or expired YouTube OAuth state.");
      }

      const oauth2Client = createOAuthClient();
      const { tokens } = await oauth2Client.getToken(code);
      if (!tokens.access_token) {
        throw new Error("Google OAuth did not return an access token.");
      }

      oauth2Client.setCredentials(tokens);
      const youtube = createYouTubeClient(oauth2Client);
      const channelResponse = await youtube.channels.list({
        part: "id,snippet",
        mine: true
      });
      const channel = channelResponse.data.items?.[0];

      integrationsRepository.saveYouTubeConnection({
        accountLabel: channel?.snippet?.title ?? "YouTube account",
        channelId: channel?.id ?? null,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        expiryDate: formatExpiryDate(tokens.expiry_date),
        scope: typeof tokens.scope === "string" && tokens.scope.length > 0 ? tokens.scope : YOUTUBE_OAUTH_SCOPES.join(" ")
      });

      return getStatus();
    },

    async scheduleStream(stream) {
      const connection = integrationsRepository.getYouTubeConnection();
      if (!connection) {
        throw new Error("YouTube is not connected. Connect YouTube before syncing.");
      }

      if (!isConfigured()) {
        throw new Error("Google OAuth is not configured on the server.");
      }

      const oauth2Client = createOAuthClient(connection);
      const youtube = createYouTubeClient(oauth2Client);

      try {
        const broadcastResponse = await youtube.liveBroadcasts.insert({
          part: "snippet,status,contentDetails",
          requestBody: {
            snippet: {
              title: stream.title,
              description: buildBroadcastDescription(stream),
              scheduledStartTime: stream.scheduledAt
            },
            status: {
              privacyStatus: "private"
            },
            contentDetails: {
              enableAutoStart: false,
              enableAutoStop: false
            }
          }
        });
        const broadcastId = broadcastResponse.data.id;
        if (!broadcastId) {
          throw new Error("YouTube did not return a broadcast id.");
        }

        const liveStreamResponse = await youtube.liveStreams.insert({
          part: "snippet,cdn,contentDetails",
          requestBody: {
            snippet: {
              title: `${stream.title} ingest`,
              description: `Ingest stream for ${stream.title}`
            },
            cdn: {
              frameRate: "variable",
              ingestionType: "rtmp",
              resolution: "variable"
            },
            contentDetails: {
              isReusable: true
            }
          }
        });
        const liveStreamId = liveStreamResponse.data.id;
        if (!liveStreamId) {
          throw new Error("YouTube did not return a stream id.");
        }

        await youtube.liveBroadcasts.bind({
          part: "id,snippet,status,contentDetails",
          id: broadcastId,
          streamId: liveStreamId
        });

        return {
          externalId: broadcastId,
          externalStreamId: liveStreamId
        };
      } catch (error) {
        throw new Error(parseGoogleErrorMessage(error, "YouTube sync failed."));
      }
    },

    parseError(error, fallbackMessage) {
      return parseGoogleErrorMessage(error, fallbackMessage);
    }
  };
}
