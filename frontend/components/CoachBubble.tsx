"use client";

import { useState, useEffect } from "react";
import type { CoachMsg } from "@/lib/data";
import { sevBg, sevBorder, sevColor } from "@/lib/data";

interface CoachBubbleProps {
  msg: CoachMsg;
  delay?: number;
}

export default function CoachBubble({ msg, delay = 0 }: CoachBubbleProps) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShown(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  if (!shown) return null;

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        animation: "bubbleIn .4s ease both",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          background: "var(--navy)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          fontSize: 16,
          border: "2px solid rgba(123,104,238,.3)",
        }}
      >
        🤖
      </div>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--muted)",
            marginBottom: 5,
            letterSpacing: ".04em",
            textTransform: "uppercase",
          }}
        >
          ALIGN Coach · {msg.icon} {msg.title}
        </div>
        <div
          style={{
            background: sevBg[msg.sev],
            border: `1.5px solid ${sevBorder[msg.sev]}`,
            borderRadius: "18px 18px 18px 4px",
            padding: "14px 18px",
          }}
        >
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "var(--navy)" }}>
            {msg.msg}
          </p>
          {msg.cue && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 14px",
                background: "rgba(255,255,255,.6)",
                borderRadius: 10,
                fontSize: 13,
                lineHeight: 1.6,
                borderLeft: `3px solid ${sevColor[msg.sev]}`,
              }}
            >
              <strong>Cue:</strong> {msg.cue}
            </div>
          )}
          {msg.drill && (
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                color: "var(--muted)",
                background: "rgba(0,0,0,.04)",
                borderRadius: 8,
                padding: "7px 12px",
              }}
            >
              <strong>Drill:</strong> {msg.drill}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
