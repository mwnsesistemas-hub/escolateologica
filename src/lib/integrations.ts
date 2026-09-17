/**
 * Integrações externas da plataforma.
 *
 * ASAAS  → cobranças (PIX, boleto, cartão). Documentação: https://docs.asaas.com
 * META   → WhatsApp Cloud API. Documentação: https://developers.facebook.com/docs/whatsapp/cloud-api
 *
 * Se as variáveis de ambiente não estiverem configuradas, a plataforma roda em
 * "modo demonstração": pagamentos são simulados e mensagens apenas registradas.
 */

// ─── ASAAS ──────────────────────────────────────────────────────────────────

export function asaasConfigured(): boolean {
  return Boolean(process.env.ASAAS_API_KEY);
}

function asaasBaseUrl(): string {
  // Sandbox por padrão (seguro para testes). Para produção: https://api.asaas.com/v3
  return process.env.ASAAS_BASE_URL || "https://api-sandbox.asaas.com/v3";
}

async function asaasFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${asaasBaseUrl()}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      access_token: process.env.ASAAS_API_KEY || "",
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (data as { errors?: { description: string }[] })?.errors?.[0]?.description ||
      `Asaas respondeu ${res.status}`;
    throw new Error(msg);
  }
  return data as Record<string, unknown>;
}

export type AsaasPaymentResult = {
  asaasPaymentId: string;
  invoiceUrl: string | null;
  status: string;
};

/**
 * Cria (ou localiza) um cliente e gera uma cobrança PIX.
 * O `externalReference` recebe o ID do pagamento interno para o webhook localizar depois.
 */
export async function createAsaasPixPayment(params: {
  name: string;
  email: string;
  value: number; // em reais, ex.: 297.00
  description: string;
  externalReference: string;
}): Promise<AsaasPaymentResult> {
  // 1) Cria o cliente no Asaas
  const customer = await asaasFetch("/customers", {
    method: "POST",
    body: JSON.stringify({
      name: params.name,
      email: params.email,
      externalReference: params.externalReference,
      notificationDisabled: true,
    }),
  });

  // 2) Cria a cobrança PIX com vencimento de 3 dias
  const dueDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const payment = await asaasFetch("/payments", {
    method: "POST",
    body: JSON.stringify({
      customer: customer.id,
      billingType: "PIX",
      value: params.value,
      dueDate,
      description: params.description,
      externalReference: params.externalReference,
    }),
  });

  return {
    asaasPaymentId: String(payment.id),
    invoiceUrl: (payment.invoiceUrl as string) || null,
    status: String(payment.status || "PENDING"),
  };
}

// ─── META / WHATSAPP CLOUD API ──────────────────────────────────────────────

export function metaConfigured(): boolean {
  return Boolean(process.env.META_WA_TOKEN && process.env.META_WA_PHONE_ID);
}

/**
 * Envia mensagem de texto via WhatsApp Cloud API.
 * Observação: fora da janela de 24h de conversa aberta, a Meta exige templates
 * aprovados — consulte o /guia dentro da plataforma.
 */
export async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  const phoneId = process.env.META_WA_PHONE_ID;
  const token = process.env.META_WA_TOKEN;
  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: to.replace(/\D/g, ""),
      type: "text",
      text: { preview_url: true, body: text },
    }),
  });
  if (!res.ok) {
    const bodyText = await res.text();
    console.error("[Meta WhatsApp] falha ao enviar:", bodyText);
    throw new Error(`WhatsApp API respondeu ${res.status}`);
  }
}

/** Notifica o aluno sobre matrícula confirmada (silencioso em caso de erro) */
export async function notifyEnrollmentWhatsApp(params: {
  phone: string | null;
  studentName: string;
  courseTitle: string;
}) {
  const to = params.phone || process.env.META_WA_DEFAULT_TO;
  if (!metaConfigured() || !to) return;
  try {
    await sendWhatsAppMessage(
      to,
      `Olá, ${params.studentName}! Sua matrícula em "${params.courseTitle}" foi confirmada. ` +
        `Acesse sua área do aluno para começar agora mesmo. Bons estudos!`
    );
  } catch (err) {
    console.error("[Meta WhatsApp] notificação de matrícula falhou:", err);
  }
}
