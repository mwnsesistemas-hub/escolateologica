"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  LoaderCircle,
  RotateCcw,
  Send,
  Trophy,
  XCircle,
} from "lucide-react";

type Question = {
  id: string;
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer?: string;
  explanation?: string;
};

type AttemptResult = {
  id: string;
  score: number;
  totalCorrect: number;
  totalQuestions: number;
  passed: boolean;
  answers?: string;
  startedAt?: string;
  finishedAt?: string;
};

type ExamData = {
  exam: {
    id: string;
    title: string;
    description: string;
    timeLimitMin: number;
    maxAttempts: number;
    passingScore: number;
  };
  questions: Question[];
  attempts: AttemptResult[];
  attemptsLeft: number;
  passed: boolean;
  canTry: boolean;
};

type AnswerReview = {
  id: string;
  question: string;
  correctAnswer: string;
  explanation: string;
  yourAnswer: string | null;
};

type Phase =
  | { step: "loading" }
  | { step: "error"; msg: string }
  | { step: "overview"; data: ExamData }
  | { step: "exam"; data: ExamData; startTime: number }
  | { step: "submitting" }
  | {
      step: "result";
      data: ExamData;
      result: AttemptResult;
      attemptsLeft: number;
      reviewAnswers?: AnswerReview[];
    };

