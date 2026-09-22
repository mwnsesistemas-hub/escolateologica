"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { LoaderCircle, LogIn, UserPlus } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Não foi possível autenticar.");
        return;
      }
      const next = params.get("next") || (data.role === "admin" ? "/admin" : "/painel");
      router.push(next);
      router.refresh();
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

      <div className="mt-6 border-t border-ink-700 pt-5">
        <p className="mb-3 text-center text-[11px] font-semibold uppercase tracking-widest text-ivory-300/50">
          Acesso rápido de demonstração
        </p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <button onClick={() => fillDemo("admin")} className="rounded-xl border border-gold-500/25 bg-gold-500/10 px-3 py-2.5 font-semibold text-gold-300 transition hover:bg-gold-500/20">
            Administrador
          </button>
          <button onClick={() => fillDemo("student")} className="rounded-xl border border-ink-600 bg-ink-800 px-3 py-2.5 font-semibold text-ivory-200 transition hover:border-gold-500/40">
            Aluno
          </button>
        </div>
      </div>

  return (
    <div className="glass rounded-3xl p-8 shadow-2xl">
      <div className="mb-7 grid grid-cols-2 gap-2 rounded-full bg-ink-850 p-1.5 text-sm font-semibold">
        <button
          onClick={() => { setMode("login"); setError(null); }}
          className={`rounded-full py-2 transition ${mode === "login" ? "bg-gold-500 text-ink-950" : "text-ivory-300 hover:text-gold-300"}`}
        >
          Entrar
        </button>
        <button
          onClick={() => { setMode("register"); setError(null); }}
          className={`rounded-full py-2 transition ${mode === "register" ? "bg-gold-500 text-ink-950" : "text-ivory-300 hover:text-gold-300"}`}
        >
          Criar conta
        </button>
      </div>

      <form onSubmit={submit} className="space-y-4">
        {mode === "register" && (
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ivory-300/70">
              Nome completo
            </label>
            <input
              className="field"
              placeholder="Seu nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
        )}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ivory-300/70">
            E-mail
          </label>
          <input
            type="email"
            className="field"
            placeholder="voce@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ivory-300/70">
            Senha
          </label>
          <input
            type="password"
            className="field"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        </div>

        {error && (
          <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} className="btn-gold w-full !py-3.5">
          {loading ? (
            <LoaderCircle className="size-5 animate-spin" />
          ) : mode === "login" ? (
            <><LogIn className="size-4" /> Entrar na plataforma</>
          ) : (
            <><UserPlus className="size-4" /> Criar minha conta</>
          )}
        </button>
      </form>

      <div className="mt-6 border-t border-ink-700 pt-5">
        <p className="mb-3 text-center text-[11px] font-semibold uppercase tracking-widest text-ivory-300/50">
          Acesso rápido de demonstração
        </p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <button onClick={() => fillDemo("admin")} className="rounded-xl border border-gold-500/25 bg-gold-500/10 px-3 py-2.5 font-semibold text-gold-300 transition hover:bg-gold-500/20">
            Administrador
          </button>
          <button onClick={() => fillDemo("student")} className="rounded-xl border border-ink-600 bg-ink-800 px-3 py-2.5 font-semibold text-ivory-200 transition hover:border-gold-500/40">
            Aluno
          </button>
        </div>
      </div>
    </div>
  );
}
