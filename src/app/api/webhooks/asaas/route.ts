import { NextResponse } from "next/server";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { confirmPaymentAndEnroll } from "@/lib/payments";

/**
 * Webhook do Asaas — configurado em:
 * Painel Asaas → Integrações → Webhooks → URL: https://SEU-DOMINIO/api/webhooks/asaas
 *
 * Segurança: defina ASAAS_WEBHOOK_TOKEN no .env e o mesmo valor no painel do
 * Asaas ("token de autenticação" do webhook). O evento é rejeitado se não bater.
 */
export async function POST(req: Request) {
  const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN;
  if (expectedToken) {
    const received = req.headers.get("asaas-access-token");
    if (received !== expectedToken) {
      return NextResponse.json({ error: "Token inválido." }, { status: 401 });
    }
  }

  const event = await req.json().catch(() => ({}));
  const type: string = event.event || "";
  const asaasPaymentId: string | undefined = event.payment?.id;
  const externalReference: string | undefined = event.payment?.externalReference;

  if (!type.startsWith("PAYMENT_")) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  // localiza o pagamento interno pelo externalReference (ID interno) ou pelo ID Asaas
  const conditions = [];
  if (externalReference) conditions.push(eq(payments.id, externalReference));
  if (asaasPaymentId) conditions.push(eq(payments.asaasPaymentId, asaasPaymentId));
  if (conditions.length === 0) return NextResponse.json({ ok: true, ignored: true });

  const [payment] = await db
    .select()
    .from(payments)
    .where(or(...conditions))
    .limit(1);

  if (!payment) return NextResponse.json({ ok: true, notFound: true });

  if (["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"].includes(type)) {
    await confirmPaymentAndEnroll(payment.id);
  } else if (["PAYMENT_OVERDUE", "PAYMENT_DELETED", "PAYMENT_REFUNDED"].includes(type)) {
    await db
      .update(payments)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(payments.id, payment.id));
  }

  return NextResponse.json({ ok: true });
}
