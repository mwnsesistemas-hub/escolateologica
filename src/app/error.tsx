"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  const isDbError =
    error.message?.includes("DATABASE_URL") ||
    error.message?.includes("ECONNREFUSED") ||
    error.message?.includes("connect ETIMEDOUT") ||
    error.message?.includes("pg");

  return (
    <main className="grain relative grid min-h-screen place-items-center overflow-hidden bg-ink-950 px-5">
      <div
        className="absolute inset-0 opacity-20"
        style={{
          background:
            "radial-gradient(50% 50% at 50% 50%, rgb(201 100 39 / 0.3), transparent 80%)",
        }}
      />
      <div className="relative max-w-xl text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-full border border-red-400/30 bg-red-500/10 text-red-300">
          <AlertTriangle className="size-8" />
        </span>

        <h1 className="mt-6 font-display text-3xl font-semibold text-ivory-50">
          {isDbError ? "Banco de dados não conectado" : "Algo deu errado"}
        </h1>

        {isDbError ? (
          <div className="mt-5 space-y-4 text-sm leading-relaxed text-ivory-300/75">
            <p>
              A plataforma não conseguiu conectar ao banco de dados.
              Verifique se a variável <code className="text-gold-300">DATABASE_URL</code> está
              configurada corretamente no painel da Vercel.
            </p>
            <div className="rounded-2xl border border-ink-700 bg-ink-900 p-5 text-left">
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-gold-300">
                Como corrigir
              </p>
              <ol className="list-decimal space-y-2 pl-4">
                <li>
                  Abra <strong>Vercel → seu projeto → Settings → Environment Variables</strong>
                </li>
                <li>
                  Adicione <code className="text-gold-300">DATABASE_URL</code> com a URL de
                  conexão do Supabase (modo <strong>Transaction</strong>, porta 6543)
                </li>
                <li>Adicione <code className="text-gold-300">AUTH_SECRET</code> com qualquer senha longa</li>
                <li>
                  Vá em <strong>Deployments → ⋯ → Redeploy</strong> para aplicar
                </li>
                <li>
                  No Supabase, execute o arquivo{" "}
                  <code className="text-gold-300">supabase-setup.sql</code> no{" "}
                  <strong>SQL Editor</strong> para criar as tabelas
                </li>
              </ol>
            </div>
            <p className="text-xs text-ivory-300/50">
              Digest: {error.digest ?? "—"}
            </p>
          </div>
        ) : (
          <p className="mt-4 text-sm text-ivory-300/70">
            {error.message || "Ocorreu um erro inesperado."}{" "}
            {error.digest && (
              <span className="text-ivory-300/40">({error.digest})</span>
            )}
          </p>
        )}

        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <button onClick={reset} className="btn-gold">
            <RefreshCw className="size-4" /> Tentar novamente
          </button>
          <Link href="/guia" className="btn-ghost">
            Ver guia de configuração
          </Link>
        </div>
      </div>
    </main>
  );
}
