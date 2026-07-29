import { useMemo, useState } from "react";
import { sendPartnerRequestEmail } from "../utils/email";

export default function PartnerRequestFormView({
  onClose,
}: {
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [organization, setOrganization] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");

  const [submitted, setSubmitted] = useState(false);
  const [showMailError, setShowMailError] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const canSubmit = useMemo(() => {
    return (
      name.trim().length > 0 &&
      email.trim().length > 0 &&
      note.trim().length > 0 &&
      !isSending
    );
  }, [name, email, note, isSending]);

  async function submit() {
    if (!canSubmit) return;

    try {
      setIsSending(true);
      setShowMailError(false);
      setSubmitted(false);

      await sendPartnerRequestEmail({
        name,
        organization,
        email,
        phone,
        note,
      });

      setSubmitted(true);

      console.log("Partner request submitted:", {
        name,
        organization,
        email,
        phone,
        note,
      });
    } catch (error) {
      console.error("Partner request email error:", error);
      setShowMailError(true);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 16 }}>Partner Request</div>

        <button
          type="button"
          onClick={onClose}
          style={{
            border: "1px solid #ddd",
            background: "#fafafa",
            borderRadius: 10,
            padding: "6px 10px",
            cursor: "pointer",
          }}
        >
          Close
        </button>
      </div>

      <div
        style={{
          marginTop: 12,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <Section title="Contact Info">
          <Field label="Name">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Name"
              autoComplete="name"
              style={inputStyle}
            />
          </Field>

          <Field label="Organization/Business">
            <input
              value={organization}
              onChange={(event) => setOrganization(event.target.value)}
              placeholder="Organization/Business"
              autoComplete="organization"
              style={inputStyle}
            />
          </Field>

          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email"
              inputMode="email"
              autoComplete="email"
              style={inputStyle}
            />
          </Field>

          <Field label="Phone">
            <input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="Phone"
              inputMode="tel"
              autoComplete="tel"
              style={inputStyle}
            />
          </Field>
        </Section>

        <Section title="Message">
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Type your message..."
            style={{
              ...inputStyle,
              minHeight: 120,
              resize: "vertical",
            }}
          />
        </Section>

        {submitted && (
          <div
            role="status"
            style={{
              border: "1px solid #d6f5dd",
              background: "#f0fff4",
              color: "#1b7f3a",
              borderRadius: 12,
              padding: 12,
              fontWeight: 700,
            }}
          >
            Request submitted! Thank you.
          </div>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: 10,
            border: "none",
            fontWeight: 800,
            color: "#fff",
            backgroundColor: canSubmit ? "#007aff" : "#c7c7cc",
            cursor: canSubmit ? "pointer" : "not-allowed",
            opacity: canSubmit ? 1 : 0.75,
          }}
        >
          {isSending ? "Sending..." : "Submit Request"}
        </button>

        {showMailError && (
          <div
            role="alert"
            style={{
              border: "1px solid #ffe1e1",
              background: "#fff5f5",
              borderRadius: 12,
              padding: 12,
              color: "#8a1f1f",
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 6 }}>
              Unable to Send Request
            </div>

            <div>The request could not be sent. Please try again.</div>

            <div style={{ marginTop: 10 }}>
              <button
                type="button"
                onClick={() => setShowMailError(false)}
                style={{
                  border: "1px solid #ddd",
                  background: "#fff",
                  borderRadius: 10,
                  padding: "6px 10px",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                OK
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: 12,
        padding: 12,
        background: "#fff",
      }}
    >
      <div style={{ fontWeight: 800, marginBottom: 10 }}>{title}</div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "#444",
        }}
      >
        {label}
      </div>

      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  boxSizing: "border-box",
  padding: 10,
  borderRadius: 10,
  border: "1px solid #ccc",
  outline: "none",
  width: "100%",
};
