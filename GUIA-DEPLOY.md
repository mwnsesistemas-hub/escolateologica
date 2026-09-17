# Guia de publicação — Plataforma de Cursos de Teologia (Lumen)

Este guia também está disponível dentro da plataforma, na página **`/guia`**, com visual amigável.

## Visão geral do que você vai fazer

| Etapa | Ferramenta | Custo |
|---|---|---|
| 1. Guardar o código | GitHub | Grátis |
| 2. Banco de dados | Supabase | Grátis (plano Free) |
| 3. Colocar o site no ar | Vercel | Grátis (plano Hobby) |
| 4. Cobranças (PIX, boleto, cartão) | Asaas | Tarifa por transação |
| 5. Mensagens de WhatsApp | Meta Cloud API | Grátis até o limite da Meta |

---

## 1. GitHub

1. Crie uma conta em <https://github.com>.
2. Crie um repositório novo chamado `escola-de-teologia`.
3. Clique em **uploading an existing file** e arraste **todos** os arquivos e pastas do projeto (exceto o arquivo `.env`).
4. Clique em **Commit changes**.

> Dica: se preferir, use o aplicativo **GitHub Desktop** — ele simplifica enviar novas versões depois.

## 2. Supabase (banco de dados)

1. Crie a conta em <https://supabase.com> (entre com o GitHub).
2. **New project** → nome `lumen`, senha forte (anote!), região São Paulo.
3. Abra **SQL Editor → New query**, cole todo o conteúdo do arquivo **`supabase-setup.sql`** (na raiz deste projeto) e clique em **Run**. Todas as tabelas serão criadas de uma vez.
4. Copie a URL de conexão em **Settings → Database → Connection string → URI** e substitua `[YOUR-PASSWORD]` pela senha anotada. Esse é o valor da variável `DATABASE_URL`.

## 3. Vercel (publicação)

1. Crie a conta em <https://vercel.com> entrando com o GitHub.
2. **Add New… → Project → Import** no repositório `escola-de-teologia`.
3. Em **Environment Variables**, adicione:

```
DATABASE_URL = (a URL do Supabase do passo 2)
AUTH_SECRET  = (uma senha longa que você inventar)
```

4. Clique em **Deploy**. Em ~2 minutos seu site estará no ar em algo como `https://escola-de-teologia.vercel.app`.
5. Toda alteração enviada ao GitHub republica o site automaticamente.

## 4. Primeiro acesso

A plataforma semeia automaticamente os dados de demonstração na primeira visita:

- **Administrador:** `admin@lumen.app` / `admin123`
- **Aluno:** `aluna@lumen.app` / `aluno123`

Painel administrativo: `https://SEU-SITE/admin`. Troque essas senhas antes de divulgar.

## 5. Asaas (cobranças)

Sem chave, a plataforma roda em **modo demonstração** (simula o PIX e a confirmação). Para produção:

1. Crie a conta em <https://www.asaas.com> e gere a chave em **Integrações → API**.
2. Adicione na Vercel (**Settings → Environment Variables**) e faça **Redeploy**:

```
ASAAS_API_KEY = $aact_sua-chave
ASAAS_BASE_URL = https://api-sandbox.asaas.com/v3   # testes
               # produção: https://api.asaas.com/v3
ASAAS_WEBHOOK_TOKEN = um-segredo-qualquer
```

3. No painel do Asaas, cadastre o webhook apontando para `https://SEU-SITE.vercel.app/api/webhooks/asaas` com o mesmo token, marcando eventos de pagamento.

Pronto: PIX pago → matrícula liberada automaticamente.

## 6. Meta (WhatsApp Cloud API)

1. Crie um app tipo **Empresas** em <https://developers.facebook.com> e adicione o produto **WhatsApp**.
2. Copie o **token de acesso** e o **ID do número de telefone**.
3. Adicione na Vercel + Redeploy:

```
META_WA_TOKEN = EAA...
META_WA_PHONE_ID = 123456789012345
META_WA_DEFAULT_TO = 5511999999999   # opcional
```

4. Para produção: use **token permanente** (usuário do sistema) e **templates aprovados** no Gerenciador do WhatsApp, pois mensagens de texto livre só chegam dentro da janela de 24h.

Há um painel de teste em **`/admin/integracoes`** dentro da plataforma.

## 7. Incorporar no seu site (iframe)

```html
<iframe
  src="https://SEU-SITE.vercel.app"
  style="width:100%; height:100vh; border:0; border-radius:12px;"
  allow="clipboard-write; fullscreen"
  title="Escola de Teologia"
></iframe>
```

- **WordPress:** bloco “HTML personalizado”.
- **Wix:** elemento “Incorporar código”.
- Recomendado: configurar um domínio próprio na Vercel (Settings → Domains), ex.: `cursos.seusite.com.br`.

---

## Desenvolvimento local (opcional, para técnicos)

```bash
npm install
cp .env.example .env        # preencha DATABASE_URL e AUTH_SECRET
npx drizzle-kit push        # cria as tabelas no banco local
npm run dev                 # http://localhost:3000
```
