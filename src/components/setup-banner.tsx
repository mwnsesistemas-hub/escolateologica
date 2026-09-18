"use client";

import Link from "next/link";
import { AlertTriangle, ExternalLink } from "lucide-react";

export function SetupBanner({
  dbConfigured,
  dbConnected,
}: {
  dbConfigured: boolean;
  dbConnected: boolean;
}) {
  return (
    <div className="fixed inset-x-0 top-0 z-[100] bg-amber-500 text-amber-950">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-5 py-3 text-sm font-semibold">
        <AlertTriangle className="size-4 shrink-0" />
        {!dbConfigured ? (
          <span>
            <strong>DATABASE_URL não configurada.</strong> A plataforma funciona
            em modo visualização. Siga o guia para conectar o banco de dados.
          </span>
        ) : !dbConnected ? (
          <span>
            <strong>Banco de dados não conecta.</strong> Verifique se a
            DATABASE_URL está correta (a senha pode ter caracteres especiais como
            # — troque por %23).
          </span>
        ) : null}
        <Link
          href="/guia"
          className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full bg-amber-950 px-4 py-1.5 text-amber-50 transition hover:bg-amber-800"
        >
          Ver guia <ExternalLink className="size-3.5" />
        </Link>
        <a
          href="/api/setup-check"
          target="_blank"
          rel="noreferrer"
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-amber-800 px-4 py-1.5 transition hover:bg-amber-600"
        >
          Diagnóstico <ExternalLink className="size-3.5" />
        </a>
      </div>
    </div>
  );
}
