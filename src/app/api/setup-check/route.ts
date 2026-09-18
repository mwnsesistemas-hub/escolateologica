import { NextResponse } from "next/server";
import { db, databaseUrl } from "@/db";
import { users } from "@/db/schema";

/**
 * GET /api/setup-check
 * Diagnóstico público do estado da instalação.
 * Útil para verificar se o banco e as variáveis estão corretos na Vercel.
 */
export async function GET() {
  const checks: Record<string, { ok: boolean; detail: string }> = {};

  // 1. DATABASE_URL
  checks.database_url = {
    ok: Boolean(process.env.DATABASE_URL),
    detail: process.env.DATABASE_URL
      ? "DATABASE_URL configurada ✓"
      : "❌ DATABASE_URL não configurada. Adicione em Vercel → Settings → Environment Variables",
  };

  // 2. AUTH_SECRET
  checks.auth_secret = {
    ok: Boolean(process.env.AUTH_SECRET),
    detail: process.env.AUTH_SECRET
      ? "AUTH_SECRET configurada ✓"
      : "❌ AUTH_SECRET não configurada. Adicione qualquer senha longa em Vercel → Settings → Environment Variables",
  };

  // 2.1. Formato da URL do banco
  const rawUrl = process.env.DATABASE_URL || "";
  const hasPasswordSpecialChars = /:\/\/[^:]+:[^@]*(#|@|\?|\/)[^@]*@/.test(rawUrl);
  const isPooler6543 = rawUrl.includes("pooler.supabase.com:6543");
  checks.database_url_format = {
    ok: isPooler6543 || rawUrl === databaseUrl,
    detail: isPooler6543
      ? "URL do Supabase em modo Transaction (6543) ✓"
      : hasPasswordSpecialChars && rawUrl !== databaseUrl
        ? "⚠️ Sua senha do banco possui caracteres especiais (#, @, ?, / etc). A aplicação tentou corrigir automaticamente, mas o ideal é usar a URL do Supabase já pronta ou trocar a senha por uma sem caracteres especiais."
        : "URL salva, mas o ideal é usar a conexão Transaction do Supabase (pooler na porta 6543).",
  };

  // 3. Conexão com o banco
  try {
    await db.select({ id: users.id }).from(users).limit(1);
    checks.db_connection = { ok: true, detail: "Conexão com o banco OK ✓" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("relation") && msg.includes("does not exist")) {
      checks.db_connection = {
        ok: false,
        detail:
          "❌ Banco conectado mas as TABELAS não existem. Execute o arquivo supabase-setup.sql no SQL Editor do Supabase.",
      };
    } else if (msg.includes("ECONNREFUSED") || msg.includes("ETIMEDOUT") || msg.includes("connect")) {
      checks.db_connection = {
        ok: false,
        detail:
          "❌ Não foi possível conectar ao banco. Verifique se DATABASE_URL está correta e use a porta 6543 (Transaction mode) do Supabase.",
      };
    } else {
      checks.db_connection = { ok: false, detail: `❌ Erro de banco: ${msg}` };
    }
  }

  // 4. Tabelas criadas (se o banco conectou)
  if (checks.db_connection.ok) {
    try {
      const [row] = await db.select({ id: users.id }).from(users).limit(1);
      checks.tables = {
        ok: true,
        detail: row
          ? "Tabelas criadas e com dados ✓"
          : "Tabelas criadas (banco vazio — dados serão semeados na 1ª visita) ✓",
      };
    } catch {
      checks.tables = {
        ok: false,
        detail: "❌ Tabelas não encontradas. Execute supabase-setup.sql no Supabase SQL Editor.",
      };
    }
  }

  // 5. Integrações opcionais
  checks.asaas = {
    ok: Boolean(process.env.ASAAS_API_KEY),
    detail: process.env.ASAAS_API_KEY
      ? "Asaas configurado (cobranças reais ativas) ✓"
      : "Asaas em modo demonstração (sem ASAAS_API_KEY) — pagamentos são simulados",
  };
  checks.meta_whatsapp = {
    ok: Boolean(process.env.META_WA_TOKEN && process.env.META_WA_PHONE_ID),
    detail:
      process.env.META_WA_TOKEN && process.env.META_WA_PHONE_ID
        ? "Meta WhatsApp configurado ✓"
        : "Meta WhatsApp em modo demonstração (sem META_WA_TOKEN / META_WA_PHONE_ID)",
  };

  const allCriticalOk =
    checks.database_url.ok && checks.auth_secret.ok && checks.db_connection.ok;

  return NextResponse.json(
    {
      status: allCriticalOk ? "ok" : "error",
      message: allCriticalOk
        ? "✅ Plataforma configurada corretamente e pronta para uso!"
        : "❌ Há problemas de configuração. Leia os detalhes abaixo.",
      checks,
      tip: allCriticalOk
        ? undefined
        : "Acesse /guia dentro da plataforma para o passo a passo completo de configuração.",
    },
    { status: allCriticalOk ? 200 : 500 }
  );
}
