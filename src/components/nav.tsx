"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpenText, GraduationCap, LayoutDashboard, LogOut, Menu, UserRound, X } from "lucide-react";
import { useRouter } from "next/navigation";

type NavUser = { name: string; role: "admin" | "student" } | null;

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="group flex items-center gap-2.5">
      <span className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-gold-400 to-gold-700 text-ink-950 shadow-lg shadow-gold-600/30">
        <BookOpenText className="size-4.5" strokeWidth={2.2} />
      </span>
      <span className="leading-none">
        <span className="font-display text-lg font-semibold tracking-wide text-ivory-50">
          LUMEN
        </span>
        {!compact && (
          <span className="block text-[10px] font-semibold uppercase tracking-[0.28em] text-gold-400">
            Escola de Teologia
          </span>
        )}
      </span>
    </Link>
  );
}

export function Nav({ user }: { user: NavUser }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setOpen(false);
    router.refresh();
  }

  const links = (
    <>
      <Link href="/cursos" onClick={() => setOpen(false)} className="transition hover:text-gold-300">
        Cursos
      </Link>
      <Link href="/guia" onClick={() => setOpen(false)} className="transition hover:text-gold-300">
        Guia da plataforma
      </Link>
    </>
  );

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
        scrolled ? "glass border-b border-gold-500/10 py-3" : "bg-transparent py-5"
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 lg:px-8">
        <Brand />

        {/* Desktop */}
        <nav className="hidden items-center gap-8 text-sm font-medium text-ivory-200 md:flex">
          {links}
          {user?.role === "admin" && (
            <Link href="/admin" className="flex items-center gap-1.5 text-gold-300 transition hover:text-gold-200">
              <LayoutDashboard className="size-4" /> Administração
            </Link>
          )}
          {user ? (
            <div className="flex items-center gap-3">
              <Link
                href="/painel"
                className="flex items-center gap-2 rounded-full border border-ink-600 py-2 pl-2 pr-4 text-sm transition hover:border-gold-500 hover:text-gold-300"
              >
                <span className="grid size-6 place-items-center rounded-full bg-gold-500/15 text-gold-300">
                  <UserRound className="size-3.5" />
                </span>
                {user.name.split(" ")[0]}
              </Link>
              <button
                onClick={logout}
                title="Sair"
                className="grid size-9 place-items-center rounded-full border border-ink-700 text-ivory-300 transition hover:border-red-400/60 hover:text-red-300"
              >
                <LogOut className="size-4" />
              </button>
            </div>
          ) : (
            <Link href="/login" className="btn-gold !px-6 !py-2.5">
              Entrar
            </Link>
          )}
        </nav>

        {/* Mobile */}
        <button
          className="grid size-10 place-items-center rounded-full border border-ink-600 text-ivory-100 md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Menu"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open && (
        <nav className="glass mx-5 mt-3 flex flex-col gap-4 rounded-2xl border border-gold-500/10 p-6 text-base font-medium text-ivory-100 md:hidden">
          {links}
          {user?.role === "admin" && (
            <Link href="/admin" onClick={() => setOpen(false)} className="flex items-center gap-2 text-gold-300">
              <LayoutDashboard className="size-4" /> Administração
            </Link>
          )}
          {user ? (
            <>
              <Link href="/painel" onClick={() => setOpen(false)} className="flex items-center gap-2">
                <GraduationCap className="size-4 text-gold-400" /> Meu painel
              </Link>
              <button onClick={logout} className="flex items-center gap-2 text-left text-red-300">
                <LogOut className="size-4" /> Sair
              </button>
            </>
          ) : (
            <Link href="/login" onClick={() => setOpen(false)} className="btn-gold w-full">
              Entrar
            </Link>
          )}
        </nav>
      )}
    </header>
  );
}
