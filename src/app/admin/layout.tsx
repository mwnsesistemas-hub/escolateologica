import { redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  BookOpenText,
  GraduationCap,
  LayoutDashboard,
  Library,
  PlugZap,
  Globe,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth";

const MENU = [
  { href: "/admin", label: "Visão geral", icon: LayoutDashboard },
  { href: "/admin/cursos", label: "Cursos", icon: Library },
  { href: "/admin/alunos", label: "Alunos", icon: GraduationCap },
  { href: "/admin/integracoes", label: "Integrações", icon: PlugZap },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();
  if (!admin) redirect("/login?next=/admin");

  return (
    <div className="flex min-h-screen bg-ink-950">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-ink-800 bg-ink-900/60 p-6 md:flex">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-gold-400 to-gold-700 text-ink-950 shadow-lg shadow-gold-600/30">
            <BookOpenText className="size-4.5" strokeWidth={2.2} />
          </span>
          <span className="leading-none">
            <span className="font-display text-lg font-semibold tracking-wide text-ivory-50">LUMEN</span>
            <span className="block text-[9px] font-bold uppercase tracking-[0.25em] text-gold-400">
              Administração
            </span>
          </span>
        </Link>

        <nav className="mt-10 space-y-1.5">
          {MENU.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-ivory-300/75 transition hover:bg-gold-500/10 hover:text-gold-300"
            >
              <item.icon className="size-4.5" /> {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto space-y-1.5 border-t border-ink-800 pt-5">
          <Link
            href="/"
            className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-ivory-300/75 transition hover:bg-gold-500/10 hover:text-gold-300"
          >
            <Globe className="size-4.5" /> Ver o site
          </Link>
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="grid size-8 place-items-center rounded-full bg-gold-500/15 font-display text-xs font-bold text-gold-300">
              {admin.name.slice(0, 2).toUpperCase()}
            </span>
            <div className="text-xs">
              <p className="font-semibold text-ivory-100">{admin.name}</p>
              <p className="text-ivory-300/50">Administrador</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Conteúdo */}
      <div className="min-w-0 flex-1">
        {/* Barra mobile */}
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-ink-800 bg-ink-950/95 px-4 py-3 backdrop-blur md:hidden">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-gold-400 to-gold-700 text-ink-950">
              <BookOpenText className="size-4" strokeWidth={2.2} />
            </span>
            <span className="font-display font-semibold text-ivory-50">LUMEN · Admin</span>
          </Link>
          <nav className="flex gap-1">
            {MENU.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className="grid size-9 place-items-center rounded-xl text-ivory-300/75 transition hover:bg-gold-500/10 hover:text-gold-300"
              >
                <item.icon className="size-4.5" />
              </Link>
            ))}
          </nav>
        </div>
        <main className="p-5 md:p-10">{children}</main>
      </div>
    </div>
  );
}
