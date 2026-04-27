"use client";
import Image from "next/image";

interface LogoProps {
  size?: number;
  light?: boolean;
}

export default function Logo({ size = 22, light = false }: LogoProps) {
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
      <Image src="/favicon.ico" alt="ALIGN logo" width={Math.round(size * 1.1)} height={Math.round(size * 1.1)} />
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
