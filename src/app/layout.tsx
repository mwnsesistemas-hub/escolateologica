import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Fraunces, Manrope } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  axes: ["opsz"],
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: {
    default: "Lumen — Escola de Teologia",
    template: "%s · Lumen",
  },
  description:
    "Plataforma de cursos de teologia: teologia sistemática, hermenêutica, línguas bíblicas, história da igreja e ministério pastoral.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${fraunces.variable} ${manrope.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
