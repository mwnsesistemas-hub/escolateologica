import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { Reveal } from "@/components/reveal";
import { CourseCard } from "@/components/course-card";
import { getSessionUser } from "@/lib/auth";
import { getCourseSummaries } from "@/lib/queries";
import { ensureSeeded } from "@/db/seed";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Catálogo de cursos" };

export default async function CoursesPage() {
  await ensureSeeded();
  const [user, courses] = await Promise.all([
    getSessionUser().catch(() => null),
    getCourseSummaries({ publishedOnly: true }).catch(() => []),
  ]);
  const categories = [...new Set(courses.map((c) => c.category))];

  return (
    <main className="min-h-screen bg-ink-950">
      <Nav user={user ? { name: user.name, role: user.role } : null} />

      <section className="grain relative overflow-hidden pt-40 pb-16">
        <div
          className="absolute inset-0 opacity-25"
          style={{
            background:
              "radial-gradient(55% 60% at 50% -10%, rgb(201 162 39 / 0.3), transparent 70%)",
          }}
        />
        <div className="relative mx-auto max-w-7xl px-5 lg:px-8">
          <Reveal>
            <p className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.35em] text-gold-300">
              <span className="rule-gold w-10" /> Catálogo completo
            </p>
            <h1 className="text-balance mt-5 max-w-3xl font-display text-5xl font-semibold leading-tight text-ivory-50 md:text-6xl">
              Todos os cursos
            </h1>
            <p className="mt-5 max-w-xl text-lg text-ivory-300/75">
              {courses.length} cursos · {categories.length} áreas do conhecimento teológico
            </p>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-28 lg:px-8">
        <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course, i) => (
            <Reveal key={course.id} delay={(i % 3) * 0.08}>
              <CourseCard course={course} />
            </Reveal>
          ))}
        </div>
      </section>

      <Footer />
    </main>
  );
}
