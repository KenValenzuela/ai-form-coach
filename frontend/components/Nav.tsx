"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";

type SectionId = "analyze" | "tracker" | "routines";

interface NavProps {
  activeSection?: SectionId;
  dark?: boolean;
}

const ROUTES: Record<SectionId, string> = {
  analyze: "/",
  tracker: "/tracker",
  routines: "/routines",
};

export default function Nav({ activeSection, dark = false }: NavProps) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
          background: scrolled ? (dark ? "rgba(13,27,62,.9)" : "rgba(250,250,250,.95)") : (dark ? "rgba(13,27,62,.5)" : "transparent"),
          backdropFilter: "blur(14px)",
          borderBottom: scrolled ? (dark ? "1px solid rgba(255,255,255,.12)" : "1px solid var(--border)") : "1px solid transparent",
          height: 60,
          display: "flex",
          alignItems: "center",
          padding: "0 24px",
          justifyContent: "space-between",
          transition: "background .2s,border .2s",
        }}
      >
        <Link href={ROUTES.analyze} aria-label="Go to home">
          <Logo />
        </Link>
        <div className="nav-links-desktop" style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {navLinks.map(([id, label]) => {
            const isActive = activeSection ? activeSection === id : pathname === ROUTES[id];
            return (
              <Link
                key={id}
                href={ROUTES[id]}
                style={{
                  background: isActive ? "var(--lav-d)" : "none",
                  border: isActive ? "1px solid rgba(123,104,238,.35)" : "1px solid transparent",
                  cursor: "pointer",
                  padding: "6px 14px",
                  borderRadius: 8,
                  color: dark ? "#FAFAFA" : "var(--navy)",
                  fontSize: 14,
                  fontWeight: isActive ? 700 : 500,
                  opacity: isActive ? 1 : 0.72,
                  transition: "opacity .15s, background .15s",
                  textDecoration: "none",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = isActive ? "1" : "0.72")}
              >
                {label}
              </Link>
            );
          })}
          <Link className="btn-primary" style={{ marginLeft: 8 }} href={ROUTES.analyze}>
            Analyze Form
          </Link>
        </div>
        <button className="hamburger" onClick={() => setMenuOpen(true)} aria-label="Open menu" style={{ color: dark ? "#FAFAFA" : "var(--navy)" }}>
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path d="M3 6h16M3 11h16M3 16h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </nav>

      <div className={`mobile-menu${menuOpen ? " open" : ""}`}>
        <button className="mobile-menu-close" onClick={() => setMenuOpen(false)}>✕</button>
        <Logo size={26} />
        <div style={{ height: 20 }} />
        {([
          ["analyze", "Analyze Form"],
          ["tracker", "Tracker"],
          ["routines", "Routines"],
        ] as [SectionId, string][]).map(([id, label]) => (
          <Link key={id} className="mobile-menu-link" onClick={() => setMenuOpen(false)} href={ROUTES[id]}>
            {label}
          </Link>
        ))}
      </div>
    </>
  );
}
