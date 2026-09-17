import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { metaConfigured, sendWhatsAppMessage } from "@/lib/integrations";

/** Envio de teste de WhatsApp pelo painel administrativo */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const { to, text } = await req.json().catch(() => ({}));
  if (!to || !text) {
    return NextResponse.json({ error: "Informe número e mensagem." }, { status: 400 });
  }

  if (!metaConfigured()) {
    console.log(`[WhatsApp DEMO] para=${to} mensagem="${text}"`);
    return NextResponse.json({
      ok: true,
      mode: "demo",
      message: "Integração não configurada: mensagem registrada apenas no log do servidor.",
    });
  }

  try {
    await sendWhatsAppMessage(String(to), String(text));
    return NextResponse.json({ ok: true, mode: "live" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha ao enviar mensagem." },
      { status: 502 }
    );
  }
}
