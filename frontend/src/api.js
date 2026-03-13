const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(message, status, details = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

async function parseError(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = await response.json();
    return {
      message: body.error?.message ?? `Request failed with status ${response.status}`,
      details: body.error?.details ?? null
    };
  }

  const text = await response.text();
  return {
    message: text || `Request failed with status ${response.status}`,
    details: null
  };
}

async function request(path, options = {}) {
  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
  } catch {
    throw new ApiError("Unable to reach backend. Check that API server is running.", 0);
  }

  if (!response.ok) {
    const { message, details } = await parseError(response);
    throw new ApiError(message, response.status, details);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export async function listStreams() {
  const payload = await request("/api/streams");
  return payload.data;
}

export async function createStream(stream) {
  const payload = await request("/api/streams", {
    method: "POST",
    body: JSON.stringify(stream)
  });
  return payload.data;
}

export async function updateStream(id, stream) {
  const payload = await request(`/api/streams/${id}`, {
    method: "PUT",
    body: JSON.stringify(stream)
  });
  return payload.data;
}

export async function deleteStream(id) {
  await request(`/api/streams/${id}`, {
    method: "DELETE"
  });
}

export async function syncStream(id) {
  const payload = await request(`/api/streams/${id}/sync`, {
    method: "POST"
  });
  return payload.data;
}
