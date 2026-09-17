import { db } from "@/db";
import {
  courses,
  enrollments,
  lessons,
  modules,
  payments,
  progress,
  users,
  type Course,
  type Lesson,
  type Module,
} from "@/db/schema";
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";

export type CourseWithCounts = Course & { modulesCount: number; lessonsCount: number };

/** Lista cursos com contagem de módulos/aulas */
export async function getCourseSummaries(options?: {
  publishedOnly?: boolean;
}): Promise<CourseWithCounts[]> {
  const rows = options?.publishedOnly
    ? await db
        .select()
        .from(courses)
        .where(eq(courses.status, "published"))
        .orderBy(asc(courses.createdAt))
    : await db.select().from(courses).orderBy(asc(courses.createdAt));

  return attachCounts(rows);
}

async function attachCounts(list: Course[]): Promise<CourseWithCounts[]> {
  if (list.length === 0) return [];
  const ids = list.map((c) => c.id);
  const moduleRows = await db
    .select({ courseId: modules.courseId, total: count() })
    .from(modules)
    .where(inArray(modules.courseId, ids))
    .groupBy(modules.courseId);
  const moduleIds = await db
    .select({ id: modules.id, courseId: modules.courseId })
    .from(modules)
    .where(inArray(modules.courseId, ids));
  const lessonRows = moduleIds.length
    ? await db
        .select({
          courseId: modules.courseId,
          total: count(),
        })
        .from(lessons)
        .innerJoin(modules, eq(lessons.moduleId, modules.id))
        .where(inArray(modules.courseId, ids))
        .groupBy(modules.courseId)
    : [];

  return list.map((course) => ({
    ...course,
    modulesCount: moduleRows.find((m) => m.courseId === course.id)?.total ?? 0,
    lessonsCount: lessonRows.find((l) => l.courseId === course.id)?.total ?? 0,
  }));
}

export type CourseTree = Course & {
  modules: (Module & { lessons: Lesson[] })[];
};

/** Curso completo com módulos e aulas ordenados */
export async function getCourseTree(slug: string): Promise<CourseTree | null> {
  const [course] = await db.select().from(courses).where(eq(courses.slug, slug)).limit(1);
  if (!course) return null;

  const moduleRows = await db
    .select()
    .from(modules)
    .where(eq(modules.courseId, course.id))
    .orderBy(asc(modules.position), asc(modules.title));

  const lessonRows = moduleRows.length
    ? await db
        .select()
        .from(lessons)
        .where(inArray(lessons.moduleId, moduleRows.map((m) => m.id)))
        .orderBy(asc(lessons.position), asc(lessons.title))
    : [];

  return {
    ...course,
    modules: moduleRows.map((m) => ({
      ...m,
      lessons: lessonRows.filter((l) => l.moduleId === m.id),
    })),
  };
}

export async function getEnrollment(userId: string, courseId: string) {
  const [row] = await db
    .select()
    .from(enrollments)
    .where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId)))
    .limit(1);
  return row ?? null;
}

export async function getCompletedLessonIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ lessonId: progress.lessonId })
    .from(progress)
    .where(eq(progress.userId, userId));
  return rows.map((r) => r.lessonId);
}

/** Painel do aluno: matrículas com curso, total de aulas e aulas concluídas */
export async function getStudentDashboard(userId: string) {
  const rows = await db
    .select({ enrollment: enrollments, course: courses })
    .from(enrollments)
    .innerJoin(courses, eq(enrollments.courseId, courses.id))
    .where(eq(enrollments.userId, userId));

  if (rows.length === 0) return [];

  const withCounts = await attachCounts(rows.map((r) => r.course));

  // aulas concluídas por curso (progresso → aula → módulo → curso)
  const doneRows = await db
    .select({ courseId: modules.courseId, total: count() })
    .from(progress)
    .innerJoin(lessons, eq(progress.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(progress.userId, userId))
    .groupBy(modules.courseId);

  return rows.map((r) => {
    const counts = withCounts.find((c) => c.id === r.course.id);
    return {
      enrollment: r.enrollment,
      course: r.course,
      lessonsCount: counts?.lessonsCount ?? 0,
      modulesCount: counts?.modulesCount ?? 0,
      completedCount: doneRows.find((d) => d.courseId === r.course.id)?.total ?? 0,
    };
  });
}

/** Indicadores do painel administrativo */
export async function getAdminStats() {
  const [studentCount] = await db
    .select({ total: count() })
    .from(users)
    .where(eq(users.role, "student"));
  const [courseCount] = await db.select({ total: count() }).from(courses);
  const [publishedCount] = await db
    .select({ total: count() })
    .from(courses)
    .where(eq(courses.status, "published"));
  const [enrollmentCount] = await db.select({ total: count() }).from(enrollments);
  const [revenue] = await db
    .select({ total: sql<number>`coalesce(sum(${payments.amountCents}), 0)` })
    .from(payments)
    .where(eq(payments.status, "confirmed"));
  const [pendingPayments] = await db
    .select({ total: count() })
    .from(payments)
    .where(eq(payments.status, "pending"));

  return {
    students: studentCount?.total ?? 0,
    courses: courseCount?.total ?? 0,
    published: publishedCount?.total ?? 0,
    enrollments: enrollmentCount?.total ?? 0,
    revenueCents: revenue?.total ?? 0,
    pendingPayments: pendingPayments?.total ?? 0,
  };
}
