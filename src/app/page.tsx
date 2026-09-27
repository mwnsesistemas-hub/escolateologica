import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  GraduationCap,
  Library,
  PlayCircle,
  Sparkles,
  Users,
} from "lucide-react";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { Reveal } from "@/components/reveal";
import { CourseCard } from "@/components/course-card";
import { SetupBanner } from "@/components/setup-banner";
import { getSessionUser } from "@/lib/auth";
import { getCourseSummaries } from "@/lib/queries";
import { db } from "@/db";
import { users, enrollments } from "@/db/schema";
import { count } from "drizzle-orm";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Lumen — Escola de Teologia",
  description:
    "Cursos completos de teologia sistemática, exegese, línguas bíblicas e ministério.",
};

const MARQUEE_ITEMS = [
  "Teologia Sistemática",
  "Hermenêutica Bíblica",
  "Grego Koiné",
  "Homilética",
  "História da Igreja",
  "Aconselhamento Bíblico",
  "Escatologia",
  "Eclesiologia",
];

const PILLARS = [
  {
    icon: BookOpenCheck,
    title: "Rigor bíblico",
    text: "Todo conteúdo é fundamentado nas Escrituras, com exegese cuidadosa e referências teológicas sólidas.",
  },
  {
    icon: GraduationCap,
    title: "Formação prática",
    text: "Cursos pensados para pastores, líderes e leigos que desejam servir com mais preparo e clareza.",
  },
  {
    icon: BadgeCheck,
    title: "Excelência acadêmica",
    text: "Aulas estruturadas com profundidade, provas, materiais de apoio e certificado de conclusão.",
  },
];

