"use client";

import { useState } from "react";
import { LoaderCircle, Send } from "lucide-react";

export function WhatsAppTest() {
  const [to, setTo] = useState("");
  const [text, setText] = useState(
    "Olá! Este é um teste da plataforma Lumen — integração WhatsApp funcionando. ✓"
  );
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/integrations/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ ok: false, message: data.error || "Falha ao enviar." });
      } else {
        setResult({
          ok: true,
          message:
            data.mode === "demo"
              ? "Modo demonstração: mensagem registrada no log do servidor (configure a Meta para envio real)."
              : "Mensagem enviada com sucesso via WhatsApp Cloud API!",
        });
      }
    } catch {
      setResult({ ok: false, message: "Erro de conexão." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={send} className="space-y-3">
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ivory-300/60">
          Número de destino (com DDI e DDD)
        </label>
        <input
          className="field"
          placeholder="Ex.: 5511999999999"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ivory-300/60">
          Mensagem
        </label>
        <textarea
          className="field min-h-24 resize-y"
          value={text}
          onChange={(e) => setText(e.target.value)}
          required
        />
      </div>
      {result && (
        <p
          className={`rounded-xl border px-4 py-3 text-sm ${
            result.ok
              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
              : "border-red-400/30 bg-red-500/10 text-red-200"
          }`}
        >
          {result.message}
        </p>
      )}
      <button type="submit" disabled={loading} className="btn-gold w-full">
        {loading ? <LoaderCircle className="size-4 animate-spin" /> : <><Send className="size-4" /> Enviar mensagem de teste</>}
      </button>
    </form>
  );
}
