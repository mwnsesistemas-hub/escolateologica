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
            <li><Link className="transition hover:text-gold-300" href="/cursos">Catálogo de cursos</Link></li>
            <li><Link className="transition hover:text-gold-300" href="/painel">Área do aluno</Link></li>
          </ul>
        </div>

        <div className="text-sm">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.25em] text-gold-400">
            Contato
          </p>
          <ul className="space-y-2.5 text-ivory-300/80">
            <li>
              <a
                href="mailto:contato@escolateologica.com.br"
                className="transition hover:text-gold-300"
              >
                contato@escolateologica.com.br
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-ink-800 py-6 text-center text-xs text-ivory-300/50">
        © {new Date().getFullYear()} Lumen — Escola de Teologia. Todos os direitos reservados.
      </div>
    </footer>
  );
}
