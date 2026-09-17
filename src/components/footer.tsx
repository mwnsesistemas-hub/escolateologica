import Link from "next/link";
import { BookOpenText } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-ink-800 bg-ink-950">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 md:grid-cols-3 lg:px-8">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-gold-400 to-gold-700 text-ink-950">
              <BookOpenText className="size-4.5" strokeWidth={2.2} />
            </span>
            <span className="font-display text-lg font-semibold tracking-wide text-ivory-50">
              LUMEN
            </span>
          </div>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-ivory-300/70">
            Formação teológica com profundidade bíblica, rigor acadêmico e beleza.
            Soli Deo Gloria.
          </p>
        </div>

        <div className="text-sm">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.25em] text-gold-400">
            Plataforma
          </p>
          <ul className="space-y-2.5 text-ivory-300/80">
            <li><Link className="hover:text-gold-300" href="/cursos">Catálogo de cursos</Link></li>
            <li><Link className="hover:text-gold-300" href="/login">Área do aluno</Link></li>
            <li><Link className="hover:text-gold-300" href="/admin">Administração</Link></li>
            <li><Link className="hover:text-gold-300" href="/guia">Guia de publicação</Link></li>
          </ul>
        </div>

        <div className="text-sm">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.25em] text-gold-400">
            Recursos
          </p>
          <ul className="space-y-2.5 text-ivory-300/80">
            <li>Aulas em vídeo com progresso</li>
            <li>Cobranças via Asaas (PIX, boleto, cartão)</li>
            <li>Notificações por WhatsApp (Meta)</li>
            <li>Hospedado na Vercel · banco Supabase</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-ink-800 py-6 text-center text-xs text-ivory-300/50">
        © {new Date().getFullYear()} Lumen — Escola de Teologia. Todos os direitos reservados.
      </div>
    </footer>
  );
}
