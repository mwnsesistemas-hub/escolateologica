import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { GraduationCap, Lock } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { getCompletedLessonIds, getCourseTree, getEnrollment } from "@/lib/queries";
import { CoursePlayer } from "@/components/course-player";
import { ensureSeeded } from "@/db/seed";
import { db } from "@/db";
import { attachments, exams, examQuestions } from "@/db/schema";
import { asc, eq, inArray } from "drizzle-orm";
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
  await ensureSeeded().catch(() => null);
  const user = await getSessionUser().catch(() => null);
  if (!user) redirect(`/login?next=/curso/${slug}/aulas`);

  const course = await getCourseTree(slug).catch(() => null);
  if (!course || course.status !== "published") notFound();

  const enrollment = await getEnrollment(user.id, course.id).catch(() => null);

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
            Para assistir às aulas de <strong>{course.title}</strong>, conclua sua matrícula.
          </p>
          <Link href={`/curso/${course.slug}`} className="btn-gold mt-7 w-full">
            <GraduationCap className="size-4" /> Ver opções de matrícula
          </Link>
        </div>
      </main>
    );
  }

  const completedIds = await getCompletedLessonIds(user.id);

  // Busca anexos de todas as aulas
  const allLessonIds = course.modules.flatMap((m) => m.lessons.map((l) => l.id));
  const allAttachments = allLessonIds.length
    ? await db
        .select()
        .from(attachments)
        .where(inArray(attachments.lessonId, allLessonIds))
        .orderBy(asc(attachments.position))
        .catch(() => [])
    : [];

  // Busca provas dos módulos
  const moduleIds = course.modules.map((m) => m.id);
  const allExams = moduleIds.length
    ? await db
        .select()
        .from(exams)
        .where(inArray(exams.moduleId, moduleIds))
        .orderBy(asc(exams.position))
        .catch(() => [])
    : [];

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
          attachments: allAttachments
            .filter((a) => a.lessonId === l.id)
            .map((a) => ({ id: a.id, name: a.name, url: a.url, fileType: a.fileType })),
        })),
        exams: allExams
          .filter((e) => e.moduleId === m.id)
          .map((e) => ({ id: e.id, title: e.title, timeLimitMin: e.timeLimitMin })),
      }))}
    />
  );
}
