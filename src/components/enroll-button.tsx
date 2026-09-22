"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  LoaderCircle,
  Lock,
  ReceiptText,
} from "lucide-react";
import { brl } from "@/lib/format";

type Phase =
  | { step: "idle" }
  | { step: "askCpf" }
  | { step: "loading" }
  | { step: "error"; message: string }
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
  const [cpf, setCpf] = useState("");

  async function startCheckout(cpfCnpj?: string) {
    setPhase({ step: "loading" });
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, cpfCnpj }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPhase({ step: "error", message: data.error || "Não foi possível iniciar a matrícula." });
        return;
      }
      if (data.mode === "free" || data.mode === "enrolled") {
        setPhase({ step: "enrolled" });
        router.refresh();
      } else {
        setPhase({ step: "live", invoiceUrl: data.invoiceUrl });
      }
    } catch {
      setPhase({ step: "error", message: "Erro de conexão. Tente novamente." });
    }
  }

  function handleMainClick() {
    if (priceCents > 0) {
      setPhase({ step: "askCpf" });
    } else {
      startCheckout();
    }
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
            <ReceiptText className="size-4" /> Cobrança gerada
          </p>
          <p className="mt-2 leading-relaxed text-ivory-300/80">
            Abra a fatura para escolher entre PIX, boleto ou cartão de crédito.
            Assim que o pagamento for confirmado, sua matrícula será ativada
            automaticamente.
          </p>
        </div>

        <button onClick={() => setPhase({ step: "idle" })} className="w-full text-center text-xs text-ivory-300/60 hover:text-gold-300">
          Voltar
        </button>
      </div>
    );
  }
        {phase.invoiceUrl && (
          
            href={phase.invoiceUrl}
            target="_blank"
            rel="noreferrer"
            className="btn-gold w-full"
          >
            Abrir cobrança <ExternalLink className="size-4" />
          </a>
        )}
  if (phase.step === "askCpf") {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ivory-300/60">
            CPF ou CNPJ (exigido para gerar o boleto/cartão)
          </label>
          <input
            className="field"
            placeholder="000.000.000-00"
            value={cpf}
            onChange={(e) => setCpf(e.target.value)}
          />
        </div>
        {phase.step === "askCpf" && (
          <p className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200 empty:hidden" />
        )}
        <button
          onClick={() => startCheckout(cpf)}
          className="btn-gold w-full !py-4"
        >
          Continuar <ArrowRight className="size-4" />
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
        <button onClick={handleMainClick} disabled={phase.step === "loading"} className="btn-gold w-full !py-4">
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
