import { NextResponse } from "next/server";
import { db } from "@/db";
import { courses, enrollments, payments, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";
import { asaasConfigured, createAsaasPayment } from "@/lib/integrations";
import { confirmPaymentAndEnroll } from "@/lib/payments";

function isValidCpfCnpj(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length === 11 || digits.length === 14;
}

/**
 * Inicia a matrícula em um curso.
 *  - Curso gratuito → confirma na hora.
 *  - Curso pago → gera cobrança real no Asaas (o aluno escolhe PIX,
 *    boleto ou cartão na página do Asaas) e devolve o link da fatura.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });

  const { courseId, cpfCnpj } = await req.json().catch(() => ({}));
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

  // ── Curso pago: exige Asaas configurado ─────────────────────
  if (!(await asaasConfigured())) {
    return NextResponse.json(
      {
        error:
          "Pagamentos ainda não estão ativos. Peça ao administrador para configurar a chave do Asaas em /admin/integracoes.",
      },
      { status: 503 }
    );
  }

  // CPF/CNPJ é exigido pelo Asaas para gerar boleto e cartão
  const currentCpf = user.cpfCnpj || "";
  const providedCpf = typeof cpfCnpj === "string" ? cpfCnpj : "";
  const finalCpf = currentCpf || providedCpf;

  if (!isValidCpfCnpj(finalCpf)) {
    return NextResponse.json(
      { error: "Informe um CPF ou CNPJ válido para continuar." },
      { status: 400 }
    );
  }

  // Salva o CPF/CNPJ no cadastro do aluno, se ainda não tiver
  if (!currentCpf) {
    await db.update(users).set({ cpfCnpj: finalCpf }).where(eq(users.id, user.id));
  }

  try {
    const [payment] = await db
      .insert(payments)
      .values({
        userId: user.id,
        courseId: course.id,
        amountCents: course.priceCents,
        method: "asaas",
      })
      .returning();

    const asaas = await createAsaasPayment({
      name: user.name,
      email: user.email,
      cpfCnpj: finalCpf,
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
