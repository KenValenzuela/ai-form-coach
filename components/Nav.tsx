"use client";

import { useState, useEffect } from "react";
import Logo from "./Logo";

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const el = document.getElementById("page-scroll");
    if (!el) return;
    const h = () => setScrolled(el.scrollTop > 40);
    el.addEventListener("scroll", h);
    return () => el.removeEventListener("scroll", h);
  }, []);

  const scroll = (id: string) => {
    setMenuOpen(false);
    const ps = document.getElementById("page-scroll");
    const target = document.getElementById(id);
    if (ps && target) ps.scrollTo({ top: target.offsetTop - 64, behavior: "smooth" });
  };

  const navLinks: [string, string][] = [
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
          {navLinks.map(([id, label]) => (
            <button
              key={id}
              onClick={() => scroll(id)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "6px 14px",
                borderRadius: 8,
                color: "var(--navy)",
                fontSize: 14,
                fontWeight: 500,
                opacity: 0.7,
                transition: "opacity .15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.7")}
            >
              {label}
            </button>
          ))}
          <button className="btn-primary" style={{ marginLeft: 8 }} onClick={() => scroll("analyze")}>
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
        {[["analyze", "Analyze Form"], ["tracker", "Tracker"], ["routines", "Routines"]].map(
          ([id, label]) => (
            <button key={id} className="mobile-menu-link" onClick={() => scroll(id)}>
              {label}
            </button>
          )
        )}
      </div>
    </>
  );
}
