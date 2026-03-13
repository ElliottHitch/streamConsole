import { AppError } from "../errors.js";
import { SUPPORTED_PLATFORMS } from "../services/platformAdapters.js";

function normalizePlatforms(platforms) {
  if (!Array.isArray(platforms)) {
    return [];
  }

  return platforms
    .map((platform) => (typeof platform === "string" ? platform.trim().toLowerCase() : ""))
    .filter(Boolean);
}

export function validateIdParam(rawId) {
  const id = Number.parseInt(rawId, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(400, "Invalid stream id.", "VALIDATION_ERROR", [
      { field: "id", message: "Stream id must be a positive integer." }
    ]);
  }
  return id;
}

export function validateStreamPayload(payload) {
  const details = [];

  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  if (!title) {
    details.push({ field: "title", message: "Title is required." });
  }

  const description =
    payload.description === undefined || payload.description === null
      ? ""
      : String(payload.description).trim();

  const scheduledAtRaw = typeof payload.scheduledAt === "string" ? payload.scheduledAt.trim() : "";
  const parsedDate = Date.parse(scheduledAtRaw);
  if (!scheduledAtRaw || Number.isNaN(parsedDate)) {
    details.push({ field: "scheduledAt", message: "scheduledAt must be a valid date string." });
  }

  const timezone = typeof payload.timezone === "string" ? payload.timezone.trim() : "";
  if (!timezone) {
    details.push({ field: "timezone", message: "timezone is required." });
  }

  const platforms = normalizePlatforms(payload.platforms);
  if (platforms.length === 0) {
    details.push({ field: "platforms", message: "At least one platform is required." });
  }

  const invalidPlatforms = platforms.filter((platform) => !SUPPORTED_PLATFORMS.includes(platform));
  if (invalidPlatforms.length > 0) {
    details.push({
      field: "platforms",
      message: `Unsupported platform(s): ${invalidPlatforms.join(", ")}. Supported: ${SUPPORTED_PLATFORMS.join(", ")}.`
    });
  }

  if (details.length > 0) {
    throw new AppError(400, "Validation failed.", "VALIDATION_ERROR", details);
  }

  return {
    title,
    description,
    scheduledAt: new Date(parsedDate).toISOString(),
    timezone,
    platforms
  };
}