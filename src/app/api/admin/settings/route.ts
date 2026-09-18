import { NextResponse } from "next/server";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { eq } from "drizzle-orm";

/**
 * GET /api/admin/settings
 * Retorna as configurações atuais. Mascara as chaves por segurança.
 */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const rows = await db.select().from(settings);
  const data: Record<string, string> = {};
  
  rows.forEach((row) => {
    // Mascara a chave: mostra apenas os 4 primeiros e 4 últimos caracteres
    if (row.value && row.value.length > 10) {
      data[row.key] = `${row.value.slice(0, 4)}...${row.value.slice(-4)}`;
    } else {
      data[row.key] = row.value;
    }
  });

  return NextResponse.json(data);
}

/**
 * POST /api/admin/settings
 * Salva ou atualiza configurações.
 */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const keys = Object.keys(body);

  for (const key of keys) {
    const value = String(body[key]).trim();
    
    // Se o valor estiver mascarado (ex: "EAA...1234"), não atualizamos (preservamos o que está no banco)
    if (value.includes("...")) continue;

    if (value === "") {
      await db.delete(settings).where(eq(settings.key, key));
    } else {
      await db
        .insert(settings)
        .values({ key, value, updatedAt: new Date() })
        .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
    }
  }

  return NextResponse.json({ ok: true });
}
