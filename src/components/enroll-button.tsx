"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  ExternalLink,
  LoaderCircle,
  Lock,
  QrCode,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { brl } from "@/lib/format";

type Phase =
  | { step: "idle" }
  | { step: "loading" }
  | { step: "error"; message: string }
  | { step: "demo"; paymentId: string }
  | { step: "live"; invoiceUrl: string | null }
  | { step: "enrolled" };

export function EnrollButton({
  courseId,
  courseSlug,
  priceCents,
  isLoggedIn,
  isEnrolled,
}: {
  courseId: string;
  courseSlug: string;
  priceCents: number;
  isLoggedIn: boolean;
  isEnrolled: boolean;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ step: isEnrolled ? "enrolled" : "idle" });
  const [copied, setCopied] = useState(false);

  async function startCheckout() {
    setPhase({ step: "loading" });
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPhase({ step: "error", message: data.error || "Não foi possível iniciar a matrícula." });
        return;
      }
      if (data.mode === "free" || data.mode === "enrolled") {
        setPhase({ step: "enrolled" });
        router.refresh();
      } else if (data.mode === "live") {
        setPhase({ step: "live", invoiceUrl: data.invoiceUrl });
      } else {
        setPhase({ step: "demo", paymentId: data.paymentId });
      }
    } catch {
      setPhase({ step: "error", message: "Erro de conexão. Tente novamente." });
    }
  }

  async function confirmDemo(paymentId: string) {
    setPhase({ step: "loading" });
    const res = await fetch("/api/checkout/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setPhase({ step: "error", message: data.error || "Falha ao confirmar." });
      return;
    }
    setPhase({ step: "enrolled" });
    router.refresh();
  }

  if (phase.step === "enrolled") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3.5 text-sm font-semibold text-emerald-200">
          <CheckCircle2 className="size-5 shrink-0" />
          Matrícula ativa neste curso
        </div>
        <Link href={`/curso/${courseSlug}/aulas`} className="btn-gold w-full">
          Ir para as aulas <ArrowRight className="size-4" />
        </Link>
      </div>
    );
  }

  if (phase.step === "live") {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-gold-500/30 bg-gold-500/10 p-4 text-sm text-ivory-100">
          <p className="flex items-center gap-2 font-bold text-gold-300">
            <QrCode className="size-4" /> Cobrança PIX gerada
          </p>
          <p className="mt-2 leading-relaxed text-ivory-300/80">
            Abra a fatura no Asaas para pagar. Assim que o pagamento for confirmado,
            sua matrícula será ativada automaticamente (webhook).
          </p>
        </div>
        {phase.invoiceUrl && (
          <a
            href={phase.invoiceUrl}
            target="_blank"
            rel="noreferrer"
            className="btn-gold w-full"
          >
            Abrir cobrança no Asaas <ExternalLink className="size-4" />
          </a>
        )}
        <button onClick={() => setPhase({ step: "idle" })} className="w-full text-center text-xs text-ivory-300/60 hover:text-gold-300">
          Voltar
        </button>
      </div>
    );
  }

  if (phase.step === "demo") {
    const demoCode = `PIX-DEMO-${phase.paymentId.slice(0, 8).toUpperCase()}`;
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-gold-500/30 bg-gold-500/10 p-4 text-sm text-ivory-100">
          <p className="flex items-center gap-2 font-bold text-gold-300">
            <Sparkles className="size-4" /> Ambiente de demonstração
          </p>
          <p className="mt-2 leading-relaxed text-ivory-300/80">
            A chave do Asaas ainda não está configurada, então simulamos o PIX.
            No botão abaixo você confirma o pagamento como se fosse o banco.
          </p>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(demoCode);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="mt-3 flex w-full items-center justify-between rounded-xl border border-dashed border-gold-500/40 bg-ink-900/60 px-4 py-3 font-mono text-xs text-gold-200 transition hover:border-gold-400"
          >
            {demoCode}
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest">
              <Copy className="size-3.5" /> {copied ? "Copiado!" : "Copiar"}
            </span>
          </button>
        </div>
        <button onClick={() => confirmDemo(phase.paymentId)} className="btn-gold w-full">
          <ShieldCheck className="size-4" /> Simular pagamento aprovado
        </button>
        <button onClick={() => setPhase({ step: "idle" })} className="w-full text-center text-xs text-ivory-300/60 hover:text-gold-300">
          Cancelar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {phase.step === "error" && (
        <p className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {phase.message}
        </p>
      )}
      {!isLoggedIn ? (
        <>
          <Link href={`/login?next=/curso/${courseSlug}`} className="btn-gold w-full !py-4">
            <Lock className="size-4" /> Entre para se matricular
          </Link>
          <p className="text-center text-xs text-ivory-300/60">
            Você será redirecionado para criar sua conta gratuita.
          </p>
        </>
      ) : (
        <button onClick={startCheckout} disabled={phase.step === "loading"} className="btn-gold w-full !py-4">
          {phase.step === "loading" ? (
            <LoaderCircle className="size-5 animate-spin" />
          ) : priceCents > 0 ? (
            <>Matricular-se por {brl(priceCents)} <ArrowRight className="size-4" /></>
          ) : (
            <>Matricular-se gratuitamente <ArrowRight className="size-4" /></>
          )}
        </button>
      )}
    </div>
  );
}
