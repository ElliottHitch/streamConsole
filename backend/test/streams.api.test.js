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
    ensureStreamsTable(db);
    app = createApp({ streamsRepository: createStreamsRepository(db) });
  });

  afterEach(() => {
    db.close();
  });

  it("creates a stream and returns it", async () => {
    const response = await request(app).post("/api/streams").send(validPayload);

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      id: 1,
      title: validPayload.title,
      description: validPayload.description,
      timezone: validPayload.timezone,
      platforms: validPayload.platforms
    });
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

  it("supports full CRUD flow", async () => {
    const created = await request(app).post("/api/streams").send(validPayload);
    const id = created.body.data.id;

    const list = await request(app).get("/api/streams");
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);

    const fetched = await request(app).get(`/api/streams/${id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.data.id).toBe(id);

    const updated = await request(app)
      .put(`/api/streams/${id}`)
      .send({
        ...validPayload,
        title: "Updated Title",
        scheduledAt: "2026-05-02T17:30:00.000Z"
      });
    expect(updated.status).toBe(200);
    expect(updated.body.data.title).toBe("Updated Title");

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
});