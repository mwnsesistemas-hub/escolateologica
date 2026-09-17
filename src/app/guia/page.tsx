import Link from "next/link";
import {
  ArrowRight,
  BadgeDollarSign,
  Cloud,
  Database,
  GitBranch,
  KeyRound,
  MessageCircle,
  MonitorSmartphone,
  Rocket,
  ShieldCheck,
  SquareTerminal,
} from "lucide-react";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { Reveal } from "@/components/reveal";
import { getSessionUser } from "@/lib/auth";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Guia de publicação",
  description: "Passo a passo para publicar a plataforma no GitHub, Supabase e Vercel.",
};

function Step({
  n,
  icon: Icon,
  title,
  children,
}: {
  n: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Reveal>
      <section className="relative grid gap-8 rounded-3xl border border-ink-700 bg-ink-900 p-8 md:grid-cols-[auto_1fr] md:p-12">
        <div className="flex md:flex-col md:items-center">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-gold-400 to-gold-700 text-ink-950 shadow-lg shadow-gold-600/25">
            <Icon className="size-6" />
          </span>
          <span className="ml-4 self-center font-display text-sm font-bold text-gold-500/60 md:ml-0 md:mt-4">
            {n}
          </span>
        </div>
        <div>
          <h2 className="font-display text-2xl font-semibold text-ivory-50 md:text-3xl">{title}</h2>
          <div className="mt-5 space-y-4 leading-relaxed text-ivory-200/80">{children}</div>
        </div>
      </section>
    </Reveal>
  );
}

function Code({ children }: { children: string }) {
  return <pre className="codeblock"><code>{children}</code></pre>;
}

