import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { GraduationCap, Lock } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { getCompletedLessonIds, getCourseTree, getEnrollment } from "@/lib/queries";
import { CoursePlayer } from "@/components/course-player";
import { ensureSeeded } from "@/db/seed";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sala de aula" };

export default async function ClassroomPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ aula?: string }>;
}) {
  const [{ slug }, { aula }] = await Promise.all([params, searchParams]);
  await ensureSeeded();
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/curso/${slug}/aulas`);

  const course = await getCourseTree(slug);
  if (!course || course.status !== "published") notFound();

  const enrollment = await getEnrollment(user.id, course.id);

  // Portão de acesso: matrícula ativa ou administrador
  if (!enrollment && user.role !== "admin") {
    return (
      <main className="grid min-h-screen place-items-center bg-ink-950 px-5">
        <div className="glass max-w-md rounded-3xl p-10 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-gold-500/15 text-gold-300">
            <Lock className="size-6" />
          </span>
          <h1 className="mt-6 font-display text-2xl font-semibold text-ivory-50">
            Matrícula necessária
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ivory-300/70">
            Para assistir às aulas de <strong>{course.title}</strong>, conclua sua
            matrícula no curso.
          </p>
          <Link href={`/curso/${course.slug}`} className="btn-gold mt-7 w-full">
            <GraduationCap className="size-4" /> Ver opções de matrícula
          </Link>
        </div>
      </main>
    );
  }

  const completedIds = await getCompletedLessonIds(user.id);

  return (
    <CoursePlayer
      courseTitle={course.title}
      courseSlug={course.slug}
      initialLessonId={aula ?? null}
      completedIds={completedIds}
      isAdmin={user.role === "admin"}
      modules={course.modules.map((m) => ({
        id: m.id,
        title: m.title,
        lessons: m.lessons.map((l) => ({
          id: l.id,
          title: l.title,
          description: l.description,
          videoUrl: l.videoUrl,
          durationMin: l.durationMin,
          isFree: l.isFree,
        })),
      }))}
    />
  );
}
