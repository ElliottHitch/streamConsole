import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, createStream, deleteStream, listStreams, updateStream } from "./api";

const defaultTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const PLATFORM_OPTIONS = ["youtube", "facebook"];
const TIMEZONE_OPTIONS = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Australia/Sydney"
];

function createInitialFormState() {
  return {
    title: "",
    description: "",
    scheduledDate: "",
    scheduledTime: "18:00",
    timezone: defaultTimezone,
    platforms: ["youtube"]
  };
}

function buildScheduledAt(scheduledDate, scheduledTime) {
  if (!scheduledDate || !scheduledTime) {
    throw new Error("Invalid date/time");
  }

  const value = new Date(`${scheduledDate}T${scheduledTime}`);
  if (Number.isNaN(value.getTime())) {
    throw new Error("Invalid date/time");
  }

  return value.toISOString();
}

function toPayload(form) {
  return {
    title: form.title,
    description: form.description,
    scheduledAt: buildScheduledAt(form.scheduledDate, form.scheduledTime),
    timezone: form.timezone,
    platforms: form.platforms
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

function toLocalDateParts(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return {
      scheduledDate: "",
      scheduledTime: "18:00"
    };
  }

  const timezoneOffsetMs = date.getTimezoneOffset() * 60_000;
  const localIso = new Date(date.getTime() - timezoneOffsetMs).toISOString();

  return {
    scheduledDate: localIso.slice(0, 10),
    scheduledTime: localIso.slice(11, 16)
  };
}

function createTimeOptions() {
  const options = [];
  for (let hour = 0; hour < 24; hour += 1) {
    for (const minute of [0, 30]) {
      options.push(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
    }
  }
  return options;
}

function formatPlatformLabel(platform) {
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

function formatTimeLabel(value) {
  const [hourText, minuteText] = value.split(":");
  const hour = Number.parseInt(hourText, 10);
  const suffix = hour >= 12 ? "PM" : "AM";
  const normalizedHour = hour % 12 || 12;
  return `${normalizedHour}:${minuteText} ${suffix}`;
}

export default function App() {
  const [streams, setStreams] = useState([]);
  const [form, setForm] = useState(createInitialFormState);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [modeFlash, setModeFlash] = useState(false);
  const [highlightedStreamId, setHighlightedStreamId] = useState(null);
  const modeFlashTimeoutRef = useRef(null);

  async function loadStreams(showLoadingState = false) {
    if (showLoadingState) {
      setLoading(true);
    }
    setError("");

    try {
      const data = await listStreams();
      setStreams(data);
    } catch (loadError) {
      setError(formatApiError(loadError));
    } finally {
      if (showLoadingState) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    loadStreams(true);
  }, []);

  useEffect(() => {
    if (highlightedStreamId === null) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setHighlightedStreamId(null), 1400);
    return () => window.clearTimeout(timeoutId);
  }, [highlightedStreamId]);

  const timezoneOptions = useMemo(() => {
    if (TIMEZONE_OPTIONS.includes(defaultTimezone)) {
      return TIMEZONE_OPTIONS;
    }

    return [defaultTimezone, ...TIMEZONE_OPTIONS];
  }, []);
  const timeOptions = useMemo(() => createTimeOptions(), []);
  const modeLabel = editingId ? "Editing" : "New";
  const modeDescription = editingId
    ? "Update the details and save."
    : "Add a stream to the list.";

  useEffect(() => {
    return () => {
      if (modeFlashTimeoutRef.current !== null) {
        window.clearTimeout(modeFlashTimeoutRef.current);
      }
    };
  }, []);

  function triggerModeFlash() {
    if (modeFlashTimeoutRef.current !== null) {
      window.clearTimeout(modeFlashTimeoutRef.current);
    }

    setModeFlash(true);
    modeFlashTimeoutRef.current = window.setTimeout(() => {
      setModeFlash(false);
      modeFlashTimeoutRef.current = null;
    }, 700);
  }

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
      let savedStream;

      if (editingId) {
        savedStream = await updateStream(editingId, payload);
      } else {
        savedStream = await createStream(payload);
      }

      setHighlightedStreamId(savedStream.id);
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
    triggerModeFlash();
    const scheduled = toLocalDateParts(stream.scheduledAt);
    setForm({
      title: stream.title,
      description: stream.description,
      scheduledDate: scheduled.scheduledDate,
      scheduledTime: scheduled.scheduledTime,
      timezone: stream.timezone,
      platforms: stream.platforms
    });
  }

  function handlePlatformToggle(platform) {
    setForm((prev) => {
      const nextPlatforms = prev.platforms.includes(platform)
        ? prev.platforms.filter((value) => value !== platform)
        : [...prev.platforms, platform];

      return {
        ...prev,
        platforms: nextPlatforms
      };
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
      <header className="hero">
        <div className="hero-copy">
          <h1>streamConsole</h1>
          <p>Simple stream scheduling.</p>
        </div>
      </header>

      {error ? (
        <div className="error-banner" role="alert">
          {error}
        </div>
      ) : null}

      <section className="content-grid">
        <section className={`panel form-panel${editingId ? " is-editing" : " is-creating"}${modeFlash ? " is-transitioning" : ""}`}>
          <div className="section-heading">
            <div>
              <span className="mode-badge">{modeLabel}</span>
            </div>
            <p>{modeDescription}</p>
          </div>
          <form onSubmit={handleSubmit}>
            <label>
              Title
              <input
                required
                placeholder="Friday launch"
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              />
            </label>

            <label>
              Description
              <textarea
                placeholder="Notes"
                value={form.description}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              />
            </label>

            <div className="schedule-grid">
              <label>
                Date
                <input
                  required
                  type="date"
                  value={form.scheduledDate}
                  onFocus={(event) => event.target.showPicker?.()}
                  onClick={(event) => event.target.showPicker?.()}
                  onChange={(event) => setForm((prev) => ({ ...prev, scheduledDate: event.target.value }))}
                />
              </label>

              <label>
                Time
                <select
                  required
                  value={form.scheduledTime}
                  onChange={(event) => setForm((prev) => ({ ...prev, scheduledTime: event.target.value }))}
                >
                  {timeOptions.map((time) => (
                    <option key={time} value={time}>
                      {formatTimeLabel(time)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="timezone-field">
                Timezone
                <select
                  className="timezone-select"
                  required
                  value={form.timezone}
                  onChange={(event) => setForm((prev) => ({ ...prev, timezone: event.target.value }))}
                >
                  {timezoneOptions.map((timezone) => (
                    <option key={timezone} value={timezone}>
                      {timezone}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <fieldset className="platform-fieldset">
              <legend>Platforms</legend>
              <div className="platform-grid">
                {PLATFORM_OPTIONS.map((platform) => (
                  <label key={platform} className={`platform-option${form.platforms.includes(platform) ? " is-selected" : ""}`}>
                    <input
                      type="checkbox"
                      checked={form.platforms.includes(platform)}
                      onChange={() => handlePlatformToggle(platform)}
                    />
                    <span>{formatPlatformLabel(platform)}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="form-actions">
              <button type="submit">{editingId ? "Save" : "Add Stream"}</button>
              {editingId ? (
                <button type="button" className="secondary-button" onClick={resetForm}>
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        </section>

        <section className="panel list-panel">
          <div className="section-heading">
            <h2>Streams</h2>
            <p>{streams.length}</p>
          </div>
          {loading ? <p className="empty-state">Loading streams...</p> : null}
          {!loading && streams.length === 0 ? <p className="empty-state">No streams yet.</p> : null}
          <ul className="stream-list">
          {streams.map((stream) => (
            <li key={stream.id} className={stream.id === highlightedStreamId ? "is-new-stream" : ""}>
              <div className="stream-card-copy">
                <div className="stream-card-header">
                  <h3>{stream.title}</h3>
                  <div className="platform-chip-row">
                    {stream.platforms.map((platform) => (
                      <span key={platform} className="platform-chip">
                        {formatPlatformLabel(platform)}
                      </span>
                    ))}
                  </div>
                </div>
                <p>{stream.description || "No description"}</p>
                <p className="meta-line">
                  {new Date(stream.scheduledAt).toLocaleString()} ({stream.timezone})
                </p>
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
      </section>
    </main>
  );
}
