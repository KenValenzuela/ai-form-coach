"use client";

import { useState, useEffect } from "react";
import Logo from "./Logo";

type SectionId = "analyze" | "tracker" | "routines";

interface NavProps {
  activeSection?: SectionId;
  onNavigate?: (section: SectionId) => void;
}

export default function Nav({ activeSection, onNavigate }: NavProps) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navigate = (id: SectionId) => {
    setMenuOpen(false);

    if (onNavigate) {
      onNavigate(id);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const ps = document.getElementById("page-scroll");
    const target = document.getElementById(id);
    if (ps && target) ps.scrollTo({ top: target.offsetTop - 64, behavior: "smooth" });
  };

  const navLinks: [SectionId, string][] = [
    ["analyze", "Analyze"],
    ["tracker", "Tracker"],
    ["routines", "Routines"],
  ];

  return (
    <>
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: scrolled ? "rgba(250,250,250,.95)" : "transparent",
          backdropFilter: "blur(14px)",
          borderBottom: scrolled ? "1px solid var(--border)" : "1px solid transparent",
          height: 60,
          display: "flex",
          alignItems: "center",
          padding: "0 24px",
          justifyContent: "space-between",
          transition: "background .2s,border .2s",
        }}
      >
        <Logo />
        <div className="nav-links-desktop" style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {navLinks.map(([id, label]) => {
            const isActive = activeSection === id;
            return (
              <button
                key={id}
                onClick={() => navigate(id)}
                style={{
                  background: isActive ? "var(--lav-d)" : "none",
                  border: isActive ? "1px solid rgba(123,104,238,.35)" : "1px solid transparent",
                  cursor: "pointer",
                  padding: "6px 14px",
                  borderRadius: 8,
                  color: "var(--navy)",
                  fontSize: 14,
                  fontWeight: isActive ? 700 : 500,
                  opacity: isActive ? 1 : 0.72,
                  transition: "opacity .15s, background .15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = isActive ? "1" : "0.72")}
              >
                {label}
              </button>
            );
          })}
          <button className="btn-primary" style={{ marginLeft: 8 }} onClick={() => navigate("analyze")}>
            Analyze Form
          </button>
        </div>
        <button className="hamburger" onClick={() => setMenuOpen(true)} aria-label="Open menu">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path d="M3 6h16M3 11h16M3 16h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </nav>

      <div className={`mobile-menu${menuOpen ? " open" : ""}`}>
        <button className="mobile-menu-close" onClick={() => setMenuOpen(false)}>✕</button>
        <Logo size={26} />
        <div style={{ height: 20 }} />
        {([ ["analyze", "Analyze Form"], ["tracker", "Tracker"], ["routines", "Routines"] ] as [SectionId, string][]).map(
          ([id, label]) => (
            <button key={id} className="mobile-menu-link" onClick={() => navigate(id)}>
              {label}
            </button>
          )
        )}
      </div>
    </>
  );
}
