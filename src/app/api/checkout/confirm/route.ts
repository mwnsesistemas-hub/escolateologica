import { NextResponse } from "next/server";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";
import { confirmPaymentAndEnroll } from "@/lib/payments";

/**
 * Simula a confirmação de pagamento no modo demonstração.
 * Em produção, quem confirma é o webhook do Asaas (/api/webhooks/asaas).
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });

  const { paymentId } = await req.json().catch(() => ({}));
  if (!paymentId) return NextResponse.json({ error: "Pagamento não informado." }, { status: 400 });

  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.id, String(paymentId)))
    .limit(1);

  if (!payment || payment.userId !== user.id) {
    return NextResponse.json({ error: "Pagamento não encontrado." }, { status: 404 });
  }
  if (payment.method !== "demo" && user.role !== "admin") {
    return NextResponse.json(
      { error: "Este pagamento deve ser confirmado pelo Asaas." },
      { status: 400 }
    );
  }

  await confirmPaymentAndEnroll(payment.id);
  return NextResponse.json({ ok: true, enrolled: true });
}
