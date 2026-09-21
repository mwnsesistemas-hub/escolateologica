import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Busca uma configuração do banco de dados.
 * Se não existir, tenta ler das variáveis de ambiente.
 */
async function getSetting(key: string, envKey: string): Promise<string | null> {
  try {
    const [row] = await db
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, key))
      .limit(1);
    
    if (row?.value) return row.value;
  } catch (err) {
    console.warn(`[settings] erro ao buscar ${key} no banco, usando env:`, err);
  }
  
  return process.env[envKey] || null;
}

// ─── ASAAS ──────────────────────────────────────────────────────────────────

export async function getAsaasApiKey(): Promise<string | null> {
  return getSetting("asaas_api_key", "ASAAS_API_KEY");
}

export async function asaasConfigured(): Promise<boolean> {
  const key = await getAsaasApiKey();
  return Boolean(key);
}

/**
 * Ambiente do Asaas: "sandbox" (testes, dinheiro fictício) ou "production"
 * (cobranças reais). Configurável direto pelo painel /admin/integracoes —
 * não é mais preciso mexer em variáveis de ambiente na Vercel.
 */
export async function getAsaasEnvironment(): Promise<"sandbox" | "production"> {
  const value = await getSetting("asaas_environment", "ASAAS_ENVIRONMENT");
  return value === "production" ? "production" : "sandbox";
}

async function asaasBaseUrl(): Promise<string> {
  const env = await getAsaasEnvironment();
  return env === "production"
    ? "https://api.asaas.com/v3"
    : "https://api-sandbox.asaas.com/v3";
}

async function asaasFetch(path: string, options: RequestInit = {}) {
  const apiKey = await getAsaasApiKey();
  const baseUrl = await asaasBaseUrl();
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      access_token: apiKey || "",
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
 * Cria uma cobrança no Asaas. Usamos billingType "UNDEFINED": o próprio
 * aluno escolhe, na página do Asaas, entre PIX, boleto (à vista) ou
 * cartão de crédito — sem precisarmos programar cada método à parte.
 */
export async function createAsaasPayment(params: {
  name: string;
  email: string;
  cpfCnpj: string;
  value: number; // em reais, ex.: 297.00
  description: string;
  externalReference: string;
}): Promise<AsaasPaymentResult> {
  const customer = await asaasFetch("/customers", {
    method: "POST",
    body: JSON.stringify({
      name: params.name,
      email: params.email,
      cpfCnpj: params.cpfCnpj.replace(/\D/g, ""),
      externalReference: params.externalReference,
      notificationDisabled: true,
    }),
  });

  const dueDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const payment = await asaasFetch("/payments", {
    method: "POST",
    body: JSON.stringify({
      customer: customer.id,
      billingType: "UNDEFINED",
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

export async function getMetaWaToken(): Promise<string | null> {
  return getSetting("meta_wa_token", "META_WA_TOKEN");
}

export async function getMetaWaPhoneId(): Promise<string | null> {
  return getSetting("meta_wa_phone_id", "META_WA_PHONE_ID");
}

export async function metaConfigured(): Promise<boolean> {
  const [token, phoneId] = await Promise.all([getMetaWaToken(), getMetaWaPhoneId()]);
  return Boolean(token && phoneId);
}

export async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  const token = await getMetaWaToken();
  const phoneId = await getMetaWaPhoneId();
  
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

export async function notifyEnrollmentWhatsApp(params: {
  phone: string | null;
  studentName: string;
  courseTitle: string;
}) {
  const isMetaOk = await metaConfigured();
  if (!isMetaOk) return;

  const to = params.phone || process.env.META_WA_DEFAULT_TO;
  if (!to) return;

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
