import { useState } from "react";
import PartnerRequestFormView from "../components/PartnerRequestFormView";

/**
 * Partner.tsx
 * SwiftUI PartnerView → React
 * Uses PartnerRequestFormView in a modal (sheet-style)
 */

export default function Partner() {
  const [showForm, setShowForm] = useState(false);

  return (
    <div
      style={{
        maxWidth: 900,
        margin: "0 auto",
        paddingTop: 16,
        paddingBottom: 40,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <h2
          style={{
            fontSize: 22,
            fontWeight: 800,
            textAlign: "center",
            margin: 0,
            padding: "0 12px",
          }}
        >
          Join The Coast Life Brand
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ padding: "0 12px", lineHeight: 1.5 }}>
            <p style={{ marginTop: 0 }}>
              Coast Life offers management, branding, recreational operations,
              and entertainment facility partnerships!
            </p>

            <p>
              Typical opportunities include experiences on or near the water
              (but are not limited to):
            </p>

            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li>Hotels</li>
              <li>Resorts</li>
              <li>Theme Parks</li>
              <li>Golf Courses</li>
              <li>Marinas</li>
              <li>Hunting Lodges</li>
              <li>Gaming Establishments</li>
              <li>Concert Arenas</li>
              <li>Sports Arenas</li>
              <li>Sports Teams</li>
            </ul>
          </div>

          <div style={{ padding: "0 12px" }}>
            <button
              onClick={() => setShowForm(true)}
              style={{
                width: "100%",
                padding: 14,
                borderRadius: 10,
                border: "none",
                backgroundColor: "#007AFF",
                color: "#fff",
                fontWeight: 700,
                fontSize: 16,
                cursor: "pointer",
              }}
            >
              Request Partner &amp; Licensing Info
            </button>
          </div>
        </div>

        {/* Spacer(minLength: 40) */}
        <div style={{ height: 40 }} />
      </div>

      {/* SwiftUI .sheet replacement */}
      {showForm && (
        <Modal onClose={() => setShowForm(false)}>
          <PartnerRequestFormView onClose={() => setShowForm(false)} />
        </Modal>
      )}
    </div>
  );
}

/** ---------- TitleBar ----------
 * Replace this with your real TitleBar component if you already have one.
 */

/** ---------- Modal (sheet-style) ---------- */
function Modal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-end", // sheet feel
        padding: 12,
        zIndex: 1000,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 900,
          background: "#fff",
          borderRadius: 16,
          border: "1px solid #ddd",
          boxShadow: "0 12px 40px rgba(0,0,0,0.2)",
          maxHeight: "85vh",
          overflow: "auto",
        }}
      >
        {children}
      </div>
    </div>
  );
}
