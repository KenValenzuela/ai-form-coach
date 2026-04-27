import type { Metadata } from "next";
import "./globals.css";


export const metadata: Metadata = {
  title: "ALIGN · AI Form Coaching",
  description:
    "Upload a squat video, get instant AI coaching feedback. Track your volume, build routines.",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
