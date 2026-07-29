import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant" | "gemini"; text: string };

type KeywordRule = { keywords: string[]; response: string };

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
    keywords: ["pricing", "cost", "price"],
    response: "Pricing varies by service — please tell us what you’re looking for.",
  },
];

function getKeywordResponse(input: string): string | null {
  const text = input.toLowerCase();
  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.some((k) => text.includes(k))) return rule.response;
  }
  return null;
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);

  // chat state
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  // close on ESC
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (!open) return;
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  // close when clicking outside the panel (but not the button)
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      const el = panelRef.current;
      if (!el) return;
      if (el.contains(e.target as Node)) return;
      // click outside panel closes it
      setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  async function send() {
    const text = input.trim();
    if (!text || isSending) return;

    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);

    // 1) keyword first
    const keywordReply = getKeywordResponse(text);
    if (keywordReply) {
      setMessages((m) => [...m, { role: "assistant", text: keywordReply }]);
      return;
    }

    // 2) gemini fallback
    setIsSending(true);
    try {
      const res = await fetch("https://gemini-proxy.zinadog99.workers.dev/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: messages.map((m) => ({
            role: m.role === "user" ? "user" : "model",
            text: m.text,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Request failed");

      setMessages((m) => [...m, { role: "gemini", text: data.reply ?? "" }]);
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: `Error: ${e?.message ?? "Unknown error"}` },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Open chat"
        style={{
          position: "fixed",
          right: 18,
          bottom: 18,
          width: 56,
          height: 56,
          borderRadius: 999,
          border: "none",
          background: "#007AFF",
          color: "#fff",
          cursor: "pointer",
          boxShadow: "0 10px 24px rgba(0,0,0,0.25)",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 22,
          fontWeight: 900,
        }}
      >
        💬
      </button>

      {/* Chat panel */}
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="false"
          style={{
            position: "fixed",
            right: 18,
            bottom: 84,
            width: 340,
            maxWidth: "calc(100vw - 36px)",
            height: 440,
            maxHeight: "calc(100vh - 140px)",
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: 16,
            boxShadow: "0 14px 40px rgba(0,0,0,0.22)",
            zIndex: 1000,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "10px 12px",
              borderBottom: "1px solid #eee",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <div style={{ fontWeight: 900 }}>Coast Life Assistant</div>
            <button
              onClick={() => setOpen(false)}
              style={{
                border: "1px solid #ddd",
                background: "#fafafa",
                borderRadius: 10,
                padding: "6px 10px",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              Close
            </button>
          </div>

          {/* Messages */}
          <div style={{ padding: 12, overflow: "auto", flex: 1 }}>
            {messages.length === 0 && (
              <div style={{ color: "#666", fontSize: 14, lineHeight: 1.4 }}>
                Ask about hours, location, pricing, bookings, and more.
                <div style={{ marginTop: 10, color: "#888" }}>
                  Examples: “What are your hours?” • “Where are you located?”
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} style={{ margin: "10px 0" }}>
                <div style={{ fontSize: 12, color: "#777", marginBottom: 4 }}>
                  {m.role === "user" ? "You" : m.role === "gemini" ? "Gemini" : "Assistant"}
                </div>
                <div
                  style={{
                    display: "inline-block",
                    padding: "10px 12px",
                    borderRadius: 14,
                    background: m.role === "user" ? "#eef6ff" : "#f6f6f6",
                    border: "1px solid #eee",
                    maxWidth: "100%",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {m.text}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <div style={{ padding: 10, borderTop: "1px solid #eee", display: "flex", gap: 8 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Type a message…"
              style={{
                flex: 1,
                padding: 10,
                borderRadius: 12,
                border: "1px solid #ccc",
                outline: "none",
              }}
            />
            <button
              onClick={send}
              disabled={isSending}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "none",
                fontWeight: 800,
                color: "#fff",
                background: isSending ? "#9fc7ff" : "#007AFF",
                cursor: isSending ? "not-allowed" : "pointer",
              }}
            >
              {isSending ? "…" : "Send"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
