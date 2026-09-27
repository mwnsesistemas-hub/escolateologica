import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, GraduationCap, Lock, PlayCircle } from "lucide-react";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { getSessionUser } from "@/lib/auth";
import { getCourseTree, getEnrollment } from "@/lib/queries";
import { toYouTubeEmbed } from "@/lib/format";
import { ensureSeeded } from "@/db/seed";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; lessonId: string }>;
}): Promise<Metadata> {
  const { slug, lessonId } = await params;
  const course = await getCourseTree(slug).catch(() => null);
  if (!course) return { title: "Prévia" };
  const lesson = course.modules.flatMap((m) => m.lessons).find((l) => l.id === lessonId);
  return { title: lesson ? `Prévia: ${lesson.title}` : "Prévia" };
}

export default async function PreviaPage({
  params,
}: {
  params: Promise<{ slug: string; lessonId: string }>;
}) {
  const { slug, lessonId } = await params;
  await ensureSeeded().catch(() => null);

  const [course, user] = await Promise.all([
    getCourseTree(slug).catch(() => null),
    getSessionUser().catch(() => null),
  ]);

  if (!course || course.status !== "published") notFound();

  // Se já está matriculado, redireciona direto pra sala de aula
  if (user) {
    const enrollment = await getEnrollment(user.id, course.id).catch(() => null);
    if (enrollment || user.role === "admin") {
      redirect(`/curso/${slug}/aulas?aula=${lessonId}`);
    }
  }

  const allLessons = course.modules.flatMap((m) => m.lessons);
  const lesson = allLessons.find((l) => l.id === lessonId);

  // Aula não encontrada ou não é gratuita
  if (!lesson || !lesson.isFree) {
    return (
      <main className="min-h-screen bg-ink-950">
        <Nav user={user ? { name: user.name, role: user.role } : null} />
        <div className="grid min-h-[70vh] place-items-center px-5">
          <div className="glass max-w-md rounded-3xl p-10 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-gold-500/15 text-gold-300">
              <Lock className="size-6" />
            </span>
            <h1 className="mt-6 font-display text-2xl font-semibold text-ivory-50">
              Conteúdo exclusivo
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-ivory-300/70">
              Esta aula só está disponível para alunos matriculados em{" "}
              <strong>{course.title}</strong>.
            </p>
            <Link href={`/curso/${slug}`} className="btn-gold mt-7 w-full">
              <GraduationCap className="size-4" /> Ver opções de matrícula
            </Link>
          </div>
        </div>
        <Footer />
      </main>
    );
  }

  const embedUrl = lesson.videoUrl ? toYouTubeEmbed(lesson.videoUrl) : null;

  // Outras aulas de prévia do mesmo curso
  const otherPreviews = allLessons.filter((l) => l.isFree && l.id !== lessonId);

  return (
    <main className="min-h-screen bg-ink-950">
      <Nav user={user ? { name: user.name, role: user.role } : null} />

      <section className="mx-auto max-w-5xl px-5 py-14">
        {/* Voltar */}
        <Link
          href={`/curso/${slug}`}
          className="mb-8 inline-flex items-center gap-2 text-sm text-ivory-300/60 transition hover:text-gold-300"
        >
          <ArrowLeft className="size-4" /> Voltar para o curso
        </Link>

        <div className="mb-3 flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-300">
            <PlayCircle className="size-3.5" /> Aula prévia gratuita
          </span>
        </div>
        <h1 className="font-display text-3xl font-semibold text-ivory-50 md:text-4xl">
          {lesson.title}
        </h1>
        {lesson.description && (
          <p className="mt-3 text-ivory-300/70">{lesson.description}</p>
        )}

        {/* Player */}
        <div className="mt-8 overflow-hidden rounded-2xl bg-ink-900 shadow-2xl">
          {embedUrl ? (
            <div className="relative aspect-video w-full">
              <iframe
                src={embedUrl}
                className="absolute inset-0 size-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <div className="grid aspect-video place-items-center text-ivory-300/40">
              <p className="text-sm">Vídeo não configurado para esta aula.</p>
            </div>
          )}
        </div>

        {/* CTA de matrícula */}
        <div className="mt-10 rounded-2xl border border-gold-500/20 bg-gold-500/5 p-7 text-center">
          <h2 className="font-display text-xl font-semibold text-ivory-50">
            Gostou? Acesse o curso completo.
          </h2>
          <p className="mt-2 text-sm text-ivory-300/60">
            Matricule-se agora e tenha acesso vitalício a todas as aulas de{" "}
            <strong className="text-ivory-200">{course.title}</strong>.
          </p>
          <Link href={`/curso/${slug}`} className="btn-gold mx-auto mt-6 inline-flex">
            <GraduationCap className="size-4" /> Ver opções de matrícula
          </Link>
        </div>

        {/* Outras prévias */}
        {otherPreviews.length > 0 && (
          <div className="mt-12">
            <h3 className="mb-5 font-display text-lg font-semibold text-ivory-50">
              Outras aulas de prévia
            </h3>
            <ul className="space-y-3">
              {otherPreviews.map((l) => (
                <li key={l.id}>
                  <Link
                    href={`/curso/${slug}/previa/${l.id}`}
                    className="flex items-center gap-4 rounded-2xl border border-ink-700 bg-ink-900 p-4 transition hover:border-gold-500/40 hover:bg-ink-850"
                  >
                    <PlayCircle className="size-5 shrink-0 text-gold-400" />
                    <span className="flex-1 text-sm font-medium text-ivory-100">{l.title}</span>
                    {l.durationMin > 0 && (
                      <span className="text-xs text-ivory-300/50">{l.durationMin} min</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <Footer />
    </main>
  );
}
