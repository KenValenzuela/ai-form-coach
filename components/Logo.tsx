"use client";

interface LogoProps {
  size?: number;
  light?: boolean;
}

export default function Logo({ size = 22, light = false }: LogoProps) {
  const c = light ? "#A395F5" : "#7B68EE";
  const t = light ? "#FAFAFA" : "#0D1B3E";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: size * 0.35,
        flexShrink: 0,
      }}
    >
      <svg width={size * 0.9} height={size * 0.72} viewBox="0 0 52 42">
        {[0, 1, 2].map((i) => (
          <rect
            key={i}
            x={i * 6}
            y={i * 16}
            width={52 - i * 12}
            height={10}
            rx={5}
            fill={c}
          />
        ))}
      </svg>
      <span
        style={{
          fontWeight: 700,
          fontSize: size,
          letterSpacing: "-0.03em",
          color: t,
          lineHeight: 1,
        }}
      >
        ALIGN
      </span>
    </div>
  );
}
