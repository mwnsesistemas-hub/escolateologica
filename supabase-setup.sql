-- ═══════════════════════════════════════════════════════════════════
-- LUMEN — Escola de Teologia
-- Script de criação das tabelas no Supabase
--
-- Como usar:
--   1. Abra seu projeto no Supabase (supabase.com)
--   2. Clique em "SQL Editor" no menu lateral
--   3. Clique em "New query"
--   4. Copie e cole TODO o conteúdo deste arquivo
--   5. Clique no botão verde "Run"
--   6. Aguarde a mensagem "Success. No rows returned"
-- ═══════════════════════════════════════════════════════════════════

-- Remove tabelas antigas se existirem (seguro de rodar mais de uma vez)
DROP TABLE IF EXISTS "progress" CASCADE;
DROP TABLE IF EXISTS "payments" CASCADE;
DROP TABLE IF EXISTS "enrollments" CASCADE;
DROP TABLE IF EXISTS "lessons" CASCADE;
DROP TABLE IF EXISTS "modules" CASCADE;
DROP TABLE IF EXISTS "courses" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;
DROP TABLE IF EXISTS "settings" CASCADE;
DROP TABLE IF EXISTS "exam_attempts" CASCADE;
DROP TABLE IF EXISTS "exam_questions" CASCADE;
DROP TABLE IF EXISTS "exams" CASCADE;
DROP TABLE IF EXISTS "attachments" CASCADE;

-- ── Configurações ───────────────────────────────────────────────────
CREATE TABLE "settings" (
  "key"        text PRIMARY KEY,
  "value"      text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- ── Usuários ────────────────────────────────────────────────────────
CREATE TABLE "users" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name"          text NOT NULL,
  "email"         text NOT NULL,
  "password_hash" text NOT NULL,
  "role"          text DEFAULT 'student' NOT NULL,
  "phone"         text,
  "created_at"    timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "users_email_unique" UNIQUE("email")
);

-- ── Cursos ──────────────────────────────────────────────────────────
CREATE TABLE "courses" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title"       text NOT NULL,
  "slug"        text NOT NULL,
  "subtitle"    text,
  "description" text DEFAULT '' NOT NULL,
  "category"    text DEFAULT 'Geral' NOT NULL,
  "level"       text DEFAULT 'Iniciante' NOT NULL,
  "price_cents" integer DEFAULT 0 NOT NULL,
  "cover_url"   text,
  "status"      text DEFAULT 'draft' NOT NULL,
  "created_at"  timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "courses_slug_unique" UNIQUE("slug")
);

-- ── Módulos ─────────────────────────────────────────────────────────
CREATE TABLE "modules" (
  "id"        uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "course_id" uuid NOT NULL REFERENCES "courses"("id") ON DELETE CASCADE,
  "title"     text NOT NULL,
  "position"  integer DEFAULT 0 NOT NULL
);

-- ── Aulas ───────────────────────────────────────────────────────────
CREATE TABLE "lessons" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "module_id"    uuid NOT NULL REFERENCES "modules"("id") ON DELETE CASCADE,
  "title"        text NOT NULL,
  "description"  text DEFAULT '' NOT NULL,
  "video_url"    text,
  "duration_min" integer DEFAULT 0 NOT NULL,
  "position"     integer DEFAULT 0 NOT NULL,
  "is_free"      boolean DEFAULT false NOT NULL
);

-- ── Matrículas ──────────────────────────────────────────────────────
CREATE TABLE "enrollments" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"    uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "course_id"  uuid NOT NULL REFERENCES "courses"("id") ON DELETE CASCADE,
  "status"     text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "enrollments_user_course_unique" UNIQUE("user_id", "course_id")
);

-- ── Pagamentos ──────────────────────────────────────────────────────
CREATE TABLE "payments" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"           uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "course_id"         uuid NOT NULL REFERENCES "courses"("id") ON DELETE CASCADE,
  "amount_cents"      integer DEFAULT 0 NOT NULL,
  "status"            text DEFAULT 'pending' NOT NULL,
  "method"            text DEFAULT 'demo' NOT NULL,
  "asaas_payment_id"  text,
  "created_at"        timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"        timestamp with time zone DEFAULT now() NOT NULL
);

