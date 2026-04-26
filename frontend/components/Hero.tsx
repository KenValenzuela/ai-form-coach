"use client";

import Logo from "./Logo";

const STATS: [string, string][] = [
  ["94%", "Detection accuracy"],
  ["<30s", "Analysis time"],
  ["Free", "ASU students"],
];

const DEMO_CHECKLIST = [
  "Upload your own lift video",
  "Review AI cues + issue breakdown",
  "Save your analysis for follow-up",
];

interface HeroProps {
  onAnalyzeClick?: () => void;
}

export default function Hero({ onAnalyzeClick }: HeroProps) {
  const scroll = () => {
    if (onAnalyzeClick) {
      onAnalyzeClick();
      return;
    }

    const ps = document.getElementById("page-scroll");
    const t = document.getElementById("analyze");
    if (ps && t) ps.scrollTo({ top: t.offsetTop - 64, behavior: "smooth" });
  };

  return (
    <div
      style={{
        background: "var(--navy)",
        position: "relative",
        overflow: "hidden",
        padding: "72px 24px 88px",
      }}
    >
      <svg
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.06 }}
        preserveAspectRatio="none"
      >
        <defs>
          <pattern id="g" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0L0 0 0 40" fill="none" stroke="#7B68EE" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#g)" />
      </svg>
      <div
        style={{
          position: "absolute",
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: "radial-gradient(circle,rgba(123,104,238,.22) 0%,transparent 70%)",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-55%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          maxWidth: 640,
          margin: "0 auto",
          textAlign: "center",
          position: "relative",
          animation: "fadeUp .6s ease both",
        }}
      >
        <Logo size={28} light />
        <p style={{ color: "#A395F5", marginTop: 10, fontSize: 15 }}>Move Right. Every Time.</p>
        <h1
          className="hero-h1"
          style={{
            color: "#FAFAFA",
            fontSize: "clamp(32px,4.5vw,60px)",
            fontWeight: 700,
            lineHeight: 1.08,
            marginTop: 22,
            letterSpacing: "-0.03em",
          }}
        >
          Upload Your Own Demo
          <br />
          <span style={{ color: "#A395F5" }}>and Let AI Coach It</span>
        </h1>
        <p
          style={{
            color: "rgba(255,255,255,.55)",
            fontSize: 15,
            lineHeight: 1.65,
            maxWidth: 500,
            margin: "14px auto 0",
          }}
        >
          This demo is built around your actual video upload workflow: submit your lift, get clear
          coaching feedback, and walk away with fixes you can apply in your next session.
        </p>
        <div className="hero-btns" style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 32 }}>
          <button
            className="btn-primary"
            style={{ fontSize: 15, padding: "13px 32px", boxShadow: "0 0 32px rgba(123,104,238,.4)" }}
            onClick={scroll}
          >
            Upload Demo Video →
          </button>
        </div>

        <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 8, marginTop: 18 }}>
          {DEMO_CHECKLIST.map((item) => (
            <span
              key={item}
              style={{
                fontSize: 12,
                color: "rgba(255,255,255,.78)",
                border: "1px solid rgba(255,255,255,.14)",
                background: "rgba(255,255,255,.06)",
                borderRadius: 999,
                padding: "7px 12px",
              }}
            >
              ✓ {item}
            </span>
          ))}
        </div>

        <div
          className="hero-stats"
          style={{ display: "flex", gap: 48, justifyContent: "center", marginTop: 44 }}
        >
          {STATS.map(([v, l]) => (
            <div key={l} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: "#A395F5" }}>{v}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.38)", marginTop: 4 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
