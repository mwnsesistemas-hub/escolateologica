import { Suspense } from "react";
import Link from "next/link";
import { BookOpenText } from "lucide-react";
import { LoginForm } from "./login-form";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <main className="grain relative grid min-h-screen place-items-center overflow-hidden bg-ink-950 px-5 py-20">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/img/hero.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />
      <div className="absolute inset-0 bg-gradient-to-b from-ink-950/80 via-ink-950/60 to-ink-950" />

      <div className="relative w-full max-w-md animate-fade-up">
        <Link href="/" className="mx-auto mb-8 flex w-fit items-center gap-2.5">
          <span className="grid size-11 place-items-center rounded-full bg-gradient-to-br from-gold-400 to-gold-700 text-ink-950 shadow-lg shadow-gold-600/30">
            <BookOpenText className="size-5" strokeWidth={2.2} />
          </span>
          <span className="font-display text-2xl font-semibold tracking-wide text-ivory-50">
            LUMEN
          </span>
        </Link>

        <Suspense
          fallback={
            <div className="glass h-96 animate-pulse rounded-3xl" aria-hidden />
          }
        >
          <LoginForm />
        </Suspense>

        <p className="mt-6 text-center text-sm text-ivory-300/60">
          <Link href="/" className="transition hover:text-gold-300">← Voltar ao início</Link>
        </p>
      </div>
    </main>
  );
}
