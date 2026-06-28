"use client";

import { useState } from "react";

const SUGGESTED = [
  "I've never trekked before — can I do this?",
  "I only have 2 days",
  "I'm bringing my parents",
  "Do I need a permit?",
  "Is there water on the trail?",
];

// Ask-the-advisor: grounded free-text Q&A about this trek. Posts to the advisor
// route, which answers from the trek's own data (LLM, or a templated fallback).
export function TrekAdvisor({ slug }: { slug: string }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(q: string) {
    const text = q.trim();
    if (text.length < 3) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    try {
      const res = await fetch(`/api/treks/${slug}/advisor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      if (!res.ok) throw new Error("failed");
      const data = (await res.json()) as { answer: string };
      setAnswer(data.answer);
    } catch {
      setError("Couldn't get an answer just now. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="trek-ask">
      <form
        className="ask-form"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask anything — fitness, days, permits, who's coming…"
          aria-label="Ask the trek advisor"
        />
        <button type="submit" disabled={loading}>
          {loading ? "Thinking…" : "Ask"}
        </button>
      </form>

      <div className="ask-chips">
        {SUGGESTED.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setQuestion(s);
              void ask(s);
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {error && <p className="ask-error">{error}</p>}
      {answer && (
        <div className="ask-answer">
          <p>{answer}</p>
          <small>Grounded in this trek&apos;s data — verify safety-critical details locally.</small>
        </div>
      )}
    </div>
  );
}
