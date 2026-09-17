"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Image as ImageIcon,
  LoaderCircle,
  Lock,
  PenLine,
  Plus,
  Save,
  Trash2,
  Unlock,
  Video,
  X,
} from "lucide-react";

type LessonData = {
  id: string;
  title: string;
  description: string;
  videoUrl: string | null;
  durationMin: number;
  isFree: boolean;
};

type ModuleData = { id: string; title: string; lessons: LessonData[] };

export type CourseData = {
  id: string;
  title: string;
  slug: string;
  subtitle: string | null;
  description: string;
  category: string;
  level: string;
  priceCents: number;
  coverUrl: string | null;
  status: string;
  modules: ModuleData[];
};

function centsToReais(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Falha na requisição.");
  return data;
}

export function CourseEditor({ initial }: { initial: CourseData }) {
  const router = useRouter();
  const [meta, setMeta] = useState({
    title: initial.title,
    subtitle: initial.subtitle ?? "",
    description: initial.description,
    category: initial.category,
    level: initial.level,
    price: centsToReais(initial.priceCents),
    coverUrl: initial.coverUrl ?? "",
    status: initial.status,
  });
  const [modules, setModules] = useState<ModuleData[]>(initial.modules);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newModuleTitle, setNewModuleTitle] = useState("");
  const [lessonForm, setLessonForm] = useState<string | null>(null); // moduleId aberto
  const [newLesson, setNewLesson] = useState({ title: "", durationMin: "", videoUrl: "", description: "", isFree: false });
  const [editingLesson, setEditingLesson] = useState<string | null>(null);
  const [editLesson, setEditLesson] = useState({ title: "", durationMin: "", videoUrl: "", description: "", isFree: false });

  const isPublished = meta.status === "published";

  async function saveMeta(patchStatus?: string) {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const priceCents = Math.round(
        parseFloat((patchStatus ? meta.price : meta.price).replace(",", ".")) * 100 || 0
      );
      await api(`/api/courses/${initial.id}`, "PATCH", {
        title: meta.title,
        subtitle: meta.subtitle,
        description: meta.description,
        category: meta.category,
        level: meta.level,
        priceCents,
        coverUrl: meta.coverUrl,
        status: patchStatus ?? meta.status,
      });
      if (patchStatus) setMeta((m) => ({ ...m, status: patchStatus }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function addModule(e: React.FormEvent) {
    e.preventDefault();
    if (!newModuleTitle.trim()) return;
    try {
      const data = await api("/api/modules", "POST", { courseId: initial.id, title: newModuleTitle });
      setModules((m) => [...m, { id: data.module.id, title: data.module.title, lessons: [] }]);
      setNewModuleTitle("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar módulo.");
    }
  }

  async function removeModule(id: string) {
    if (!confirm("Excluir este módulo e todas as suas aulas?")) return;
    await api(`/api/modules/${id}`, "DELETE");
    setModules((m) => m.filter((x) => x.id !== id));
  }

  async function addLesson(e: React.FormEvent, moduleId: string) {
    e.preventDefault();
    if (!newLesson.title.trim()) return;
    try {
      const data = await api("/api/lessons", "POST", {
        moduleId,
        title: newLesson.title,
        durationMin: Number(newLesson.durationMin) || 0,
        videoUrl: newLesson.videoUrl,
        description: newLesson.description,
        isFree: newLesson.isFree,
      });
      setModules((mods) =>
        mods.map((m) =>
          m.id === moduleId
            ? {
                ...m,
                lessons: [
                  ...m.lessons,
                  {
                    id: data.lesson.id,
                    title: data.lesson.title,
                    description: data.lesson.description,
                    videoUrl: data.lesson.videoUrl,
                    durationMin: data.lesson.durationMin,
                    isFree: data.lesson.isFree,
                  },
                ],
              }
            : m
        )
      );
      setNewLesson({ title: "", durationMin: "", videoUrl: "", description: "", isFree: false });
      setLessonForm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar aula.");
    }
  }

  async function removeLesson(lessonId: string) {
    if (!confirm("Excluir esta aula?")) return;
    await api(`/api/lessons/${lessonId}`, "DELETE");
    setModules((mods) =>
      mods.map((m) => ({ ...m, lessons: m.lessons.filter((l) => l.id !== lessonId) }))
    );
  }

  function startEditLesson(lesson: LessonData) {
    setEditingLesson(lesson.id);
    setEditLesson({
      title: lesson.title,
      durationMin: lesson.durationMin ? String(lesson.durationMin) : "",
      videoUrl: lesson.videoUrl ?? "",
      description: lesson.description,
      isFree: lesson.isFree,
    });
  }

  async function saveLesson(lessonId: string) {
    await api(`/api/lessons/${lessonId}`, "PATCH", {
      title: editLesson.title,
      durationMin: Number(editLesson.durationMin) || 0,
      videoUrl: editLesson.videoUrl,
      description: editLesson.description,
      isFree: editLesson.isFree,
    });
    setModules((mods) =>
      mods.map((m) => ({
        ...m,
        lessons: m.lessons.map((l) =>
          l.id === lessonId
            ? {
                ...l,
                title: editLesson.title,
                durationMin: Number(editLesson.durationMin) || 0,
                videoUrl: editLesson.videoUrl || null,
                description: editLesson.description,
                isFree: editLesson.isFree,
              }
            : l
        ),
      }))
    );
    setEditingLesson(null);
  }

  const totalLessons = modules.reduce((a, m) => a + m.lessons.length, 0);

  return (
    <div>
      {/* Topo */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/cursos"
            className="grid size-10 place-items-center rounded-full border border-ink-700 text-ivory-300 transition hover:border-gold-500 hover:text-gold-300"
            title="Voltar"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold-400">
              Editor de curso · {totalLessons} aulas
            </p>
            <h1 className="font-display text-2xl font-semibold text-ivory-50 md:text-3xl">
              {meta.title || "Sem título"}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isPublished && (
            <Link
              href={`/curso/${initial.slug}`}
              target="_blank"
              className="btn-ghost !px-4 !py-2.5 !text-xs"
            >
              <ExternalLink className="size-3.5 text-gold-400" /> Ver página pública
            </Link>
          )}
          <button
            onClick={() => saveMeta(isPublished ? "draft" : "published")}
            className={`rounded-full px-5 py-2.5 text-xs font-bold transition ${
              isPublished
                ? "border border-gold-500/40 text-gold-300 hover:bg-gold-500/10"
                : "bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
            }`}
          >
            {isPublished ? "Despublicar" : "Publicar curso"}
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-6 rounded-2xl border border-red-400/30 bg-red-500/10 px-5 py-3.5 text-sm text-red-200">
          {error}
        </p>
      )}

      <div className="grid gap-8 xl:grid-cols-[400px_1fr]">
        {/* ── Metadados ────────────────────────────────────── */}
        <div className="h-fit rounded-2xl border border-ink-700 bg-ink-900 p-6 xl:sticky xl:top-8">
          <h2 className="font-display text-lg font-semibold text-ivory-50">Informações do curso</h2>

          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ivory-300/60">Título</label>
              <input className="field" value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ivory-300/60">Subtítulo</label>
              <input className="field" value={meta.subtitle} onChange={(e) => setMeta({ ...meta, subtitle: e.target.value })} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ivory-300/60">Descrição</label>
              <textarea
                className="field min-h-32 resize-y"
                value={meta.description}
                onChange={(e) => setMeta({ ...meta, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ivory-300/60">Categoria</label>
                <input className="field" value={meta.category} onChange={(e) => setMeta({ ...meta, category: e.target.value })} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ivory-300/60">Nível</label>
                <select className="field" value={meta.level} onChange={(e) => setMeta({ ...meta, level: e.target.value })}>
                  <option>Iniciante</option>
                  <option>Intermediário</option>
                  <option>Avançado</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ivory-300/60">
                Preço (R$) — 0,00 para gratuito
              </label>
              <input className="field" inputMode="decimal" value={meta.price} onChange={(e) => setMeta({ ...meta, price: e.target.value })} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ivory-300/60">
                URL da imagem de capa
              </label>
              <div className="flex gap-2">
                <input className="field" placeholder="https://…" value={meta.coverUrl} onChange={(e) => setMeta({ ...meta, coverUrl: e.target.value })} />
                <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-ink-700 bg-ink-850">
                  {meta.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={meta.coverUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ImageIcon className="size-4 text-ivory-300/40" />
                  )}
                </span>
              </div>
            </div>

            <button onClick={() => saveMeta()} disabled={saving} className="btn-gold w-full">
              {saving ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : saved ? (
                <><Check className="size-4" /> Salvo!</>
              ) : (
                <><Save className="size-4" /> Salvar alterações</>
              )}
            </button>
            <p className="text-center text-[11px] text-ivory-300/45">
              Endereço público: /curso/{initial.slug}
            </p>
          </div>
        </div>

        {/* ── Currículo ────────────────────────────────────── */}
        <div>
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-ivory-50">
              Módulos e aulas
            </h2>
          </div>

          <div className="space-y-5">
            {modules.map((mod, mi) => (
              <div key={mod.id} className="rounded-2xl border border-ink-700 bg-ink-900">
                <div className="flex items-center gap-3 border-b border-ink-800 px-5 py-4">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-gold-500/15 font-display text-xs font-bold text-gold-300">
                    {String(mi + 1).padStart(2, "0")}
                  </span>
                  <input
                    className="min-w-0 flex-1 bg-transparent font-display text-base font-semibold text-ivory-50 outline-none transition focus:text-gold-300"
                    defaultValue={mod.title}
                    onBlur={async (e) => {
                      if (e.target.value.trim() && e.target.value !== mod.title) {
                        await api(`/api/modules/${mod.id}`, "PATCH", { title: e.target.value });
                        setModules((ms) => ms.map((m) => (m.id === mod.id ? { ...m, title: e.target.value } : m)));
                      }
                    }}
                  />
                  <button
                    onClick={() => setLessonForm(lessonForm === mod.id ? null : mod.id)}
                    className="flex items-center gap-1.5 rounded-full border border-gold-500/40 px-3.5 py-1.5 text-xs font-bold text-gold-300 transition hover:bg-gold-500/10"
                  >
                    <Plus className="size-3.5" /> Aula
                  </button>
                  <button
                    onClick={() => removeModule(mod.id)}
                    className="grid size-8 place-items-center rounded-full text-ivory-300/50 transition hover:text-red-300"
                    title="Excluir módulo"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>

                {/* Formulário nova aula */}
                {lessonForm === mod.id && (
                  <form onSubmit={(e) => addLesson(e, mod.id)} className="space-y-3 border-b border-ink-800 bg-ink-850/60 p-5">
                    <input
                      autoFocus
                      className="field"
                      placeholder="Título da aula"
                      value={newLesson.title}
                      onChange={(e) => setNewLesson({ ...newLesson, title: e.target.value })}
                      required
                    />
                    <input
                      className="field"
                      placeholder="Descrição curta (opcional)"
                      value={newLesson.description}
                      onChange={(e) => setNewLesson({ ...newLesson, description: e.target.value })}
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <div className="relative">
                        <Video className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ivory-300/40" />
                        <input
                          className="field !pl-10"
                          placeholder="Link do vídeo (YouTube ou MP4)"
                          value={newLesson.videoUrl}
                          onChange={(e) => setNewLesson({ ...newLesson, videoUrl: e.target.value })}
                        />
                      </div>
                      <input
                        className="field"
                        inputMode="numeric"
                        placeholder="Duração (min)"
                        value={newLesson.durationMin}
                        onChange={(e) => setNewLesson({ ...newLesson, durationMin: e.target.value })}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ivory-200/80">
                        <input
                          type="checkbox"
                          className="size-4 accent-gold-500"
                          checked={newLesson.isFree}
                          onChange={(e) => setNewLesson({ ...newLesson, isFree: e.target.checked })}
                        />
                        Aula gratuita de prévia
                      </label>
                      <div className="flex gap-2">
                        <button type="submit" className="btn-gold !px-5 !py-2 !text-xs">Adicionar</button>
                        <button type="button" onClick={() => setLessonForm(null)} className="btn-ghost !px-4 !py-2 !text-xs">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  </form>
                )}

                {/* Aulas */}
                <ul className="divide-y divide-ink-800">
                  {mod.lessons.length === 0 && lessonForm !== mod.id && (
                    <li className="px-5 py-6 text-center text-xs text-ivory-300/45">
                      Nenhuma aula neste módulo ainda.
                    </li>
                  )}
                  {mod.lessons.map((lesson) => (
                    <li key={lesson.id} className="px-5 py-3">
                      {editingLesson === lesson.id ? (
                        <div className="space-y-3 rounded-xl bg-ink-850 p-4">
                          <input className="field" value={editLesson.title} onChange={(e) => setEditLesson({ ...editLesson, title: e.target.value })} />
                          <input className="field" placeholder="Descrição curta" value={editLesson.description} onChange={(e) => setEditLesson({ ...editLesson, description: e.target.value })} />
                          <div className="grid grid-cols-2 gap-3">
                            <input className="field" placeholder="Link do vídeo (YouTube ou MP4)" value={editLesson.videoUrl} onChange={(e) => setEditLesson({ ...editLesson, videoUrl: e.target.value })} />
                            <input className="field" inputMode="numeric" placeholder="Duração (min)" value={editLesson.durationMin} onChange={(e) => setEditLesson({ ...editLesson, durationMin: e.target.value })} />
                          </div>
                          <div className="flex items-center justify-between">
                            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ivory-200/80">
                              <input type="checkbox" className="size-4 accent-gold-500" checked={editLesson.isFree} onChange={(e) => setEditLesson({ ...editLesson, isFree: e.target.checked })} />
                              Prévia gratuita
                            </label>
                            <div className="flex gap-2">
                              <button onClick={() => saveLesson(lesson.id)} className="btn-gold !px-4 !py-1.5 !text-xs">Salvar</button>
                              <button onClick={() => setEditingLesson(null)} className="grid size-8 place-items-center rounded-full text-ivory-300/50 hover:text-red-300" title="Cancelar">
                                <X className="size-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="group flex items-center gap-3">
                          <span className={`grid size-7 shrink-0 place-items-center rounded-lg ${lesson.isFree ? "bg-emerald-500/15 text-emerald-300" : "bg-ink-800 text-ivory-300/50"}`}>
                            {lesson.isFree ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-ivory-100">{lesson.title}</p>
                            <p className="text-xs text-ivory-300/45">
                              {lesson.durationMin > 0 ? `${lesson.durationMin} min` : "sem duração"}
                              {lesson.videoUrl ? " · vídeo vinculado" : " · sem vídeo"}
                              {lesson.isFree ? " · prévia gratuita" : ""}
                            </p>
                          </div>
                          <button onClick={() => startEditLesson(lesson)} className="grid size-8 place-items-center rounded-full text-ivory-300/40 opacity-0 transition group-hover:opacity-100 hover:text-gold-300" title="Editar aula">
                            <PenLine className="size-4" />
                          </button>
                          <button onClick={() => removeLesson(lesson.id)} className="grid size-8 place-items-center rounded-full text-ivory-300/40 opacity-0 transition group-hover:opacity-100 hover:text-red-300" title="Excluir aula">
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Novo módulo */}
          <form onSubmit={addModule} className="mt-5 flex items-center gap-3 rounded-2xl border border-dashed border-ink-600 bg-ink-900/50 p-4 transition-within:border-gold-500/40">
            <Plus className="ml-2 size-4 shrink-0 text-gold-400" />
            <input
              className="min-w-0 flex-1 bg-transparent text-sm text-ivory-100 outline-none placeholder:text-ivory-300/40"
              placeholder="Novo módulo: ex. “Módulo 3 — Aplicações práticas”"
              value={newModuleTitle}
              onChange={(e) => setNewModuleTitle(e.target.value)}
            />
            <button type="submit" className="btn-ghost !px-5 !py-2 !text-xs">
              Adicionar módulo
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
