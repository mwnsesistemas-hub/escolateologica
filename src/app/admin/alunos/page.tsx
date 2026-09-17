import { db } from "@/db";
import { courses, enrollments, users } from "@/db/schema";
import { count, desc, eq, inArray } from "drizzle-orm";
import { GraduationCap, Mail, MessageCircle, UserRound } from "lucide-react";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Alunos · Admin" };

export default async function AdminStudentsPage() {
  const students = await db
    .select()
    .from(users)
    .where(eq(users.role, "student"))
    .orderBy(desc(users.createdAt));

  const enrollmentCounts = students.length
    ? await db
        .select({ userId: enrollments.userId, total: count() })
        .from(enrollments)
        .where(inArray(enrollments.userId, students.map((s) => s.id)))
        .groupBy(enrollments.userId)
    : [];

  const latestCourses = students.length
    ? await db
        .select({ userId: enrollments.userId, title: courses.title, createdAt: enrollments.createdAt })
        .from(enrollments)
        .innerJoin(courses, eq(enrollments.courseId, courses.id))
        .where(inArray(enrollments.userId, students.map((s) => s.id)))
        .orderBy(desc(enrollments.createdAt))
    : [];

  const latestByUser = new Map<string, string>();
  for (const row of latestCourses) {
    if (!latestByUser.has(row.userId)) latestByUser.set(row.userId, row.title);
  }

  return (
    <div>
      <header className="mb-10">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold-400">Comunidade</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-ivory-50 md:text-4xl">
          Alunos cadastrados
        </h1>
        <p className="mt-2 text-sm text-ivory-300/60">{students.length} alunos na plataforma</p>
      </header>

      {students.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-600 p-16 text-center text-sm text-ivory-300/60">
          Nenhum aluno cadastrado ainda.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ink-700 bg-ink-900">
          <div className="hidden grid-cols-[1.4fr_1.4fr_1fr_1fr_0.7fr] gap-4 border-b border-ink-700 bg-ink-850 px-6 py-3.5 text-[10px] font-bold uppercase tracking-widest text-ivory-300/60 md:grid">
            <span>Aluno</span>
            <span>E-mail</span>
            <span>WhatsApp</span>
            <span>Última matrícula</span>
            <span className="text-right">Matrículas</span>
          </div>
          <ul className="divide-y divide-ink-800">
            {students.map((student) => (
              <li
                key={student.id}
                className="grid gap-3 px-6 py-4 md:grid-cols-[1.4fr_1.4fr_1fr_1fr_0.7fr] md:items-center md:gap-4"
              >
                <span className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gold-500/15 text-gold-300">
                    <UserRound className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ivory-100">
                      {student.name}
                    </span>
                    <span className="block text-xs text-ivory-300/45">
                      desde {new Date(student.createdAt).toLocaleDateString("pt-BR")}
                    </span>
                  </span>
                </span>
                <span className="flex items-center gap-2 truncate text-sm text-ivory-300/75">
                  <Mail className="size-3.5 shrink-0 text-gold-500/60" /> {student.email}
                </span>
                <span className="flex items-center gap-2 text-sm text-ivory-300/75">
                  <MessageCircle className="size-3.5 shrink-0 text-emerald-400/70" />
                  {student.phone || "—"}
                </span>
                <span className="truncate text-xs text-ivory-300/60">
                  {latestByUser.get(student.id) || "—"}
                </span>
                <span className="flex items-center gap-1.5 text-sm font-semibold text-gold-300 md:justify-end">
                  <GraduationCap className="size-4" />
                  {enrollmentCounts.find((e) => e.userId === student.id)?.total ?? 0}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
