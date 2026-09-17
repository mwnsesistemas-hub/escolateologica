# Lumen — Plataforma de Cursos de Teologia

Plataforma educacional completa para venda e consumo de cursos de teologia:

- **Catálogo público** com páginas de curso, currículo e prévia de aulas gratuitas
- **Área do aluno** com player de vídeo, progresso aula a aula e certificados
- **Painel administrativo** para criar cursos, módulos e aulas, acompanhar alunos e receita
- **Cobranças via Asaas** (PIX, boleto, cartão) com webhook de confirmação automática
- **WhatsApp via Meta Cloud API** com notificações de matrícula
- **Modo demonstração integrado**: sem as chaves de API, pagamentos são simulados e mensagens registradas em log

## Stack

Next.js (App Router) · React 19 · Tailwind CSS 4 · Drizzle ORM · PostgreSQL (Supabase) · Vercel

## Comece aqui

Leia o **[GUIA-DEPLOY.md](./GUIA-DEPLOY.md)** — passo a passo completo para publicar
no GitHub + Supabase + Vercel sem conhecimento técnico.
A mesma página existe dentro da aplicação em **`/guia`**.

## Desenvolvimento local

```bash
npm install
cp .env.example .env     # configure DATABASE_URL e AUTH_SECRET
npx drizzle-kit push     # cria/ajusta as tabelas
npm run dev
```

Na primeira visita, o banco é semeado automaticamente com 6 cursos de
demonstração, um administrador (`admin@lumen.app` / `admin123`) e um aluno
(`aluna@lumen.app` / `aluno123`).

## Estrutura

```
src/
  app/                  # páginas (site público, aluno, admin) e API routes
  components/           # componentes de UI
  db/                   # schema Drizzle + seed
  lib/                  # autenticação, integrações (Asaas/Meta), pagamentos
supabase-setup.sql      # SQL pronto para criar as tabelas no Supabase
```

## Variáveis de ambiente

Veja `.env.example` — todas comentadas em português.
