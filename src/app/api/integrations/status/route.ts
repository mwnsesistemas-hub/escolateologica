import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { asaasConfigured, metaConfigured } from "@/lib/integrations";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  return NextResponse.json({
    asaas: {
      configured: asaasConfigured(),
      baseUrl: process.env.ASAAS_BASE_URL || "https://api-sandbox.asaas.com/v3",
      webhookTokenSet: Boolean(process.env.ASAAS_WEBHOOK_TOKEN),
    },
    meta: {
      configured: metaConfigured(),
      phoneIdSet: Boolean(process.env.META_WA_PHONE_ID),
      defaultToSet: Boolean(process.env.META_WA_DEFAULT_TO),
    },
  });
}
