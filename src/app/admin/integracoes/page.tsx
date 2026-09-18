import {
  BadgeDollarSign,
  CheckCircle2,
  KeyRound,
  MessageCircle,
  TriangleAlert,
  Webhook,
} from "lucide-react";
import { asaasConfigured, metaConfigured } from "@/lib/integrations";
import { WhatsAppTest } from "@/components/whatsapp-test";
import { IntegrationSettingsForm } from "@/components/integration-settings-form";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Integrações · Admin" };

function StatusBadge({ configured }: { configured: boolean }) {
  return configured ? (
    <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-300">
      <CheckCircle2 className="size-3.5" /> Configurado
    </span>
  ) : (
    <span className="flex items-center gap-1.5 rounded-full bg-gold-500/15 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-gold-300">
      <TriangleAlert className="size-3.5" /> Modo demonstração
    </span>
  );
}

export default async function IntegrationsPage() {
  const asaas = await asaasConfigured();
  const meta = await metaConfigured();

  return (
    <div className="max-w-6xl mx-auto">
      <header className="mb-10">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold-400">Plataforma</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-ivory-50 md:text-4xl">
          Integrações externas
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ivory-300/60">
          Você pode configurar as chaves de API diretamente abaixo. Essas chaves serão salvas
          no banco de dados do Supabase com segurança e prioridade sobre o arquivo .env.
        </p>
      </header>

      {/* Formulário de Configuração Dinâmica */}
      <section className="mb-12">
        <IntegrationSettingsForm />
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* ── ASAAS INSTRUCTIONS ── */}
        <div className="rounded-2xl border border-ink-700 bg-ink-900 p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="grid size-12 place-items-center rounded-2xl bg-gold-500/15 text-gold-300">
                <BadgeDollarSign className="size-6" />
              </span>
              <div>
                <h2 className="font-display text-xl font-semibold text-ivory-50">
                  Instruções Asaas
                </h2>
                <p className="text-xs text-ivory-300/55">PIX, boleto e cartão de crédito</p>
              </div>
            </div>
            <StatusBadge configured={asaas} />
          </div>

          <div className="mt-6 space-y-4 text-sm">
            <ol className="list-decimal space-y-2 pl-5 leading-relaxed text-ivory-300/75">
              <li>Crie uma conta em <span className="text-gold-300">asaas.com</span> e gere sua chave de API (Menu → Integrações).</li>
              <li>Teste primeiro no <strong>sandbox</strong>; quando estiver tudo certo, troque a URL na Vercel para <code className="text-gold-300">https://api.asaas.com/v3</code>.</li>
              <li>Configure o webhook no painel do Asaas apontando para a URL abaixo.</li>
            </ol>
            <div className="rounded-xl border border-gold-500/25 bg-gold-500/5 p-4">
              <p className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gold-300">
                <Webhook className="size-3.5" /> URL do webhook
              </p>
              <code className="text-[10px] break-all text-ivory-200/85">
                https://escolateologica.vercel.app/api/webhooks/asaas
              </code>
            </div>
          </div>
        </div>

        {/* ── META INSTRUCTIONS ── */}
        <div className="rounded-2xl border border-ink-700 bg-ink-900 p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="grid size-12 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-300">
                <MessageCircle className="size-6" />
              </span>
              <div>
                <h2 className="font-display text-xl font-semibold text-ivory-50">
                  Instruções Meta
                </h2>
                <p className="text-xs text-ivory-300/55">WhatsApp Cloud API</p>
              </div>
            </div>
            <StatusBadge configured={meta} />
          </div>

          <div className="mt-6 space-y-4 text-sm">
            <ol className="list-decimal space-y-2 pl-5 leading-relaxed text-ivory-300/75">
              <li>Acesse <span className="text-gold-300">developers.facebook.com</span> e crie um app do tipo “Empresas”.</li>
              <li>Adicione o produto <strong>WhatsApp</strong> e copie o <em>token de acesso</em> e o <em>ID do número de telefone</em>.</li>
              <li>Para mensagens fora da janela de 24h, crie um <strong>template aprovado</strong> no Gerenciador do WhatsApp.</li>
            </ol>
            <div className="mt-4">
               <p className="mb-2 text-xs font-bold uppercase tracking-widest text-ivory-300/60">Testar envio</p>
               <WhatsAppTest />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
