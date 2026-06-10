"use client";

import { useState } from "react";

interface GroupResult {
  slug: string;
}

export function GroupCreator() {
  const [subject, setSubject] = useState("");
  const [result, setResult] = useState<GroupResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function createGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject }),
      });
      const payload = (await response.json()) as GroupResult & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not create room");
      setResult(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create room");
    } finally {
      setLoading(false);
    }
  }

  const roomUrl = result
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/trip/${result.slug}`
    : "";

  return (
    <aside className="creator-card">
      <div className="creator-status">
        <span />
        Free · self-hosted · no app
      </div>
      <h2>Start a Safar room</h2>
      <p>No account. No preference form. Name the trip and share the link.</p>
      <form onSubmit={createGroup}>
        <label htmlFor="trip-name">Trip or room name</label>
        <input
          id="trip-name"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          placeholder="Monsoon escape"
          minLength={3}
          maxLength={100}
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? "Creating room…" : "Create trip room"}
        </button>
      </form>
      {error && <p className="form-error" role="alert">{error}</p>}
      {result && (
        <div className="invite-result">
          <strong>Room ready</strong>
          <p>Share this link with your travellers — anyone with it can join.</p>
          <a href={`/trip/${result.slug}`}>Open the room →</a>
          <code className="invite-url">{roomUrl}</code>
        </div>
      )}
      <small>
        Joining shows Safar&apos;s processing, memory, and deletion disclosure.
      </small>
    </aside>
  );
}