const OPTION_KEYS = ["A", "B", "C", "D"] as const;

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function ExamPlayer({ examId }: { examId: string }) {
  const [phase, setPhase] = useState<Phase>({ step: "loading" });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentQ, setCurrentQ] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);

  const load = useCallback(async () => {
    setPhase({ step: "loading" });
    try {
      const res = await fetch(`/api/exams/${examId}/attempt`);
      const data: ExamData = await res.json();
      if (!res.ok) throw new Error((data as unknown as { error: string }).error);
      setPhase({ step: "overview", data });
    } catch (err) {
      setPhase({ step: "error", msg: err instanceof Error ? err.message : "Erro" });
    }
  }, [examId]);

  useEffect(() => { load(); }, [load]);

  // Cronômetro
  useEffect(() => {
    if (phase.step !== "exam") return;
    const total = phase.data.exam.timeLimitMin * 60;
    const elapsed = Math.floor((Date.now() - phase.startTime) / 1000);
    setTimeLeft(Math.max(0, total - elapsed));

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          submitExam();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.step]);

  function startExam(data: ExamData) {
    setAnswers({});
    setCurrentQ(0);
    setPhase({ step: "exam", data, startTime: Date.now() });
  }

  async function submitExam() {
    if (phase.step !== "exam") return;
    setPhase({ step: "submitting" });
    try {
      const res = await fetch(`/api/exams/${examId}/attempt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Recarrega dados completos
      const fresh = await fetch(`/api/exams/${examId}/attempt`);
      const freshData: ExamData = await fresh.json();

      setPhase({
        step: "result",
        data: freshData,
        result: data.attempt,
        attemptsLeft: data.attemptsLeft,
        reviewAnswers: data.answers,
      });
    } catch (err) {
      setPhase({ step: "error", msg: err instanceof Error ? err.message : "Erro ao enviar." });
    }
  }

  // ── LOADING ──
  if (phase.step === "loading" || phase.step === "submitting") {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <LoaderCircle className="size-10 animate-spin text-gold-500" />
        <p className="mt-4 text-sm text-ivory-300/60">
          {phase.step === "submitting" ? "Corrigindo prova..." : "Carregando prova..."}
        </p>
      </div>
    );
  }

  // ── ERROR ──
  if (phase.step === "error") {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-red-400/30 bg-red-500/10 p-8 text-center">
        <XCircle className="mx-auto size-10 text-red-400" />
        <p className="mt-4 text-sm text-red-200">{phase.msg}</p>
        <button onClick={load} className="btn-gold mt-6">
          <RotateCcw className="size-4" /> Tentar novamente
        </button>
      </div>
    );
  }

  // ── OVERVIEW ──
  if (phase.step === "overview") {
    const { data } = phase;
    const { exam, attempts, attemptsLeft, passed, canTry, questions } = data;

    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="glass rounded-3xl p-8">
          <div className="flex items-center gap-4 mb-6">
            <span className="grid size-14 place-items-center rounded-2xl bg-gold-500/15 text-gold-300">
              <Trophy className="size-7" />
            </span>
            <div>
              <h2 className="font-display text-2xl font-semibold text-ivory-50">{exam.title}</h2>
              {exam.description && (
                <p className="mt-1 text-sm text-ivory-300/70">{exam.description}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6">
            {[
              { label: "Questões", value: String(questions.length) },
              { label: "Tempo", value: `${exam.timeLimitMin} min` },
              { label: "Nota mínima", value: `${exam.passingScore}%` },
              { label: "Tentativas", value: `${attemptsLeft}/${exam.maxAttempts}` },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-ink-850 p-4 text-center">
                <p className="font-display text-xl font-semibold text-ivory-50">{s.value}</p>
                <p className="mt-1 text-[10px] uppercase tracking-widest text-ivory-300/55">{s.label}</p>
              </div>
            ))}
          </div>

          {passed && (
            <div className="mb-6 flex items-center gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-5 py-4 text-sm font-semibold text-emerald-200">
              <Award className="size-6 shrink-0" />
              Parabéns! Você já foi aprovado nesta prova.
            </div>
          )}

          {canTry ? (
            <button onClick={() => startExam(data)} className="btn-gold w-full !py-4">
              <Clock className="size-5" />
              {attempts.length === 0 ? "Iniciar prova" : "Nova tentativa"}
            </button>
          ) : !passed ? (
            <div className="flex items-center gap-3 rounded-2xl border border-red-400/30 bg-red-500/10 px-5 py-4 text-sm text-red-200">
              <AlertTriangle className="size-5 shrink-0" />
              Tentativas esgotadas. Veja o gabarito abaixo.
            </div>
          ) : null}
        </div>

        {/* Histórico de tentativas */}
        {attempts.length > 0 && (
          <div className="glass rounded-3xl p-8">
            <h3 className="font-display text-lg font-semibold text-ivory-50 mb-4">
              Histórico de tentativas
            </h3>
            <div className="space-y-2">
              {attempts.map((a, i) => (
                <div
                  key={a.id}
                  className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                    a.passed
                      ? "border-emerald-400/30 bg-emerald-500/10"
                      : "border-ink-700 bg-ink-850"
                  }`}
                >
                  <span className="text-sm font-semibold text-ivory-100">
                    Tentativa {i + 1}
                  </span>
                  <span className="flex items-center gap-3 text-sm">
                    <span className="text-ivory-300/60">
                      {a.totalCorrect}/{a.totalQuestions} acertos
                    </span>
                    <span
                      className={`font-display text-xl font-bold ${
                        a.passed ? "text-emerald-300" : "text-red-300"
                      }`}
                    >
                      {a.score}%
                    </span>
                    {a.passed ? (
                      <CheckCircle2 className="size-5 text-emerald-300" />
                    ) : (
                      <XCircle className="size-5 text-red-300" />
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Gabarito — aparece quando não pode mais tentar ou já passou */}
        {!canTry && questions.some((q) => q.correctAnswer) && (
          <div className="glass rounded-3xl p-8">
            <h3 className="font-display text-lg font-semibold text-ivory-50 mb-6">
              📋 Gabarito completo
            </h3>
            <div className="space-y-5">
              {questions.map((q, i) => {
                const lastAttempt = attempts[attempts.length - 1];
                const userAnswers: Record<string, string> = lastAttempt?.answers
                  ? JSON.parse(lastAttempt.answers)
                  : {};
                const userAnswer = userAnswers[q.id];
                const isCorrect = userAnswer === q.correctAnswer;
                const optionMap = { A: q.optionA, B: q.optionB, C: q.optionC, D: q.optionD };

                return (
                  <div key={q.id} className="rounded-2xl border border-ink-700 bg-ink-850 p-5">
                    <p className="text-sm font-bold text-gold-300 mb-2">Questão {i + 1}</p>
                    <p className="text-sm text-ivory-100 mb-3">{q.question}</p>
                    <div className="grid gap-2">
                      {OPTION_KEYS.map((key) => {
                        const isRight = key === q.correctAnswer;
                        const isChosen = key === userAnswer;
                        return (
                          <div
                            key={key}
                            className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm ${
                              isRight
                                ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                                : isChosen
                                  ? "border-red-400/40 bg-red-500/10 text-red-200"
                                  : "border-ink-700 text-ivory-300/70"
                            }`}
                          >
                            <span className="font-bold">{key})</span>
                            <span className="flex-1">{optionMap[key]}</span>
                            {isRight && <CheckCircle2 className="size-4 text-emerald-300" />}
                            {isChosen && !isRight && <XCircle className="size-4 text-red-300" />}
                          </div>
                        );
                      })}
                    </div>
                    {q.explanation && (
                      <p className="mt-3 rounded-xl bg-gold-500/5 border border-gold-500/20 px-4 py-3 text-xs leading-relaxed text-ivory-300/80">
                        💡 <strong>Explicação:</strong> {q.explanation}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── RESULT (logo após enviar) ──
  if (phase.step === "result") {
    const { result, attemptsLeft, reviewAnswers, data } = phase;

    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="glass rounded-3xl p-8 text-center">
          {result.passed ? (
            <>
              <span className="mx-auto grid size-20 place-items-center rounded-full bg-emerald-500/15 text-emerald-300">
                <Trophy className="size-10" />
              </span>
              <h2 className="mt-6 font-display text-3xl font-semibold text-emerald-200">
                Aprovado! 🎉
              </h2>
            </>
          ) : (
            <>
              <span className="mx-auto grid size-20 place-items-center rounded-full bg-red-500/15 text-red-300">
                <XCircle className="size-10" />
              </span>
              <h2 className="mt-6 font-display text-3xl font-semibold text-red-200">
                Não atingiu a nota mínima
              </h2>
            </>
          )}

          <p className="mt-4 font-display text-6xl font-bold text-ivory-50">{result.score}%</p>
          <p className="mt-2 text-sm text-ivory-300/60">
            {result.totalCorrect} de {result.totalQuestions} questões corretas
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-4">
            {!result.passed && attemptsLeft > 0 && (
              <button onClick={load} className="btn-gold">
                <RotateCcw className="size-4" />
                Tentar novamente ({attemptsLeft} restante{attemptsLeft !== 1 ? "s" : ""})
              </button>
            )}
            <button onClick={load} className="btn-ghost">
              Ver visão geral
            </button>
          </div>
        </div>

        {/* Gabarito pós-envio */}
        {reviewAnswers && (
          <div className="glass rounded-3xl p-8">
            <h3 className="font-display text-lg font-semibold text-ivory-50 mb-6">
              📋 Gabarito desta tentativa
            </h3>
            <div className="space-y-4">
              {reviewAnswers.map((a, i) => (
                <div key={a.id} className="rounded-2xl border border-ink-700 bg-ink-850 p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-bold text-gold-300">Questão {i + 1}</span>
                    {a.yourAnswer === a.correctAnswer ? (
                      <CheckCircle2 className="size-4 text-emerald-300" />
                    ) : (
                      <XCircle className="size-4 text-red-300" />
                    )}
                  </div>
                  <p className="text-sm text-ivory-100 mb-2">{a.question}</p>
                  <p className="text-xs text-ivory-300/70">
                    Sua resposta: <strong className={a.yourAnswer === a.correctAnswer ? "text-emerald-300" : "text-red-300"}>{a.yourAnswer || "—"}</strong>
                    {" · "}Correta: <strong className="text-emerald-300">{a.correctAnswer}</strong>
                  </p>
                  {a.explanation && (
                    <p className="mt-2 rounded-xl bg-gold-500/5 border border-gold-500/20 px-4 py-2.5 text-xs text-ivory-300/80">
                      💡 {a.explanation}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── EXAM (fazendo a prova) ──
  if (phase.step !== "exam") return null;

  const { data } = phase;
  const questions = data.questions;
  const q = questions[currentQ];
  const answeredCount = Object.keys(answers).length;
  const isUrgent = timeLeft <= 60;
  const optionMap = { A: q.optionA, B: q.optionB, C: q.optionC, D: q.optionD };

  return (
    <div className="mx-auto max-w-3xl">
      {/* Barra superior */}
      <div className="glass sticky top-0 z-20 mb-6 flex items-center justify-between gap-4 rounded-2xl px-5 py-3">
        <h2 className="truncate font-display text-lg font-semibold text-ivory-50">
          {data.exam.title}
        </h2>
        <div className="flex items-center gap-4 shrink-0">
          <span className="text-xs text-ivory-300/60">
            {answeredCount}/{questions.length}
          </span>
          <span
            className={`flex items-center gap-2 rounded-full px-4 py-1.5 font-mono text-sm font-bold ${
              isUrgent
                ? "animate-pulse bg-red-500/20 text-red-300"
                : "bg-gold-500/15 text-gold-300"
            }`}
          >
            <Clock className="size-4" />
            {formatTime(timeLeft)}
          </span>
        </div>
      </div>

      {/* Navegação por bolinhas */}
      <div className="mb-6 flex flex-wrap gap-2 justify-center">
        {questions.map((_, i) => {
          const answered = Boolean(answers[questions[i].id]);
          const isCurrent = i === currentQ;
          return (
            <button
              key={i}
              onClick={() => setCurrentQ(i)}
              className={`grid size-9 place-items-center rounded-full text-xs font-bold transition ${
                isCurrent
                  ? "bg-gold-500 text-ink-950"
                  : answered
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30"
                    : "border border-ink-600 text-ivory-300/60 hover:border-gold-500/40"
              }`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      {/* Questão */}
      <div className="glass rounded-3xl p-8">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold-400 mb-4">
          Questão {currentQ + 1} de {questions.length}
        </p>
        <p className="text-lg leading-relaxed text-ivory-50 mb-8">{q.question}</p>

        <div className="grid gap-3">
          {OPTION_KEYS.map((key) => {
            const selected = answers[q.id] === key;
            return (
              <button
                key={key}
                onClick={() => setAnswers({ ...answers, [q.id]: key })}
                className={`flex items-center gap-4 rounded-2xl border px-5 py-4 text-left text-sm transition ${
                  selected
                    ? "border-gold-400 bg-gold-500/15 text-gold-200"
                    : "border-ink-700 bg-ink-850 text-ivory-200/80 hover:border-gold-500/40 hover:bg-ink-800"
                }`}
              >
                <span
                  className={`grid size-8 shrink-0 place-items-center rounded-full font-bold ${
                    selected
                      ? "bg-gold-500 text-ink-950"
                      : "bg-ink-800 text-ivory-300/60"
                  }`}
                >
                  {key}
                </span>
                <span className="flex-1">{optionMap[key]}</span>
                {selected && <CheckCircle2 className="size-5 text-gold-300 shrink-0" />}
              </button>
            );
          })}
        </div>

        {/* Nav da questão */}
        <div className="mt-8 flex items-center justify-between border-t border-ink-700 pt-6">
          <button
            onClick={() => setCurrentQ(Math.max(0, currentQ - 1))}
            disabled={currentQ === 0}
            className="btn-ghost !px-5 !py-2.5 !text-xs disabled:opacity-30"
          >
            <ChevronLeft className="size-4" /> Anterior
          </button>

          {currentQ < questions.length - 1 ? (
            <button
              onClick={() => setCurrentQ(currentQ + 1)}
              className="btn-ghost !px-5 !py-2.5 !text-xs"
            >
              Próxima <ChevronRight className="size-4" />
            </button>
          ) : (
            <button
              onClick={submitExam}
              disabled={answeredCount === 0}
              className="btn-gold !px-8"
            >
              <Send className="size-4" /> Enviar prova
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
