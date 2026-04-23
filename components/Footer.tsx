import Logo from "./Logo";

export default function Footer() {
  return (
    <footer
      style={{
        background: "var(--navy)",
        padding: "24px 40px",
        borderTop: "1px solid rgba(255,255,255,.08)",
      }}
    >
      <div
        className="footer-inner"
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Logo size={18} light />
        <p style={{ color: "rgba(255,255,255,.25)", fontSize: 13 }}>
          © 2026 ALIGN · AI Form Coaching · Built for ASU SDFC
        </p>
        <p style={{ color: "rgba(255,255,255,.2)", fontSize: 12 }}>
          Videos processed locally · Never stored
        </p>
      </div>
    </footer>
  );
}