export default async function GuidePage() {
  const user = await getSessionUser();

  return (
    <main className="min-h-screen bg-ink-950">
      <Nav user={user ? { name: user.name, role: user.role } : null} />

      <section className="grain relative overflow-hidden pt-40 pb-16">
        <div
          className="absolute inset-0 opacity-25"
          style={{
            background:
              "radial-gradient(55% 60% at 50% -10%, rgb(201 162 39 / 0.35), transparent 70%)",
          }}
        />
        <div className="relative mx-auto max-w-4xl px-5 text-center lg:px-8">
          <Reveal>
            <p className="flex items-center justify-center gap-3 text-xs font-bold uppercase tracking-[0.35em] text-gold-300">
              <span className="rule-gold w-10" /> Zero experiência necessária <span className="rule-gold w-10" />
            </p>
            <h1 className="text-balance mt-6 font-display text-4xl font-semibold leading-tight text-ivory-50 md:text-6xl">
              Publique sua plataforma em 7 passos
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-ivory-300/75">
              Este guia leva você do zero ao ar: GitHub, banco de dados Supabase,
              publicação na Vercel, cobranças Asaas, WhatsApp Meta e a incorporação
              no seu site — sem instalar nada no computador, tudo pelo navegador.
            </p>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto max-w-4xl space-y-8 px-5 pb-28 lg:px-8">
        {/* 1 ─ GitHub */}
        <Step n="PASSO 01" icon={GitBranch} title="Suba os arquivos para o GitHub">
          <p>
            O GitHub guarda o código da sua plataforma (é grátis e funciona como o
            “HD na nuvem” do projeto).
          </p>
          <ol className="list-decimal space-y-2.5 pl-5">
            <li>Acesse <a className="font-semibold text-gold-300 underline decoration-gold-500/40 hover:text-gold-200" href="https://github.com" target="_blank" rel="noreferrer">github.com</a> e crie sua conta gratuita.</li>
            <li>Clique no botão verde <strong>New</strong> (ou em <strong>Create repository</strong>), dê o nome <code className="text-gold-300">escola-de-teologia</code>, marque <strong>Private</strong> se preferir e confirme.</li>
            <li>Nesta página do projeto, baixe todos os arquivos (botão de download da plataforma) e descompacte no computador.</li>
            <li>Na página inicial do repositório recém-criado, clique em <strong>uploading an existing file</strong> e arraste <strong>todos os arquivos e pastas</strong> para dentro da janela.</li>
            <li>Role até o fim da página e clique no botão verde <strong>Commit changes</strong>. Pronto — seu código está salvo no GitHub.</li>
          </ol>
          <p className="rounded-xl border border-gold-500/25 bg-gold-500/5 p-4 text-sm">
            <ShieldCheck className="mr-2 inline size-4 text-gold-300" />
            Importante: <strong>não</strong> envie o arquivo <code className="text-gold-300">.env</code> para o GitHub.
            As senhas ficam guardadas na Vercel (passo 4), nunca no código público.
          </p>
        </Step>

        {/* 2 ─ Supabase */}
        <Step n="PASSO 02" icon={Database} title="Crie o banco de dados no Supabase">
          <p>O Supabase é onde ficam os dados: alunos, cursos, aulas, matrículas e pagamentos.</p>
          <ol className="list-decimal space-y-2.5 pl-5">
            <li>Acesse <a className="font-semibold text-gold-300 underline decoration-gold-500/40 hover:text-gold-200" href="https://supabase.com" target="_blank" rel="noreferrer">supabase.com</a> → <strong>Start your project</strong> e entre com a conta do GitHub.</li>
            <li>Clique em <strong>New project</strong>, escolha um nome (ex.: <code className="text-gold-300">lumen</code>), defina uma <strong>senha do banco</strong> forte (anote-a!) e mantenha a região <strong>São Paulo</strong>. Clique em <strong>Create new project</strong> e aguarde ~2 minutos.</li>
            <li>No menu lateral, clique no ícone de <strong>&lt;/&gt;</strong> (SQL Editor) → <strong>New query</strong>.</li>
            <li>Abra o arquivo <code className="text-gold-300">supabase-setup.sql</code> (na raiz dos arquivos do projeto), copie <strong>todo o conteúdo</strong>, cole no editor e clique em <strong>Run</strong>. Isso cria todas as tabelas de uma vez.</li>
            <li>Agora copie a URL de conexão: menu lateral → ícone de engrenagem (<strong>Settings</strong>) → <strong>Database</strong> → seção <strong>Connection string</strong> → aba <strong>URI</strong>. Copie o texto, que é assim:</li>
          </ol>
          <Code>{`postgresql://postgres.SEU-PROJETO:[SUA-SENHA]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`}</Code>
          <p className="text-sm">
            Substitua <code className="text-gold-300">[SUA-SENHA]</code> pela senha que você anotou ao criar o projeto.
            Guarde essa URL — ela será a sua <code className="text-gold-300">DATABASE_URL</code> no próximo passo.
          </p>
        </Step>

        {/* 3 ─ Vercel */}
        <Step n="PASSO 03" icon={Rocket} title="Publique na Vercel (de graça)">
          <p>A Vercel coloca o site no ar em minutos e já conecta com o GitHub.</p>
          <ol className="list-decimal space-y-2.5 pl-5">
            <li>Acesse <a className="font-semibold text-gold-300 underline decoration-gold-500/40 hover:text-gold-200" href="https://vercel.com" target="_blank" rel="noreferrer">vercel.com</a> → <strong>Sign Up</strong> → <strong>Continue with GitHub</strong>.</li>
            <li>Clique em <strong>Add New… → Project</strong> e depois em <strong>Import</strong> ao lado do repositório <code className="text-gold-300">escola-de-teologia</code>.</li>
            <li>Antes de clicar em Deploy, abra a seção <strong>Environment Variables</strong> e adicione estas duas variáveis:</li>
          </ol>
          <Code>{`DATABASE_URL = postgresql://postgres.SEU-PROJETO:SUA-SENHA@...supabase.com:5432/postgres
AUTH_SECRET  = uma-senha-longa-e-aleatoria-que-voce-inventar`}</Code>
          <ol className="list-decimal space-y-2.5 pl-5" start={4}>
            <li>Clique em <strong>Deploy</strong> e aguarde ~2 minutos. Ao final, a Vercel mostra o endereço do seu site, algo como:</li>
          </ol>
          <Code>{`https://escola-de-teologia.vercel.app`}</Code>
          <p>
            Abra o endereço: a plataforma estará no ar já com os cursos de demonstração.
            Toda vez que você atualizar os arquivos no GitHub, a Vercel republica tudo automaticamente.
          </p>
        </Step>

        {/* 4 ─ Acessos demo */}
        <Step n="PASSO 04" icon={KeyRound} title="Entre e personalize">
          <p>A plataforma já nasce com dois acessos de demonstração (a página de login tem botões de acesso rápido):</p>
          <Code>{`Administrador →  admin@lumen.app  /  admin123
Aluno demo    →  aluna@lumen.app  /  aluno123`}</Code>
          <ol className="list-decimal space-y-2.5 pl-5">
            <li>Entre como administrador e visite <strong>/admin</strong>: lá você cria cursos, módulos e aulas, vê alunos e testa as integrações.</li>
            <li>Apague ou troque as senhas dos usuários de demonstração antes de divulgar o site (ou crie novos administradores direto no banco pelo Supabase → Table Editor).</li>
            <li>Para trocar nome, cores e textos, edite os arquivos no GitHub (lápis de edição em cada arquivo) — a Vercel atualiza o site sozinha.</li>
          </ol>
        </Step>

        {/* 5 ─ Asaas */}
        <Step n="PASSO 05" icon={BadgeDollarSign} title="Ative as cobranças do Asaas">
          <p>
            Enquanto a chave não é configurada, os pagamentos funcionam em
            <strong> modo demonstração</strong> (simulação completa: PIX fictício + confirmação manual).
            Para receber de verdade:
          </p>
          <ol className="list-decimal space-y-2.5 pl-5">
            <li>Crie a conta em <a className="font-semibold text-gold-300 underline decoration-gold-500/40 hover:text-gold-200" href="https://www.asaas.com" target="_blank" rel="noreferrer">asaas.com</a> e confirme seus dados.</li>
            <li>No painel do Asaas, vá em <strong>Integrações → API</strong> e gere a sua <strong>chave de API</strong>.</li>
            <li>Na Vercel: <strong>Project → Settings → Environment Variables</strong> e adicione:</li>
          </ol>
          <Code>{`ASAAS_API_KEY     = $aact_sua-chave-aqui
ASAAS_BASE_URL    = https://api-sandbox.asaas.com/v3   (testes)
                  → em produção: https://api.asaas.com/v3
ASAAS_WEBHOOK_TOKEN = invente-um-segredo`}</Code>
          <ol className="list-decimal space-y-2.5 pl-5" start={4}>
            <li>Em <strong>Deployments</strong>, clique nos três pontinhos do último deploy → <strong>Redeploy</strong> para as variáveis entrarem em vigor.</li>
            <li>No painel do Asaas, cadastre o webhook com a URL abaixo e o mesmo token, marcando os eventos de pagamento:</li>
          </ol>
          <Code>{`https://SEU-SITE.vercel.app/api/webhooks/asaas`}</Code>
          <p>
            Feito isso, quando um aluno paga o PIX, o Asaas avisa a plataforma e a
            matrícula é liberada automaticamente — sem você tocar em nada.
          </p>
        </Step>

        {/* 6 ─ Meta */}
        <Step n="PASSO 06" icon={MessageCircle} title="Conecte o WhatsApp da Meta">
          <p>
            A plataforma envia automaticamente uma mensagem de boas-vindas ao WhatsApp
            do aluno quando a matrícula é confirmada. Você também pode testar envios
            em <strong>/admin/integracoes</strong>.
          </p>
          <ol className="list-decimal space-y-2.5 pl-5">
            <li>Acesse <a className="font-semibold text-gold-300 underline decoration-gold-500/40 hover:text-gold-200" href="https://developers.facebook.com" target="_blank" rel="noreferrer">developers.facebook.com</a> e crie um aplicativo do tipo <strong>Empresas</strong>.</li>
            <li>Adicione o produto <strong>WhatsApp</strong> ao app. Na tela de configuração, copie o <strong>token de acesso temporário</strong> e o <strong>ID do número de telefone de teste</strong>.</li>
            <li>Adicione na Vercel (e redeploy):</li>
          </ol>
          <Code>{`META_WA_TOKEN      = EAAxxxxxxxxxxxxxxxx
META_WA_PHONE_ID   = 123456789012345
META_WA_DEFAULT_TO = 55DDDNUMERO  (opcional: destino padrão p/ avisos)`}</Code>
          <p className="rounded-xl border border-gold-500/25 bg-gold-500/5 p-4 text-sm">
            <MonitorSmartphone className="mr-2 inline size-4 text-gold-300" />
            Dica da Meta: para produção, gere um <strong>token permanente</strong> (usuário do sistema
            no Gerenciador de Negócios) e crie <strong>templates de mensagem aprovados</strong> —
            mensagens livres só chegam dentro da janela de 24h de conversa.
          </p>
        </Step>

        {/* 7 ─ Iframe */}
        <Step n="PASSO 07" icon={SquareTerminal} title="Incorpore no seu site (iframe)">
          <p>
            Para exibir a plataforma dentro do site que você já tem (WordPress, Wix,
            HTML puro…), cole este trecho onde quiser que ela apareça:
          </p>
          <Code>{`<iframe
  src="https://SEU-SITE.vercel.app"
  style="width:100%; height:100vh; border:0; border-radius:12px;"
  allow="clipboard-write; fullscreen"
  title="Escola de Teologia"
></iframe>`}</Code>
          <ul className="list-disc space-y-2.5 pl-5">
            <li>No <strong>WordPress</strong>: adicione um bloco “HTML personalizado” com esse código.</li>
            <li>No <strong>Wix</strong>: use o elemento “Incorporar código / iframe”.</li>
            <li>Prefira também um <strong>domínio próprio</strong> (ex.: <code className="text-gold-300">cursos.seusite.com.br</code>): a Vercel configura de graça em Settings → Domains.</li>
          </ul>
          <p>
            Dúvidas sobre qualquer etapa? A página de integrações do painel
            administrativo resume o estado de cada serviço em tempo real.
          </p>
        </Step>

        <Reveal>
          <div className="grain relative overflow-hidden rounded-3xl border border-gold-500/25 bg-gradient-to-br from-ink-900 to-ink-950 p-10 text-center">
            <Cloud className="mx-auto size-10 text-gold-400" />
            <h2 className="mt-5 font-display text-3xl font-semibold text-ivory-50">
              Tudo certo? Sua escola está no ar.
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-ivory-300/70">
              Cadastre o primeiro curso real, compartilhe o link e acompanhe as
              matrículas entrando pelo painel administrativo.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link href="/admin" className="btn-gold">
                Ir para o painel <ArrowRight className="size-4" />
              </Link>
              <Link href="/cursos" className="btn-ghost">Ver catálogo</Link>
            </div>
          </div>
        </Reveal>
      </div>

      <Footer />
    </main>
  );
}