export default async function HomePage() {
  const [user, allCourses] = await Promise.all([
    getSessionUser().catch(() => null),
    getCourseSummaries({ publishedOnly: true }).catch(() => []),
  ]);

  // Tenta conectar ao banco para verificar se está configurado
  let dbConfigured = Boolean(process.env.DATABASE_URL);
  let dbOk: unknown = null;
  if (dbConfigured) {
    try {
      dbOk = await db.select({ total: count() }).from(users).limit(1);
    } catch {
      dbOk = null;
    }
  }

  // Contadores reais
  const totalCourses = allCourses.length;
  let totalStudents = 0;
  let totalEnrollments = 0;
  if (dbOk) {
    try {
      const [s] = await db.select({ total: count() }).from(users);
      const [e] = await db.select({ total: count() }).from(enrollments);
      totalStudents = s?.total ?? 0;
      totalEnrollments = e?.total ?? 0;
    } catch {
      // banco não conectado — mantém zero
    }
  }

  const featured = allCourses.slice(0, 6);

  return (
    <main className="min-h-screen bg-ink-950">
      <Nav user={user ? { name: user.name, role: user.role } : null} />

      {(!dbConfigured || !dbOk) && (
        <SetupBanner dbConfigured={dbConfigured} dbConnected={Boolean(dbOk)} />
      )}

      {/* ── HERO ─────────────────────────────────────────── */}
      <section className="grain relative flex min-h-[100svh] flex-col overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://images.pexels.com/photos/37542465/pexels-photo-37542465.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1080&w=1920"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-ink-950/60 via-ink-950/40 to-ink-950" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink-950/70 via-transparent to-transparent" />

        <div className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center px-5 pt-32 pb-20 lg:px-8">
          <Reveal>
            <p className="mb-6 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.35em] text-gold-300">
              <span className="rule-gold w-10" /> Plataforma de formação teológica
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <h1 className="text-balance max-w-4xl font-display text-5xl font-semibold leading-[1.05] text-ivory-50 md:text-7xl">
              Teologia com{" "}
              <em className="text-gold-300">profundidade</em>.
              <br />
              Formação com{" "}
              <em className="text-gold-300">excelência</em>.
            </h1>
          </Reveal>
          <Reveal delay={0.2}>
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-ivory-100/80">
              Cursos completos de teologia sistemática, exegese, línguas bíblicas e
              ministério — para pastores, líderes e todos que desejam conhecer as
              Escrituras com seriedade.
            </p>
          </Reveal>
          <Reveal delay={0.3}>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link href="/cursos" className="btn-gold">
                Explorar os cursos <ArrowRight className="size-4" />
              </Link>
              <Link href="/login" className="btn-ghost">
                <GraduationCap className="size-4 text-gold-400" /> Área do aluno
              </Link>
            </div>
          </Reveal>

          {/* Contadores reais — só aparecem se houver dados */}
          {totalCourses > 0 && (
            <Reveal delay={0.45}>
              <div className="mt-16 flex flex-wrap gap-10 border-t border-ivory-100/10 pt-8">
                <div>
                  <Library className="mb-3 size-5 text-gold-400" />
                  <p className="font-display text-3xl font-semibold text-ivory-50">
                    {totalCourses}
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-widest text-ivory-300/60">
                    {totalCourses === 1 ? "Curso disponível" : "Cursos disponíveis"}
                  </p>
                </div>
                {totalStudents > 0 && (
                  <div>
                    <Users className="mb-3 size-5 text-gold-400" />
                    <p className="font-display text-3xl font-semibold text-ivory-50">
                      {totalStudents}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-widest text-ivory-300/60">
                      {totalStudents === 1 ? "Aluno cadastrado" : "Alunos cadastrados"}
                    </p>
                  </div>
                )}
                {totalEnrollments > 0 && (
                  <div>
                    <BadgeCheck className="mb-3 size-5 text-gold-400" />
                    <p className="font-display text-3xl font-semibold text-ivory-50">
                      {totalEnrollments}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-widest text-ivory-300/60">
                      {totalEnrollments === 1 ? "Matrícula ativa" : "Matrículas ativas"}
                    </p>
                  </div>
                )}
              </div>
            </Reveal>
          )}
        </div>

        {/* Marquee */}
        <div className="relative border-t border-gold-500/15 bg-ink-950/70 py-4 backdrop-blur-sm">
          <div className="marquee-track items-center gap-10">
            {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
              <span
                key={i}
                className="flex items-center gap-10 whitespace-nowrap font-display text-sm italic text-ivory-200/70"
              >
                {item}
                <Sparkles className="size-3.5 text-gold-500/70" />
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── PILARES ──────────────────────────────────────── */}
      <section className="relative bg-ivory-50 py-24 text-ink-900">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <Reveal>
            <p className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.35em] text-gold-600">
              <span className="rule-gold w-10" /> Nossos pilares
            </p>
            <h2 className="text-balance mt-5 max-w-3xl font-display text-4xl font-semibold leading-tight md:text-5xl">
              Uma escola onde a erudição se encontra com a devoção
            </h2>
          </Reveal>

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {PILLARS.map((p, i) => (
              <Reveal key={p.title} delay={i * 0.12}>
                <div className="group h-full rounded-3xl border border-ivory-300 bg-white/70 p-8 shadow-sm transition duration-500 hover:-translate-y-2 hover:shadow-xl hover:shadow-gold-600/10">
                  <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-gold-400 to-gold-700 text-ink-950 shadow-md shadow-gold-600/30">
                    <p.icon className="size-5" />
                  </span>
                  <h3 className="mt-6 font-display text-2xl font-semibold">{p.title}</h3>
                  <p className="mt-3 leading-relaxed text-ink-700/80">{p.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── CATÁLOGO ─────────────────────────────────────── */}
      <section className="grain relative bg-ink-950 py-24">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.35em] text-gold-300">
                  <span className="rule-gold w-10" /> Catálogo
                </p>
                <h2 className="text-balance mt-5 font-display text-4xl font-semibold text-ivory-50 md:text-5xl">
                  Cursos em destaque
                </h2>
              </div>
              <Link href="/cursos" className="btn-ghost">
                Ver todos <ArrowRight className="size-4 text-gold-400" />
              </Link>
            </div>
          </Reveal>

          {featured.length > 0 ? (
            <div className="mt-14 grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((course, i) => (
                <Reveal key={course.id} delay={(i % 3) * 0.1}>
                  <CourseCard course={course} />
                </Reveal>
              ))}
            </div>
          ) : (
            <Reveal delay={0.1}>
              <div className="mt-14 rounded-3xl border border-dashed border-ink-600 p-16 text-center">
                <BookOpenCheck className="mx-auto size-10 text-gold-500/50" />
                <p className="mt-5 font-display text-xl text-ivory-300/60">
                  Em breve novos cursos disponíveis.
                </p>
                <Link href="/login" className="btn-gold mt-7 inline-flex">
                  Criar minha conta
                </Link>
              </div>
            </Reveal>
          )}
        </div>
      </section>

      {/* ── COMO FUNCIONA ────────────────────────────────── */}
      <section className="bg-ivory-50 py-24 text-ink-900">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <Reveal>
            <p className="flex items-center justify-center gap-3 text-xs font-bold uppercase tracking-[0.35em] text-gold-600">
              <span className="rule-gold w-10" /> Como funciona <span className="rule-gold w-10" />
            </p>
            <h2 className="text-balance mx-auto mt-5 max-w-2xl text-center font-display text-4xl font-semibold leading-tight md:text-5xl">
              Comece a estudar em três passos
            </h2>
          </Reveal>

          <div className="mt-16 grid gap-10 md:grid-cols-3">
            {[
              {
                n: "01",
                icon: Users,
                t: "Crie sua conta",
                d: "Cadastre-se gratuitamente em menos de um minuto e acesse a plataforma imediatamente.",
              },
              {
                n: "02",
                icon: BookOpenCheck,
                t: "Escolha seu curso",
                d: "Matricule-se e acesse o conteúdo completo — aulas, provas e materiais de apoio.",
              },
              {
                n: "03",
                icon: PlayCircle,
                t: "Assista e avance",
                d: "Estude no seu ritmo, marque aulas como concluídas e acompanhe seu progresso.",
              },
            ].map((s, i) => (
              <Reveal key={s.n} delay={i * 0.12}>
                <div className="relative text-center">
                  <span className="font-display text-7xl font-semibold text-gold-500/20">
                    {s.n}
                  </span>
                  <span className="mx-auto -mt-6 grid size-14 place-items-center rounded-full bg-gradient-to-br from-gold-400 to-gold-700 text-ink-950 shadow-lg shadow-gold-600/30">
                    <s.icon className="size-6" />
                  </span>
                  <h3 className="mt-6 font-display text-2xl font-semibold">{s.t}</h3>
                  <p className="mx-auto mt-3 max-w-xs leading-relaxed text-ink-700/80">{s.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ────────────────────────────────────── */}
      <section className="grain relative overflow-hidden bg-ink-950 py-28">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background:
              "radial-gradient(60% 50% at 50% 0%, rgb(201 162 39 / 0.35), transparent 70%)",
          }}
        />
        <div className="relative mx-auto max-w-3xl px-5 text-center">
          <Reveal>
            <p className="font-display text-lg italic text-gold-300">
              "Lâmpada para os meus pés é a tua palavra"
            </p>
            <h2 className="text-balance mt-6 font-display text-4xl font-semibold text-ivory-50 md:text-6xl">
              Comece hoje a sua jornada de estudo
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-lg text-ivory-300/75">
              Junte-se aos alunos aprofundando o conhecimento das Escrituras com
              dedicação e beleza.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-4">
              <Link href="/login" className="btn-gold !px-9 !py-4 !text-base">
                Criar minha conta gratuita <ArrowRight className="size-5" />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <Footer />
    </main>
  );
}
