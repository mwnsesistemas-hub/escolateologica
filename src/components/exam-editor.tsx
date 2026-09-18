"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  LoaderCircle,
  Plus,
  Save,
  Trash2,
  Trophy,
  X,
} from "lucide-react";

type QuestionData = {
  id: string;
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: string;
  explanation: string;
};

type ExamMeta = {
  id: string;
  title: string;
  description: string;
  timeLimitMin: number;
  maxAttempts: number;
  passingScore: number;
};

const EMPTY_Q = {
  question: "",
  optionA: "",
  optionB: "",
  optionC: "",
  optionD: "",
  correctAnswer: "A",
  explanation: "",
};

export function ExamEditorClient({
  exam: initial,
  questions: initialQ,
  courseName,
  moduleName,
}: {
  exam: ExamMeta;
  questions: QuestionData[];
  courseName: string;
  moduleName: string;
}) {
  const router = useRouter();
  const [meta, setMeta] = useState(initial);
  const [questions, setQuestions] = useState(initialQ);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newQ, setNewQ] = useState(EMPTY_Q);
  const [showNewForm, setShowNewForm] = useState(false);
  const [addingQ, setAddingQ] = useState(false);

  async function saveMeta() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch(`/api/exams/${meta.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(meta),
      });
      if (!res.ok) throw new Error("Falha ao salvar.");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError("Erro ao salvar configurações da prova.");
    } finally {
      setSaving(false);
    }
  }

  async function addQuestion(e: React.FormEvent) {
    e.preventDefault();
    if (!newQ.question.trim()) return;
    setAddingQ(true);
    try {
      const res = await fetch(`/api/exams/${meta.id}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newQ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setQuestions([...questions, data.question]);
      setNewQ(EMPTY_Q);
      setShowNewForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao adicionar questão.");
    } finally {
      setAddingQ(false);
    }
  }

  async function deleteQuestion(qId: string) {
    if (!confirm("Excluir esta questão?")) return;
    await fetch(`/api/exams/${meta.id}/questions`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: qId }),
    });
    setQuestions(questions.filter((q) => q.id !== qId));
  }

  async function deleteExam() {
    if (!confirm("Excluir esta prova e todas as questões?")) return;
    await fetch(`/api/exams/${meta.id}`, { method: "DELETE" });
    router.push("/admin/provas");
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8 flex items-center gap-4">
        <Link
          href="/admin/provas"
          className="grid size-10 place-items-center rounded-full border border-ink-700 text-ivory-300 transition hover:border-gold-500 hover:text-gold-300"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <p className="text-xs text-ivory-300/55">
            {courseName} → {moduleName}
          </p>
          <h1 className="font-display text-2xl font-semibold text-ivory-50 flex items-center gap-3">
            <Trophy className="size-6 text-amber-400" />
            {meta.title}
          </h1>
        </div>
        <button
          onClick={deleteExam}
          className="ml-auto text-xs text-red-300/60 hover:text-red-300 transition"
        >
          <Trash2 className="size-4 inline mr-1" />Excluir prova
        </button>
      </div>

      {error && (
        <p className="mb-6 rounded-2xl border border-red-400/30 bg-red-500/10 px-5 py-3 text-sm text-red-200">
          {error}
        </p>
      )}

      {/* Configurações */}
      <div className="glass rounded-2xl p-6 mb-8">
        <h2 className="font-display text-lg font-semibold text-ivory-50 mb-5">Configurações</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ivory-300/60">Título</label>
            <input className="field" value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ivory-300/60">Descrição</label>
            <input className="field" value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ivory-300/60">Tempo limite (min)</label>
            <input className="field" type="number" min={1} value={meta.timeLimitMin} onChange={(e) => setMeta({ ...meta, timeLimitMin: Number(e.target.value) })} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ivory-300/60">Máx. tentativas</label>
            <input className="field" type="number" min={1} max={10} value={meta.maxAttempts} onChange={(e) => setMeta({ ...meta, maxAttempts: Number(e.target.value) })} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ivory-300/60">Nota mínima (%)</label>
            <input className="field" type="number" min={0} max={100} value={meta.passingScore} onChange={(e) => setMeta({ ...meta, passingScore: Number(e.target.value) })} />
          </div>
          <div className="flex items-end">
            <button onClick={saveMeta} disabled={saving} className="btn-gold w-full">
              {saving ? <LoaderCircle className="size-4 animate-spin" /> : saved ? <><Check className="size-4" /> Salvo!</> : <><Save className="size-4" /> Salvar</>}
            </button>
          </div>
        </div>
      </div>

      {/* Questões */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-ivory-50">
          Questões ({questions.length})
        </h2>
        <button onClick={() => setShowNewForm(true)} className="btn-gold !px-5 !py-2.5 !text-xs">
          <Plus className="size-4" /> Adicionar questão
        </button>
      </div>

      <div className="space-y-4">
        {questions.map((q, i) => (
          <div key={q.id} className="rounded-2xl border border-ink-700 bg-ink-900 p-5 group">
            <div className="flex items-start justify-between gap-3 mb-3">
              <p className="text-xs font-bold text-gold-300">Questão {i + 1}</p>
              <button
                onClick={() => deleteQuestion(q.id)}
                className="opacity-0 group-hover:opacity-100 text-red-300/60 hover:text-red-300 transition"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
            <p className="text-sm text-ivory-100 mb-3">{q.question}</p>
            <div className="grid gap-1.5 text-xs">
              {(["A", "B", "C", "D"] as const).map((key) => {
                const optionKey = `option${key}` as keyof QuestionData;
                const isCorrect = q.correctAnswer === key;
                return (
                  <div key={key} className={`flex items-center gap-2 rounded-lg px-3 py-2 ${isCorrect ? "bg-emerald-500/10 text-emerald-200" : "text-ivory-300/70"}`}>
                    <span className="font-bold">{key})</span>
                    <span className="flex-1">{q[optionKey]}</span>
                    {isCorrect && <CheckCircle2 className="size-3.5 text-emerald-300" />}
                  </div>
                );
              })}
            </div>
            {q.explanation && (
              <p className="mt-2 text-[11px] text-ivory-300/50 italic">💡 {q.explanation}</p>
            )}
          </div>
        ))}
      </div>

      {/* Formulário de nova questão */}
      {showNewForm && (
        <form onSubmit={addQuestion} className="mt-6 glass rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-display text-lg font-semibold text-ivory-50">Nova questão</h3>
            <button type="button" onClick={() => setShowNewForm(false)} className="text-ivory-300/50 hover:text-red-300">
              <X className="size-5" />
            </button>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ivory-300/60">Enunciado</label>
            <textarea className="field min-h-20" value={newQ.question} onChange={(e) => setNewQ({ ...newQ, question: e.target.value })} required />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ivory-300/60">Alternativa A</label>
              <input className="field" value={newQ.optionA} onChange={(e) => setNewQ({ ...newQ, optionA: e.target.value })} required />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ivory-300/60">Alternativa B</label>
              <input className="field" value={newQ.optionB} onChange={(e) => setNewQ({ ...newQ, optionB: e.target.value })} required />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ivory-300/60">Alternativa C</label>
              <input className="field" value={newQ.optionC} onChange={(e) => setNewQ({ ...newQ, optionC: e.target.value })} required />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ivory-300/60">Alternativa D</label>
              <input className="field" value={newQ.optionD} onChange={(e) => setNewQ({ ...newQ, optionD: e.target.value })} required />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ivory-300/60">Resposta correta</label>
              <select className="field" value={newQ.correctAnswer} onChange={(e) => setNewQ({ ...newQ, correctAnswer: e.target.value })}>
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
                <option value="D">D</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ivory-300/60">Explicação do gabarito (opcional)</label>
              <input className="field" value={newQ.explanation} onChange={(e) => setNewQ({ ...newQ, explanation: e.target.value })} />
            </div>
          </div>
          <button type="submit" disabled={addingQ} className="btn-gold w-full">
            {addingQ ? <LoaderCircle className="size-4 animate-spin" /> : <><Plus className="size-4" /> Adicionar questão</>}
          </button>
        </form>
      )}
    </div>
  );
}
