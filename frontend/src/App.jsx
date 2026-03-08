import { useEffect, useMemo, useState } from "react";
import { ApiError, createStream, deleteStream, listStreams, updateStream } from "./api";

const defaultTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

function createInitialFormState() {
  return {
    title: "",
    description: "",
    scheduledAt: "",
    timezone: defaultTimezone,
    platforms: "youtube"
  };
}

function toPayload(form) {
  return {
    title: form.title,
    description: form.description,
    scheduledAt: new Date(form.scheduledAt).toISOString(),
    timezone: form.timezone,
    platforms: form.platforms
      .split(",")
      .map((platform) => platform.trim().toLowerCase())
      .filter(Boolean)
  };
}

function formatApiError(error) {
  if (error instanceof ApiError) {
    if (Array.isArray(error.details) && error.details.length > 0) {
      return `${error.message} ${error.details.map((d) => `${d.field}: ${d.message}`).join(" ")}`;
    }
    return error.message;
  }

  return "Unexpected UI error.";
}

function toInputDateTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const timezoneOffsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
}

export default function App() {
  const [streams, setStreams] = useState([]);
  const [form, setForm] = useState(createInitialFormState);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadStreams() {
    setLoading(true);
    setError("");

    try {
      const data = await listStreams();
      setStreams(data);
    } catch (loadError) {
      setError(formatApiError(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStreams();
  }, []);

  const formTitle = useMemo(() => (editingId ? "Edit Stream" : "Create Stream"), [editingId]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    let payload;
    try {
      payload = toPayload(form);
    } catch {
      setError("scheduledAt must be a valid date/time.");
      return;
    }

    try {
      if (editingId) {
        await updateStream(editingId, payload);
      } else {
        await createStream(payload);
      }

      setForm(createInitialFormState());
      setEditingId(null);
      await loadStreams();
    } catch (submitError) {
      setError(formatApiError(submitError));
    }
  }

  function handleEdit(stream) {
    setError("");
    setEditingId(stream.id);
    setForm({
      title: stream.title,
      description: stream.description,
      scheduledAt: toInputDateTime(stream.scheduledAt),
      timezone: stream.timezone,
      platforms: stream.platforms.join(", ")
    });
  }

  async function handleDelete(streamId) {
    setError("");

    try {
      await deleteStream(streamId);
      await loadStreams();
    } catch (deleteError) {
      setError(formatApiError(deleteError));
    }
  }

  function resetForm() {
    setEditingId(null);
    setForm(createInitialFormState());
    setError("");
  }

  return (
    <main className="app-shell">
      <header>
        <h1>streamConsole</h1>
        <p>Schedule livestream metadata with local-first persistence.</p>
      </header>

      {error ? (
        <div className="error-banner" role="alert">
          {error}
        </div>
      ) : null}

      <section className="panel">
        <h2>{formTitle}</h2>
        <form onSubmit={handleSubmit}>
          <label>
            Title
            <input
              required
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            />
          </label>

          <label>
            Description
            <textarea
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            />
          </label>

          <label>
            Scheduled At
            <input
              required
              type="datetime-local"
              value={form.scheduledAt}
              onChange={(event) => setForm((prev) => ({ ...prev, scheduledAt: event.target.value }))}
            />
          </label>

          <label>
            Timezone
            <input
              required
              value={form.timezone}
              onChange={(event) => setForm((prev) => ({ ...prev, timezone: event.target.value }))}
            />
          </label>

          <label>
            Platforms (comma-separated)
            <input
              required
              value={form.platforms}
              onChange={(event) => setForm((prev) => ({ ...prev, platforms: event.target.value }))}
            />
          </label>

          <div className="form-actions">
            <button type="submit">{editingId ? "Save" : "Create"}</button>
            {editingId ? (
              <button type="button" onClick={resetForm}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="panel">
        <h2>Scheduled Streams</h2>
        {loading ? <p>Loading streams...</p> : null}
        {!loading && streams.length === 0 ? <p>No streams scheduled.</p> : null}
        <ul className="stream-list">
          {streams.map((stream) => (
            <li key={stream.id}>
              <div>
                <h3>{stream.title}</h3>
                <p>{stream.description || "No description"}</p>
                <p>
                  {new Date(stream.scheduledAt).toLocaleString()} ({stream.timezone})
                </p>
                <p>Platforms: {stream.platforms.join(", ")}</p>
              </div>
              <div className="row-actions">
                <button type="button" onClick={() => handleEdit(stream)}>
                  Edit
                </button>
                <button type="button" className="danger" onClick={() => handleDelete(stream.id)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}