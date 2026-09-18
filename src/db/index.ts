import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// ─── Normaliza a URL do banco ────────────────────────────────────────────────
// Problema: senhas com caracteres especiais (#, @, ?, %) quebram a URL.
// Solução: detectar e re-codificar a senha automaticamente.

function normalizeDatabaseUrl(raw: string): string {
  // Tenta parsear direto — se funcionar, já está ok
  try {
    const u = new URL(raw);
    if (u.hostname) return raw;
  } catch {
    // continua para tentar corrigir
  }

  // Suporta prefixos postgresql:// e postgres://
  const prefixMatch = raw.match(/^(postgres(?:ql)?:\/\/)/);
  if (!prefixMatch) return raw;

  const prefix = prefixMatch[1];
  const body = raw.slice(prefix.length);

  // Divide em "usuario:senha" @ "host:porta/banco"
  // usa lastIndexOf para o caso de haver @ na senha
  const lastAt = body.lastIndexOf("@");
  if (lastAt === -1) return raw;

  const credentials = body.slice(0, lastAt);
  const hostPart = body.slice(lastAt + 1);

  const firstColon = credentials.indexOf(":");
  if (firstColon === -1) return raw;

  const user = credentials.slice(0, firstColon);
  const pass = credentials.slice(firstColon + 1);

  // Re-codifica a senha preservando o que já estava codificado
  let encoded: string;
  try {
    // tenta decodificar primeiro para não duplo-encodar
    encoded = encodeURIComponent(decodeURIComponent(pass));
  } catch {
    encoded = encodeURIComponent(pass);
  }

  const fixed = `${prefix}${user}:${encoded}@${hostPart}`;

  // Valida o resultado
  try {
    const u = new URL(fixed);
    if (u.hostname) {
      console.warn("[db] DATABASE_URL normalizada (senha com caracteres especiais).");
      return fixed;
    }
  } catch {
    // não foi possível corrigir
  }

  return raw;
}

// ─── Inicialização segura do pool ────────────────────────────────────────────
// NUNCA lança exceção no nível do módulo. Erros de conexão aparecem apenas
// quando uma query é feita, e são capturados nas páginas com .catch(() => []).

const raw = process.env.DATABASE_URL ?? "";
export const databaseUrl = raw ? normalizeDatabaseUrl(raw) : "";

if (!raw) {
  console.error(
    "[db] ⚠️  DATABASE_URL não configurada! " +
      "Adicione em Vercel → Settings → Environment Variables."
  );
}

const isLocal =
  databaseUrl.includes("127.0.0.1") || databaseUrl.includes("localhost");

const globalForDb = globalThis as typeof globalThis & { __lumenPool?: Pool };

// Se não houver URL, cria um pool "mudo" — qualquer query vai falhar,
// mas o servidor não cai na inicialização.
const connectionString = databaseUrl || "postgresql://noop:noop@127.0.0.1:1/noop";

export const pool: Pool =
  globalForDb.__lumenPool ??
  new Pool({
    connectionString,
    ssl: isLocal || !databaseUrl ? false : { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__lumenPool = pool;
}

export const db = drizzle(pool);