-- ── Progresso das aulas ─────────────────────────────────────────────
CREATE TABLE "progress" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"      uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "lesson_id"    uuid NOT NULL REFERENCES "lessons"("id") ON DELETE CASCADE,
  "completed_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "progress_user_lesson_unique" UNIQUE("user_id", "lesson_id")
);

-- ── Índices para performance ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "idx_modules_course_id"     ON "modules"("course_id");
CREATE INDEX IF NOT EXISTS "idx_lessons_module_id"     ON "lessons"("module_id");
CREATE INDEX IF NOT EXISTS "idx_enrollments_user_id"   ON "enrollments"("user_id");
CREATE INDEX IF NOT EXISTS "idx_enrollments_course_id" ON "enrollments"("course_id");
CREATE INDEX IF NOT EXISTS "idx_payments_user_id"      ON "payments"("user_id");
CREATE INDEX IF NOT EXISTS "idx_payments_asaas_id"     ON "payments"("asaas_payment_id");
CREATE INDEX IF NOT EXISTS "idx_progress_user_id"      ON "progress"("user_id");
CREATE INDEX IF NOT EXISTS "idx_progress_lesson_id"    ON "progress"("lesson_id");

-- ── Anexos de aula ──────────────────────────────────────────────────
CREATE TABLE "attachments" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "lesson_id"  uuid NOT NULL REFERENCES "lessons"("id") ON DELETE CASCADE,
  "name"       text NOT NULL,
  "url"        text NOT NULL,
  "file_type"  text DEFAULT 'pdf' NOT NULL,
  "position"   integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- ── Provas ──────────────────────────────────────────────────────────
CREATE TABLE "exams" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "module_id"      uuid NOT NULL REFERENCES "modules"("id") ON DELETE CASCADE,
  "title"          text NOT NULL,
  "description"    text DEFAULT '' NOT NULL,
  "time_limit_min" integer DEFAULT 30 NOT NULL,
  "max_attempts"   integer DEFAULT 3 NOT NULL,
  "passing_score"  integer DEFAULT 70 NOT NULL,
  "position"       integer DEFAULT 0 NOT NULL,
  "created_at"     timestamp with time zone DEFAULT now() NOT NULL
);

-- ── Questões ────────────────────────────────────────────────────────
CREATE TABLE "exam_questions" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "exam_id"        uuid NOT NULL REFERENCES "exams"("id") ON DELETE CASCADE,
  "question"       text NOT NULL,
  "option_a"       text NOT NULL,
  "option_b"       text NOT NULL,
  "option_c"       text NOT NULL,
  "option_d"       text NOT NULL,
  "correct_answer" text NOT NULL,
  "explanation"    text DEFAULT '' NOT NULL,
  "position"       integer DEFAULT 0 NOT NULL
);

-- ── Tentativas ──────────────────────────────────────────────────────
CREATE TABLE "exam_attempts" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"         uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "exam_id"         uuid NOT NULL REFERENCES "exams"("id") ON DELETE CASCADE,
  "answers"         text DEFAULT '{}' NOT NULL,
  "score"           integer DEFAULT 0 NOT NULL,
  "total_correct"   integer DEFAULT 0 NOT NULL,
  "total_questions"  integer DEFAULT 0 NOT NULL,
  "passed"          boolean DEFAULT false NOT NULL,
  "started_at"      timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at"     timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "idx_attachments_lesson_id"   ON "attachments"("lesson_id");
CREATE INDEX IF NOT EXISTS "idx_exams_module_id"         ON "exams"("module_id");
CREATE INDEX IF NOT EXISTS "idx_exam_questions_exam_id"  ON "exam_questions"("exam_id");
CREATE INDEX IF NOT EXISTS "idx_exam_attempts_user_id"   ON "exam_attempts"("user_id");
CREATE INDEX IF NOT EXISTS "idx_exam_attempts_exam_id"   ON "exam_attempts"("exam_id");

-- ═══════════════════════════════════════════════════════════════════
-- Fim do script. Se chegou até aqui sem erros, as tabelas foram
-- criadas com sucesso. Agora faça o deploy na Vercel.
-- ═══════════════════════════════════════════════════════════════════
