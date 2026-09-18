"use client";

import { useEffect, useState } from "react";
import { Check, KeyRound, LoaderCircle, Save } from "lucide-react";

export function IntegrationSettingsForm() {
  const [settings, setSettings] = useState({
    asaas_api_key: "",
    meta_wa_token: "",
    meta_wa_phone_id: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((res) => res.json())
      .then((data) => {
        setSettings({
          asaas_api_key: data.asaas_api_key || "",
          meta_wa_token: data.meta_wa_token || "",
          meta_wa_phone_id: data.meta_wa_phone_id || "",
        });
      })
      .catch(() => setError("Falha ao carregar configurações."))
      .finally(() => setLoading(false));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("Falha ao salvar.");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError("Erro ao salvar configurações.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <LoaderCircle className="size-8 animate-spin text-gold-500" />
      </div>
    );
  }

  return (
    <form onSubmit={save} className="grid gap-6 md:grid-cols-2">
      {/* ── ASAAS ── */}
      <div className="rounded-2xl border border-ink-700 bg-ink-900 p-7">
        <div className="flex items-center gap-4 mb-6">
          <span className="grid size-12 place-items-center rounded-2xl bg-gold-500/15 text-gold-300">
            <KeyRound className="size-6" />
          </span>
          <div>
            <h2 className="font-display text-xl font-semibold text-ivory-50">Configurar Asaas</h2>
            <p className="text-xs text-ivory-300/55">Chaves de produção ou sandbox</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ivory-300/60">
              API Key (Token de Acesso)
            </label>
            <input
              type="password"
              className="field"
              placeholder="$aact_..."
              value={settings.asaas_api_key}
              onChange={(e) => setSettings({ ...settings, asaas_api_key: e.target.value })}
            />
            <p className="mt-2 text-[10px] text-ivory-300/40 italic">
              * Cole a chave completa. Se já houver uma salva, aparecerá mascarada.
            </p>
          </div>
        </div>
      </div>

      {/* ── META ── */}
      <div className="rounded-2xl border border-ink-700 bg-ink-900 p-7">
        <div className="flex items-center gap-4 mb-6">
          <span className="grid size-12 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-300">
            <KeyRound className="size-6" />
          </span>
          <div>
            <h2 className="font-display text-xl font-semibold text-ivory-50">Configurar Meta</h2>
            <p className="text-xs text-ivory-300/55">WhatsApp Cloud API</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ivory-300/60">
              Token de Acesso (Permanente)
            </label>
            <input
              type="password"
              className="field"
              placeholder="EAA..."
              value={settings.meta_wa_token}
              onChange={(e) => setSettings({ ...settings, meta_wa_token: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ivory-300/60">
              ID do Número de Telefone
            </label>
            <input
              className="field"
              placeholder="123456789..."
              value={settings.meta_wa_phone_id}
              onChange={(e) => setSettings({ ...settings, meta_wa_phone_id: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="md:col-span-2 flex flex-col items-center gap-4 border-t border-ink-800 pt-6">
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button type="submit" disabled={saving} className="btn-gold !px-10">
          {saving ? (
            <LoaderCircle className="size-5 animate-spin" />
          ) : saved ? (
            <>
              <Check className="size-5" /> Configurações Salvas
            </>
          ) : (
            <>
              <Save className="size-5" /> Salvar Configurações no Painel
            </>
          )}
        </button>
      </div>
    </form>
  );
}
