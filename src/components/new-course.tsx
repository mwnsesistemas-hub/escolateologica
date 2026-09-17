"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Plus, X } from "lucide-react";

export function NewCourseButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Não foi possível criar o curso.");
        return;
      }
      router.push(`/admin/cursos/${data.course.id}`);
    } catch {
      setError("Erro de conexão.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-gold !px-5 !py-2.5 !text-xs">
        <Plus className="size-4" /> Novo curso
      </button>
    );
  }

  return (
    <form
      onSubmit={create}
      className="flex w-full max-w-md items-center gap-2 rounded-2xl border border-gold-500/30 bg-ink-850 p-2 shadow-xl"
    >
      <input
        autoFocus
        className="field !border-0 !bg-transparent !shadow-none focus:!shadow-none"
        placeholder="Título do novo curso…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
      />
      <button
        type="submit"
        disabled={loading}
        className="btn-gold shrink-0 !px-4 !py-2.5 !text-xs"
      >
        {loading ? <LoaderCircle className="size-4 animate-spin" /> : "Criar"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="grid size-9 shrink-0 place-items-center rounded-full text-ivory-300/60 transition hover:text-red-300"
        title="Cancelar"
      >
        <X className="size-4" />
      </button>
      {error && <span className="sr-only">{error}</span>}
    </form>
  );
}
