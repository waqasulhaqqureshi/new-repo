import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Raqmiva — Bilingual AI Receptionist Demo",
  description:
    "Try Raqmiva, a low-latency AI receptionist demo that automatically follows Emirati Arabic and English.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="preconnect"
          href="https://generativelanguage.googleapis.com"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
