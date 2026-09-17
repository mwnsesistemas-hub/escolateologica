import { notFound } from "next/navigation";
import { db } from "@/db";
import { courses, lessons, modules } from "@/db/schema";
import { asc, eq, inArray } from "drizzle-orm";
import { CourseEditor } from "@/components/course-editor";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Editar curso" };

export default async function CourseEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [course] = await db.select().from(courses).where(eq(courses.id, id)).limit(1);
  if (!course) notFound();

  const moduleRows = await db
    .select()
    .from(modules)
    .where(eq(modules.courseId, course.id))
    .orderBy(asc(modules.position));

  const lessonRows = moduleRows.length
    ? await db
        .select()
        .from(lessons)
        .where(inArray(lessons.moduleId, moduleRows.map((m) => m.id)))
        .orderBy(asc(lessons.position))
    : [];

  return (
    <CourseEditor
      initial={{
        id: course.id,
        title: course.title,
        slug: course.slug,
        subtitle: course.subtitle,
        description: course.description,
        category: course.category,
        level: course.level,
        priceCents: course.priceCents,
        coverUrl: course.coverUrl,
        status: course.status,
        modules: moduleRows.map((m) => ({
          id: m.id,
          title: m.title,
          lessons: lessonRows
            .filter((l) => l.moduleId === m.id)
            .map((l) => ({
              id: l.id,
              title: l.title,
              description: l.description,
              videoUrl: l.videoUrl,
              durationMin: l.durationMin,
              isFree: l.isFree,
            })),
        })),
      }}
    />
  );
}
