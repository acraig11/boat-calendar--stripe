import { useState } from "react";

type Msg = {
  role: "user" | "assistant" | "gemini";
  text: string;
};

/** ---------- KEYWORD RULES ---------- */
type KeywordRule = {
  keywords: string[];
  response: string;
};

const KEYWORD_RULES: KeywordRule[] = [
  {
    keywords: ["hours", "open", "closing", "close"],
    response: "We’re open Mon–Fri 9am–5pm, Sat 10am–2pm, closed Sundays.",
  },
  {
    keywords: ["location", "address", "where are you"],
    response: "We’re located in Flagler Beach, Florida.",
  },
  {
    keywords: ["phone", "call", "contact number"],
    response: "You can reach us at (555) 123-4567.",
  },
  {
    keywords: ["pricing", "cost", "price"],
    response:
      "Pricing varies by service — please tell us what you’re looking for.",
  },
];

function getKeywordResponse(input: string): string | null {
  const text = input.toLowerCase();
  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.some((k) => text.includes(k))) {
      return rule.response;
    }
  }
  return null;
}

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);

  async function send() {
    const text = input.trim();
    if (!text || isSending) return;

    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);

    // 1️⃣ Local keyword response
    const keywordReply = getKeywordResponse(text);
    if (keywordReply) {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: keywordReply },
      ]);
      return;
    }

    // 2️⃣ Gemini fallback
    setIsSending(true);

    try {
      const res = await fetch(
        "/api/chat",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            message: text,
            history: messages.map((m) => ({
              role: m.role === "user" ? "user" : "model",
              text: m.text,
            })),
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Request failed");

      setMessages((m) => [
        ...m,
        { role: "gemini", text: data.reply ?? "" },
      ]);
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: `Error: ${e.message ?? "Unknown error"}`,
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      {/* ---------- PAGE HEADER ---------- */}
      <h1>Coast Life Assistant</h1>
      <p style={{ color: "#555", marginBottom: 12 }}>
        Coast Life Assistant helps answer questions about our services, hours,
        location, and general information. Ask a quick question or dive deeper —
        just type below.
      </p>

      <div
        style={{
          background: "#f9f9f9",
          border: "1px solid #e5e5e5",
          borderRadius: 10,
          padding: 12,
          marginBottom: 16,
        }}
      >
        <strong>Example questions:</strong>
        <ul style={{ marginTop: 8, marginBottom: 0 }}>
          <li>What are your hours?</li>
          <li>Where are you located?</li>
          <li>How much does your service cost?</li>
          <li>How do I book a service?</li>
          <li>What services do you offer?</li>
        </ul>
      </div>

      {/* ---------- CHAT WINDOW ---------- */}
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 12,
          padding: 12,
          minHeight: 300,
        }}
      >
        {messages.map((m, i) => (
          <div key={i} style={{ margin: "8px 0" }}>
            <b>
              {m.role === "user"
                ? "You"
                : m.role === "gemini"
                ? "Gemini"
                : "Assistant"}
              :
            </b>{" "}
            {m.text}
          </div>
        ))}
      </div>

      {/* ---------- INPUT ---------- */}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Type a message…"
          style={{
            flex: 1,
            padding: 10,
            borderRadius: 10,
            border: "1px solid #ccc",
          }}
        />
        <button
          onClick={send}
          disabled={isSending}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #ccc",
          }}
        >
          {isSending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}

