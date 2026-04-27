import type { Metadata } from "next";
import "./globals.css";


export const metadata: Metadata = {
  title: "ALIGN · AI Form Coaching",
  description:
    "Upload a squat video, get instant AI coaching feedback. Track your volume, build routines.",
  icons: {
    icon: "/icon.ico",
    shortcut: "/icon.ico",
    apple: "/icon.ico",
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
