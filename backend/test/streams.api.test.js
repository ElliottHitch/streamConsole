import Database from "better-sqlite3";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createStreamsRepository, ensureStreamsTable } from "../src/db/streamsRepository.js";

const validPayload = {
  title: "Launch Stream",
  description: "Ship the MVP",
  scheduledAt: "2026-05-01T17:30:00.000Z",
  timezone: "America/New_York",
  platforms: ["youtube", "facebook"]
};

describe("streams API", () => {
  let db;
  let app;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    ensureStreamsTable(db);
    app = createApp({ streamsRepository: createStreamsRepository(db) });
  });

  afterEach(() => {
    db.close();
  });

  it("creates a stream and initializes sync rows", async () => {
    const response = await request(app).post("/api/streams").send(validPayload);

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      id: 1,
      title: validPayload.title,
      description: validPayload.description,
      timezone: validPayload.timezone,
      platforms: validPayload.platforms
    });
    expect(response.body.data.syncStates).toEqual([
      expect.objectContaining({ platform: "facebook", status: "draft", externalId: null, lastError: null }),
      expect.objectContaining({ platform: "youtube", status: "draft", externalId: null, lastError: null })
    ]);
  });

  it("validates required fields and supported platforms", async () => {
    const response = await request(app).post("/api/streams").send({
      ...validPayload,
      title: "",
      platforms: ["twitch"]
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "title" }),
        expect.objectContaining({ field: "platforms" })
      ])
    );
  });

  it("supports full CRUD flow and keeps sync rows aligned with platforms", async () => {
    const created = await request(app).post("/api/streams").send(validPayload);
    const id = created.body.data.id;

    const list = await request(app).get("/api/streams");
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].syncStates).toHaveLength(2);

    const fetched = await request(app).get(`/api/streams/${id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.data.id).toBe(id);

    const updated = await request(app)
      .put(`/api/streams/${id}`)
      .send({
        ...validPayload,
        title: "Updated Title",
        scheduledAt: "2026-05-02T17:30:00.000Z",
        platforms: ["youtube"]
      });
    expect(updated.status).toBe(200);
    expect(updated.body.data.title).toBe("Updated Title");
    expect(updated.body.data.syncStates).toEqual([
      expect.objectContaining({ platform: "youtube", status: "draft" })
    ]);

    const removed = await request(app).delete(`/api/streams/${id}`);
    expect(removed.status).toBe(204);

    const afterDelete = await request(app).get(`/api/streams/${id}`);
    expect(afterDelete.status).toBe(404);
  });

  it("returns validation errors for invalid ids", async () => {
    const response = await request(app).get("/api/streams/not-a-number");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("syncs youtube and facebook successfully", async () => {
    const created = await request(app).post("/api/streams").send(validPayload);
    const id = created.body.data.id;

    const syncResponse = await request(app).post(`/api/streams/${id}/sync`).send();

    expect(syncResponse.status).toBe(200);
    expect(syncResponse.body.data).toEqual([
      expect.objectContaining({ platform: "facebook", status: "synced", externalId: `fb_${id}`, lastError: null }),
      expect.objectContaining({ platform: "youtube", status: "synced", externalId: `yt_${id}`, lastError: null })
    ]);

    const statusResponse = await request(app).get(`/api/streams/${id}/sync-status`);
    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body.data).toEqual(syncResponse.body.data);
  });

  it("fails youtube sync deterministically", async () => {
    const created = await request(app).post("/api/streams").send({
      ...validPayload,
      title: "Launch [fail-youtube]"
    });
    const id = created.body.data.id;

    const syncResponse = await request(app).post(`/api/streams/${id}/sync`).send();

    expect(syncResponse.status).toBe(200);
    expect(syncResponse.body.data).toEqual([
      expect.objectContaining({ platform: "facebook", status: "synced", externalId: `fb_${id}`, lastError: null }),
      expect.objectContaining({
        platform: "youtube",
        status: "failed",
        externalId: null,
        lastError: "YouTube sync failed in stub adapter."
      })
    ]);
  });

  it("fails facebook sync deterministically", async () => {
    const created = await request(app).post("/api/streams").send({
      ...validPayload,
      title: "Launch [fail-facebook]"
    });
    const id = created.body.data.id;

    const syncResponse = await request(app).post(`/api/streams/${id}/sync`).send();

    expect(syncResponse.status).toBe(200);
    expect(syncResponse.body.data).toEqual([
      expect.objectContaining({
        platform: "facebook",
        status: "failed",
        externalId: null,
        lastError: "Facebook sync failed in stub adapter."
      }),
      expect.objectContaining({ platform: "youtube", status: "synced", externalId: `yt_${id}`, lastError: null })
    ]);
  });

  it("supports mixed sync outcomes across platforms", async () => {
    const created = await request(app).post("/api/streams").send({
      ...validPayload,
      title: "Launch [fail-youtube]",
      platforms: ["youtube", "facebook"]
    });
    const id = created.body.data.id;

    const syncResponse = await request(app).post(`/api/streams/${id}/sync`).send();
    const youtubeState = syncResponse.body.data.find((item) => item.platform === "youtube");
    const facebookState = syncResponse.body.data.find((item) => item.platform === "facebook");

    expect(youtubeState).toMatchObject({
      status: "failed",
      externalId: null,
      lastError: "YouTube sync failed in stub adapter."
    });
    expect(facebookState).toMatchObject({
      status: "synced",
      externalId: `fb_${id}`,
      lastError: null
    });
  });

  it("retries after failure when the title is fixed", async () => {
    const created = await request(app).post("/api/streams").send({
      ...validPayload,
      title: "Launch [fail-youtube]"
    });
    const id = created.body.data.id;

    const firstSync = await request(app).post(`/api/streams/${id}/sync`).send();
    const firstYoutubeState = firstSync.body.data.find((item) => item.platform === "youtube");
    expect(firstYoutubeState).toMatchObject({
      status: "failed",
      lastError: "YouTube sync failed in stub adapter."
    });

    const updated = await request(app)
      .put(`/api/streams/${id}`)
      .send({
        ...validPayload,
        title: "Launch fixed"
      });
    expect(updated.status).toBe(200);

    const secondSync = await request(app).post(`/api/streams/${id}/sync`).send();
    const secondYoutubeState = secondSync.body.data.find((item) => item.platform === "youtube");
    const secondFacebookState = secondSync.body.data.find((item) => item.platform === "facebook");

    expect(secondYoutubeState).toMatchObject({
      status: "synced",
      externalId: `yt_${id}`,
      lastError: null
    });
    expect(secondFacebookState).toMatchObject({
      status: "synced",
      externalId: `fb_${id}`,
      lastError: null
    });
  });
});
