import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ─── Usuários (administradores e alunos) ────────────────────────────────────
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "student"] })
    .notNull()
    .default("student"),
  phone: text("phone"), // número WhatsApp, ex.: 5511999999999
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Cursos ─────────────────────────────────────────────────────────────────
export const courses = pgTable("courses", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  subtitle: text("subtitle"),
  description: text("description").notNull().default(""),
  category: text("category").notNull().default("Geral"),
  level: text("level", {
    enum: ["Iniciante", "Intermediário", "Avançado"],
  })
    .notNull()
    .default("Iniciante"),
  priceCents: integer("price_cents").notNull().default(0),
  coverUrl: text("cover_url"),
  status: text("status", { enum: ["draft", "published"] })
    .notNull()
    .default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Módulos de cada curso ──────────────────────────────────────────────────
export const modules = pgTable("modules", {
  id: uuid("id").defaultRandom().primaryKey(),
  courseId: uuid("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  position: integer("position").notNull().default(0),
});

// ─── Aulas de cada módulo ───────────────────────────────────────────────────
export const lessons = pgTable("lessons", {
  id: uuid("id").defaultRandom().primaryKey(),
  moduleId: uuid("module_id")
    .notNull()
    .references(() => modules.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  videoUrl: text("video_url"), // YouTube (watch/embed) ou MP4 direto
  durationMin: integer("duration_min").notNull().default(0),
  position: integer("position").notNull().default(0),
  isFree: boolean("is_free").notNull().default(false),
});

// ─── Matrículas ─────────────────────────────────────────────────────────────
export const enrollments = pgTable(
  "enrollments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["active"] })
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("enrollments_user_course_unique").on(t.userId, t.courseId)]
);

// ─── Progresso das aulas ────────────────────────────────────────────────────
export const progress = pgTable(
  "progress",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    completedAt: timestamp("completed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("progress_user_lesson_unique").on(t.userId, t.lessonId)]
);

// ─── Pagamentos (Asaas / demonstração) ──────────────────────────────────────
export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  courseId: uuid("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),
  amountCents: integer("amount_cents").notNull().default(0),
  status: text("status", { enum: ["pending", "confirmed", "failed"] })
    .notNull()
    .default("pending"),
  method: text("method").notNull().default("demo"), // pix | boleto | credit_card | demo | free
  asaasPaymentId: text("asaas_payment_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Tipos inferidos
export type User = typeof users.$inferSelect;
export type Course = typeof courses.$inferSelect;
export type Module = typeof modules.$inferSelect;
export type Lesson = typeof lessons.$inferSelect;
export type Enrollment = typeof enrollments.$inferSelect;
export type Payment = typeof payments.$inferSelect;
