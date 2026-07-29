import { useState } from "react";
import { sendContactEmail } from "../utils/email";
import contact1 from "../assets/photo1.jpeg";
import contact2 from "../assets/photo2.jpeg";
import contact3 from "../assets/photo3.jpeg";

const images = [contact1, contact2, contact3];

export default function Contact() {
  const [index, setIndex] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);

  const prev = () => setIndex((i) => (i - 1 + images.length) % images.length);
  const next = () => setIndex((i) => (i + 1) % images.length);

  async function sendEmail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    try {
      setIsSending(true);
      setStatusText(null);

      const form = e.currentTarget;

      const name = (form.elements.namedItem("user_name") as HTMLInputElement)
        .value;

      const contact = (
        form.elements.namedItem("user_contact") as HTMLInputElement
      ).value;

      const interest = (
        form.elements.namedItem("interest") as HTMLSelectElement
      ).value;

      const messageText = (
        form.elements.namedItem("message_text") as HTMLTextAreaElement
      ).value;

      const message = `
Coast Life Contact Form

Name:
${name}

Contact:
${contact}

Interest:
${interest}

Message:
${messageText}
`;

      await sendContactEmail(message);

      setStatusText("Thanks! Your message was sent successfully.");
      form.reset();
    } catch (error) {
      console.error("EmailJS send error:", error);
      setStatusText("Sorry, your message could not be sent. Please try again.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        padding: "24px",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "28px",
            alignItems: "center",
            marginBottom: "32px",
          }}
        >
          <div>
            <div
              style={{
                display: "inline-block",
                background: "#ccfbf1",
                color: "#0f766e",
                padding: "8px 14px",
                borderRadius: "999px",
                fontWeight: 700,
                marginBottom: "16px",
              }}
            >
              Contact Coast Life
            </div>

            <h1
              style={{
                fontSize: "44px",
                lineHeight: 1.1,
                margin: "0 0 16px",
                color: "#111827",
              }}
            >
              Let’s create something unforgettable.
            </h1>

            <p
              style={{
                fontSize: "18px",
                color: "#4b5563",
                lineHeight: 1.7,
                marginBottom: "24px",
              }}
            >
              Have a question, partnership idea, booking request, or local
              opportunity? Send a message and we’ll help you connect with the
              Coast Life experience.
            </p>

            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <a href="tel:+13862641115" style={secondaryButton}>
                Call Now
              </a>
            </div>
          </div>

          <div style={{ position: "relative" }}>
            <img
              src={images[index]}
              alt="Coast Life contact"
              style={{
                width: "100%",
                height: "420px",
                objectFit: "cover",
                borderRadius: "28px",
                display: "block",
                boxShadow: "0 16px 35px rgba(0,0,0,.18)",
              }}
            />

            <button
              onClick={prev}
              aria-label="Previous image"
              style={navButtonStyle("left")}
            >
              ‹
            </button>

            <button
              onClick={next}
              aria-label="Next image"
              style={navButtonStyle("right")}
            >
              ›
            </button>

            <div
              style={{
                position: "absolute",
                bottom: 14,
                left: 0,
                right: 0,
                display: "flex",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {images.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIndex(i)}
                  aria-label={`Go to image ${i + 1}`}
                  style={{
                    width: 11,
                    height: 11,
                    borderRadius: "50%",
                    border: "1px solid white",
                    background: i === index ? "white" : "rgba(255,255,255,.45)",
                    cursor: "pointer",
                    padding: 0,
                  }}
                />
              ))}
            </div>
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "18px",
            marginBottom: "32px",
          }}
        >
          <InfoCard
            title="Bookings"
            text="Plan a local experience, request a date, or ask about availability."
          />
          <InfoCard
            title="Partnerships"
            text="Promote your business, collaborate with Coast Life, or sponsor rewards."
          />
          <InfoCard
            title="Support"
            text="Need help with rewards, prizes, profile access, or your account? Contact us."
          />
        </section>

        <section
          style={{
            background: "white",
            borderRadius: "24px",
            padding: "28px",
            boxShadow: "0 8px 22px rgba(0,0,0,.08)",
          }}
        >
          <h2 style={{ marginTop: 0, color: "#111827" }}>Send a Message</h2>

          <form onSubmit={sendEmail} style={{ display: "grid", gap: "14px" }}>
            <input
              name="user_name"
              required
              placeholder="Your name"
              style={inputStyle}
            />

            <input
              name="user_contact"
              required
              placeholder="Email or phone"
              style={inputStyle}
            />

            <select name="interest" required style={inputStyle} defaultValue="">
              <option value="" disabled>
                What are you interested in?
              </option>
              <option>Booking an experience</option>
              <option>Rewards or merchandise</option>
              <option>Business partnership</option>
              <option>General question</option>
            </select>

            <textarea
              name="message_text"
              required
              placeholder="Tell us how we can help..."
              rows={6}
              style={{ ...inputStyle, resize: "vertical" }}
            />

            {statusText && (
              <p
                style={{
                  margin: 0,
                  color: statusText.includes("successfully")
                    ? "#047857"
                    : "#b91c1c",
                  background: statusText.includes("successfully")
                    ? "#d1fae5"
                    : "#fee2e2",
                  padding: "10px 12px",
                  borderRadius: "10px",
                }}
              >
                {statusText}
              </p>
            )}

            <button
              type="submit"
              disabled={isSending}
              style={submitButton(isSending)}
            >
              {isSending ? "Sending..." : "Send Message"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

function InfoCard({ title, text }: { title: string; text: string }) {
  return (
    <div
      style={{
        background: "white",
        borderRadius: "20px",
        padding: "22px",
        boxShadow: "0 6px 16px rgba(0,0,0,.07)",
      }}
    >
      <h3 style={{ marginTop: 0, marginBottom: "8px", color: "#0f766e" }}>
        {title}
      </h3>
      <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.6 }}>{text}</p>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: "12px",
  border: "1px solid #d1d5db",
  fontSize: "16px",
  boxSizing: "border-box" as const,
  outline: "none",
};

const secondaryButton = {
  background: "white",
  color: "#0f766e",
  textDecoration: "none",
  padding: "13px 20px",
  borderRadius: "12px",
  fontWeight: 700,
  border: "1px solid #99f6e4",
};

function submitButton(isSending: boolean) {
  return {
    marginTop: "8px",
    width: "100%",
    padding: "15px",
    border: "none",
    borderRadius: "12px",
    background: isSending ? "#94a3b8" : "#14b8a6",
    color: "white",
    fontSize: "16px",
    fontWeight: 700,
    cursor: isSending ? "not-allowed" : "pointer",
  };
}

function navButtonStyle(side: "left" | "right") {
  return {
    position: "absolute" as const,
    top: "50%",
    [side]: 12,
    transform: "translateY(-50%)",
    width: 40,
    height: 40,
    borderRadius: "50%",
    border: "1px solid rgba(255,255,255,0.7)",
    background: "rgba(0,0,0,0.35)",
    color: "white",
    fontSize: 28,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
}
