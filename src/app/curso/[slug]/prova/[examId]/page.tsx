import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { getCourseTree } from "@/lib/queries";
import { ExamPlayer } from "@/components/exam-player";
import { db } from "@/db";
import { exams } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ensureSeeded } from "@/db/seed";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Prova" };

export default async function ExamPage({
  params,
}: {
  params: Promise<{ slug: string; examId: string }>;
}) {
  const { slug, examId } = await params;
  await ensureSeeded().catch(() => null);
  const user = await getSessionUser().catch(() => null);
  if (!user) redirect(`/login?next=/curso/${slug}/prova/${examId}`);

  const course = await getCourseTree(slug).catch(() => null);
  if (!course) notFound();

  const [exam] = await db.select().from(exams).where(eq(exams.id, examId)).limit(1);
  if (!exam) notFound();

  return (
    <main className="min-h-screen bg-ink-950 pt-8 pb-20 px-5">
      <div className="mx-auto max-w-3xl mb-8">
        <Link
          href={`/curso/${slug}/aulas`}
          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-ivory-300/60 transition hover:text-gold-300"
        >
          <ArrowLeft className="size-3.5" /> Voltar às aulas · {course.title}
        </Link>
      </div>
      <ExamPlayer examId={examId} />
    </main>
  );
}
