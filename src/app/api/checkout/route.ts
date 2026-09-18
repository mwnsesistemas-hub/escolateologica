import { NextResponse } from "next/server";
import { db } from "@/db";
import { courses, enrollments, payments } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";
import { asaasConfigured, createAsaasPixPayment } from "@/lib/integrations";
import { confirmPaymentAndEnroll } from "@/lib/payments";

/**
 * Inicia a matrícula em um curso.
 *  - Curso gratuito → confirma na hora.
 *  - Asaas configurado → gera cobrança PIX real e devolve a fatura.
 *  - Sem Asaas → modo demonstração (pagamento pendente, confirmável na interface).
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });

  const { courseId } = await req.json().catch(() => ({}));
  if (!courseId) return NextResponse.json({ error: "Curso não informado." }, { status: 400 });

  const [course] = await db.select().from(courses).where(eq(courses.id, String(courseId))).limit(1);
  if (!course || course.status !== "published") {
    return NextResponse.json({ error: "Curso indisponível." }, { status: 404 });
  }

  // já matriculado?
  const [existing] = await db
    .select()
    .from(enrollments)
    .where(and(eq(enrollments.userId, user.id), eq(enrollments.courseId, course.id)))
    .limit(1);
  if (existing) return NextResponse.json({ mode: "enrolled", enrolled: true });

  // ── Curso gratuito ──────────────────────────────────────────
  if (course.priceCents <= 0) {
    const [payment] = await db
      .insert(payments)
      .values({ userId: user.id, courseId: course.id, amountCents: 0, method: "free" })
      .returning();
    await confirmPaymentAndEnroll(payment.id);
    return NextResponse.json({ mode: "free", enrolled: true });
  }

  // ── Asaas (produção) ────────────────────────────────────────
  if (await asaasConfigured()) {
    try {
      const [payment] = await db
        .insert(payments)
        .values({
          userId: user.id,
          courseId: course.id,
          amountCents: course.priceCents,
          method: "pix",
        })
        .returning();

      const asaas = await createAsaasPixPayment({
        name: user.name,
        email: user.email,
        value: course.priceCents / 100,
        description: `Matrícula: ${course.title}`,
        externalReference: payment.id,
      });

      await db
        .update(payments)
        .set({ asaasPaymentId: asaas.asaasPaymentId, updatedAt: new Date() })
        .where(eq(payments.id, payment.id));

      return NextResponse.json({
        mode: "live",
        paymentId: payment.id,
        invoiceUrl: asaas.invoiceUrl,
      });
    } catch (err) {
      console.error("[Asaas] erro ao gerar cobrança:", err);
      return NextResponse.json(
        { error: "Não foi possível gerar a cobrança no Asaas. Verifique a configuração." },
        { status: 502 }
      );
    }
  }

  // ── Modo demonstração (sem chave Asaas) ─────────────────────
  const [payment] = await db
    .insert(payments)
    .values({
      userId: user.id,
      courseId: course.id,
      amountCents: course.priceCents,
      method: "demo",
      status: "pending",
    })
    .returning();

  return NextResponse.json({ mode: "demo", paymentId: payment.id });
}
