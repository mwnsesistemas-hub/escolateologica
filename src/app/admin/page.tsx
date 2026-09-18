import Link from "next/link";
import {
  ArrowRight,
  BadgeDollarSign,
  Clock4,
  GraduationCap,
  Library,
  PlugZap,
  Users,
} from "lucide-react";
import { getAdminStats } from "@/lib/queries";
import { asaasConfigured, metaConfigured } from "@/lib/integrations";
import { brl } from "@/lib/format";
import { db } from "@/db";
import { courses, enrollments, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Administração" };

export default async function AdminDashboard() {
  const [stats, asaasOk, metaOk] = await Promise.all([
    getAdminStats(),
    asaasConfigured(),
    metaConfigured(),
  ]);

  const recent = await db
    .select({ enrollment: enrollments, user: users, course: courses })
    .from(enrollments)
    .innerJoin(users, eq(enrollments.userId, users.id))
    .innerJoin(courses, eq(enrollments.courseId, courses.id))
    .orderBy(desc(enrollments.createdAt))
    .limit(6);

  const cards = [
    { icon: Users, label: "Alunos cadastrados", value: String(stats.students), tint: "text-sky-300 bg-sky-500/15" },
    { icon: Library, label: "Cursos publicados", value: `${stats.published}/${stats.courses}`, tint: "text-gold-300 bg-gold-500/15" },
    { icon: GraduationCap, label: "Matrículas ativas", value: String(stats.enrollments), tint: "text-emerald-300 bg-emerald-500/15" },
    { icon: BadgeDollarSign, label: "Receita confirmada", value: brl(stats.revenueCents), tint: "text-violet-300 bg-violet-500/15" },
  ];

  return (
    <div>
      <header className="mb-10">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold-400">
          Painel administrativo
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-ivory-50 md:text-4xl">
          Visão geral da escola
        </h1>
      </header>

      {/* Indicadores */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-ink-700 bg-ink-900 p-6">
            <span className={`grid size-10 place-items-center rounded-xl ${c.tint}`}>
              <c.icon className="size-5" />
            </span>
            <p className="mt-4 font-display text-3xl font-semibold text-ivory-50">{c.value}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-ivory-300/55">
              {c.label}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Matrículas recentes */}
        <div className="rounded-2xl border border-ink-700 bg-ink-900 p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold text-ivory-50">
              Matrículas recentes
            </h2>
            <Link href="/admin/alunos" className="flex items-center gap-1 text-xs font-semibold text-gold-300 hover:text-gold-200">
              Ver alunos <ArrowRight className="size-3.5" />
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="py-8 text-center text-sm text-ivory-300/50">
              Nenhuma matrícula até o momento.
            </p>
          ) : (
            <ul className="divide-y divide-ink-800">
              {recent.map(({ enrollment, user, course }) => (
                <li key={enrollment.id} className="flex items-center gap-4 py-3.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gold-500/15 font-display text-xs font-bold text-gold-300">
                    {user.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ivory-100">{user.name}</p>
                    <p className="truncate text-xs text-ivory-300/55">{course.title}</p>
                  </div>
                  <span className="flex items-center gap-1.5 text-xs text-ivory-300/50">
                    <Clock4 className="size-3.5" />
                    {new Date(enrollment.createdAt).toLocaleDateString("pt-BR")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Status das integrações */}
        <div className="rounded-2xl border border-ink-700 bg-ink-900 p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold text-ivory-50">Integrações</h2>
            <Link href="/admin/integracoes" className="flex items-center gap-1 text-xs font-semibold text-gold-300 hover:text-gold-200">
              Configurar <PlugZap className="size-3.5" />
            </Link>
          </div>
          <ul className="space-y-4">
            <li className="flex items-center justify-between rounded-xl border border-ink-700 bg-ink-850 px-4 py-3.5">
              <div>
                <p className="text-sm font-bold text-ivory-100">Asaas — Cobranças</p>
                <p className="text-xs text-ivory-300/55">PIX, boleto e cartão</p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${
                  asaasOk
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-gold-500/15 text-gold-300"
                }`}
              >
                {asaasOk ? "Ativo" : "Demo"}
              </span>
            </li>
            <li className="flex items-center justify-between rounded-xl border border-ink-700 bg-ink-850 px-4 py-3.5">
              <div>
                <p className="text-sm font-bold text-ivory-100">Meta — WhatsApp</p>
                <p className="text-xs text-ivory-300/55">Notificações automáticas</p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${
                  metaOk
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-gold-500/15 text-gold-300"
                }`}
              >
                {metaOk ? "Ativo" : "Demo"}
              </span>
            </li>
          </ul>
          <p className="mt-5 text-xs leading-relaxed text-ivory-300/50">
            No modo demo, cobranças são simuladas e mensagens ficam apenas no log.
            Configure as chaves de API para ativar os serviços reais.
          </p>
        </div>
      </div>
    </div>
  );
}
