import "dotenv/config";
import { db } from "./index";
import {
  users,
  courses,
  modules,
  lessons,
  enrollments,
  progress,
  payments,
} from "./schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "../lib/password";
import { slugify } from "../lib/format";

const SAMPLE_VIDEOS = [
  "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
];

type LessonSeed = { title: string; min: number; free?: boolean; desc?: string };
type ModuleSeed = { title: string; lessons: LessonSeed[] };
type CourseSeed = {
  title: string;
  subtitle: string;
  category: string;
  level: "Iniciante" | "Intermediário" | "Avançado";
  price: number; // em reais
  cover: string;
  description: string;
  modules: ModuleSeed[];
};

const COURSES: CourseSeed[] = [
  {
    title: "Teologia Sistemática I — Fundamentos da Fé",
    subtitle: "As grandes doutrinas das Escrituras com profundidade e clareza",
    category: "Teologia Sistemática",
    level: "Intermediário",
    price: 297,
    cover:
      "https://images.pexels.com/photos/7790776/pexels-photo-7790776.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
    description:
      "Um mergulho nas doutrinas fundamentais da fé cristã: revelação, Trindade, cristologia, pneumatologia e soteriologia. Cada aula combina rigor acadêmico com aplicação pastoral, formando uma base sólida para o estudo continuado das Escrituras.\n\nVocê aprenderá a ler os credos históricos à luz do texto bíblico, a articular a fé com coerência e a responder às objeções clássicas com mansidão e fundamentação.",
    modules: [
      {
        title: "Prolegômenos — Por onde começar",
        lessons: [
          { title: "O que é Teologia Sistemática", min: 24, free: true, desc: "Uma visão panorâmica da disciplina: definição, método e propósito do estudo sistemático das Escrituras." },
          { title: "Revelação geral e revelação especial", min: 31, desc: "Como Deus se dá a conhecer na criação, na consciência humana e, suprema e finalmente, em Cristo e na Escritura." },
          { title: "A inspiração e autoridade da Bíblia", min: 28, desc: "Teopneustia, inerrância, canonicidade: por que a Escritura é a regra infalível de fé e prática." },
        ],
      },
      {
        title: "A Doutrina de Deus",
        lessons: [
          { title: "Existência e atributos de Deus", min: 35, desc: "Os atributos incomunicáveis e comunicáveis, e como eles moldam a adoração e a vida cristã." },
          { title: "A Santíssima Trindade", min: 42, desc: "Um só Deus em três Pessoas: desenvolvimento bíblico, formulação nicênica e implicações práticas." },
          { title: "Os decretos e a providência divina", min: 33, desc: "Soberania, presciência e governo divino sobre a história e a vida dos seus filhos." },
        ],
      },
      {
        title: "Cristologia",
        lessons: [
          { title: "A pessoa de Cristo — verdadeiro Deus e verdadeiro homem", min: 38, desc: "A união hipostática e as heresias cristológicas que a Igreja refutou nos primeiros séculos." },
          { title: "A obra de Cristo — profeta, sacerdote e rei", min: 36, desc: "O munus triplex e a consumação da redenção na cruz e na ressurreição." },
        ],
      },
    ],
  },
  {
    title: "Hermenêutica Bíblica",
    subtitle: "A arte e a ciência de interpretar as Escrituras",
    category: "Interpretação Bíblica",
    level: "Intermediário",
    price: 197,
    cover:
      "https://images.pexels.com/photos/39222072/pexels-photo-39222072.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
    description:
      "Aprenda a interpretar a Bíblia com responsabilidade: contexto histórico, gêneros literários, análise gramatical e a jornada do texto antigo até a aplicação contemporânea.\n\nO curso oferece um método passo a passo, com exercícios práticos em textos do Antigo e do Novo Testamento.",
    modules: [
      {
        title: "Fundamentos da interpretação",
        lessons: [
          { title: "Por que interpretar? A necessidade da hermenêutica", min: 22, free: true, desc: "Distância histórica, cultural e linguística: por que todo leitor é também um intérprete." },
          { title: "Uma breve história da interpretação bíblica", min: 29, desc: "Da exegese rabínica à Reforma, da crítica histórica às abordagens atuais." },
          { title: "Princípios gerais de interpretação", min: 34, desc: "Contexto literário, analogia da fé e a centralidade de Cristo na leitura de toda a Escritura." },
        ],
      },
      {
        title: "Gêneros literários da Bíblia",
        lessons: [
          { title: "Narrativa e Lei no Antigo Testamento", min: 37, desc: "Como ler os relatos históricos e os códigos legais à luz da aliança." },
          { title: "Poesia, Sabedoria e Profecia", min: 33, desc: "Paralelismo hebraico, gênero sapiencial e a oráculos proféticos em seu contexto." },
          { title: "Evangelhos, Cartas e Apocalipse", min: 40, desc: "As particularidades dos gêneros neotestamentários e suas implicações hermenêuticas." },
        ],
      },
    ],
  },
  {
    title: "História da Igreja I — A Igreja Primitiva",
    subtitle: "Dos apóstolos ao Concílio de Calcedônia (30–451 d.C.)",
    category: "História da Igreja",
    level: "Iniciante",
    price: 147,
    cover:
      "https://images.pexels.com/photos/37542465/pexels-photo-37542465.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
    description:
      "Percorra os primeiros cinco séculos do cristianismo: a expansão da fé no Império Romano, as perseguições, os apologistas, os grandes concílios e os pais da Igreja.\n\nUma jornada que ilumina as raízes da nossa fé e ajuda a compreender o cristianismo contemporâneo.",
    modules: [
      {
        title: "A expansão do cristianismo",
        lessons: [
          { title: "O mundo greco-romano do século I", min: 26, free: true, desc: "O cenário político, religioso e cultural em que a Igreja nasceu." },
          { title: "Perseguição e martírio", min: 30, desc: "De Nero a Diocleciano: o sangue dos mártires como semente da Igreja." },
          { title: "Constantino e a paz da Igreja", min: 32, desc: "O Édito de Milão, o sínodo de Arles e os desafios da nova relação com o império." },
        ],
      },
      {
        title: "Doutrina e concílios",
        lessons: [
          { title: "Os pais apostólicos e os apologistas", min: 35, desc: "Inácio, Policarpo, Justino Mártir e a defesa racional da fé." },
          { title: "Niceia e a crise ariana", min: 39, desc: "Como a Igreja confessou que o Filho é 'homousios' — da mesma substância do Pai." },
          { title: "Calcedônia e a definição cristológica", min: 36, desc: "Duas naturezas, uma única pessoa: o auge da reflexão cristológica patrística." },
        ],
      },
    ],
  },
  {
    title: "Grego Bíblico (Koiné) — Nível Iniciante",
    subtitle: "Leia o Novo Testamento no idioma original",
    category: "Línguas Bíblicas",
    level: "Iniciante",
    price: 497,
    cover:
      "https://images.pexels.com/photos/31880176/pexels-photo-31880176.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
    description:
      "Do alfabeto à leitura de textos completos do Novo Testamento. Um método gradual e prático para você dominar o vocabulario e a gramática do grego koiné.\n\nInclui exercícios de tradução, ferramentas de estudo e indicação de léxicos para o aprofundamento exegético.",
    modules: [
      {
        title: "Primeiros passos",
        lessons: [
          { title: "O alfabeto grego e a pronúncia", min: 25, free: true, desc: "As 24 letras, ditongos e acentuação — a porta de entrada para a leitura." },
          { title: "Substantivos: primeira e segunda declinações", min: 42, desc: "Caso nominativo, genitivo, dativo e acusativo e suas funções sintáticas." },
          { title: "O verbo grego: presente indicativo ativo", min: 38, desc: "Conjugações, pessoas e a ideia de aspecto verbal no koiné." },
        ],
      },
      {
        title: "Leitura assistida",
        lessons: [
          { title: "Traduzindo João 1.1–5", min: 45, desc: "Análise palavra por palavra do prólogo joanino no texto original." },
          { title: "Ferramentas do exegeta", min: 27, desc: "Léxicos, concordâncias, Bíblias interlineares e softwares de estudo." },
        ],
      },
    ],
  },
  {
    title: "Homilética — A Arte da Pregação",
    subtitle: "Do texto bíblico ao sermão expositivo",
    category: "Ministério",
    level: "Avançado",
    price: 247,
    cover:
      "https://images.pexels.com/photos/34084875/pexels-photo-34084875.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
    description:
      "Formação completa para pregadores: exegese homilética, estrutura do sermão, introdução e conclusão, ilustrações, voz, gestos e a espiritualidade do pregador.\n\nCom avaliação prática de sermões e modelos de esboços expositivos para diferentes gêneros bíblicos.",
    modules: [
      {
        title: "A fundação da pregação",
        lessons: [
          { title: "O que é pregação expositiva", min: 28, free: true, desc: "Por que o texto deve governar o sermão — e como evitar a eisegese." },
          { title: "Do estudo ao púlpito: o processo homilético", min: 36, desc: "Exegese, idea homilética, estrutura e internalização da mensagem." },
          { title: "A vida devocional do pregador", min: 24, desc: "O caráter e a comunhão como sustentáculo do ministério da Palavra." },
        ],
      },
      {
        title: "A construção do sermão",
        lessons: [
          { title: "Proposição, divisões e transições", min: 41, desc: "A espinha dorsal de um sermão claro, fiel e memorável." },
          { title: "Ilustração e aplicação", min: 33, desc: "Como conectar a verdade eterna à vida concreta dos ouvintes." },
          { title: "Voz, gestos e presença", min: 29, desc: "A comunicação não verbal a serviço da mensagem." },
        ],
      },
    ],
  },
  {
    title: "Aconselhamento Bíblico",
    subtitle: "Cuidando de pessoas com a Palavra e com sabedoria",
    category: "Aconselhamento",
    level: "Iniciante",
    price: 0,
    cover:
      "https://images.pexels.com/photos/19369819/pexels-photo-19369819.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
    description:
      "Curso gratuito de introdução ao aconselhamento bíblico: fundamentos teológicos do cuidado pastoral, a escuta ativa, e como aplicar as Escrituras às lutas comuns da vida.\n\nIdeal para líderes, pastores e todos que desejam servir pessoas com a verdade em amor.",
    modules: [
      {
        title: "Fundamentos",
        lessons: [
          { title: "O que é aconselhamento bíblico", min: 23, free: true, desc: "Definição, pressupostos e a suficiência das Escrituras no cuidado de almas." },
          { title: "A arte da escuta", min: 27, free: true, desc: "Ouvir para compreender: perguntas sábias, empatia e discernimento espiritual." },
          { title: "Arautos da esperança em meio à dor", min: 31, desc: "Luto, ansiedade e sofrimento à luz do evangelho." },
        ],
      },
      {
        title: "Temas práticos",
        lessons: [
          { title: "Casamento e família", min: 34, desc: "Aliança, perdão e comunicação no relacionamento conjugal." },
          { title: "Limites do aconselhamento e encaminhamento", min: 25, desc: "Quando buscar ajuda profissional e como trabalhar em rede." },
        ],
      },
    ],
  },
];

export async function seedDatabase() {
  // ── Usuários ────────────────────────────────────────────────
  const [admin] = await db
    .insert(users)
    .values({
      name: "Administrador Lumen",
      email: "admin@lumen.app",
      passwordHash: hashPassword("admin123"),
      role: "admin",
      phone: "5511999999999",
    })
    .onConflictDoNothing()
    .returning();

  const [student] = await db
    .insert(users)
    .values({
      name: "Maria Oliveira",
      email: "aluna@lumen.app",
      passwordHash: hashPassword("aluno123"),
      role: "student",
      phone: "5511988888888",
    })
    .onConflictDoNothing()
    .returning();

  const adminRow =
    admin ?? (await db.select().from(users).where(eq(users.email, "admin@lumen.app")).limit(1))[0];
  const studentRow =
    student ??
    (await db.select().from(users).where(eq(users.email, "aluna@lumen.app")).limit(1))[0];

  // ── Cursos ──────────────────────────────────────────────────
  let videoIndex = 0;
  for (const c of COURSES) {
    const slug = slugify(c.title);
    const [created] = await db
      .insert(courses)
      .values({
        title: c.title,
        slug,
        subtitle: c.subtitle,
        description: c.description,
        category: c.category,
        level: c.level,
        priceCents: Math.round(c.price * 100),
        coverUrl: c.cover,
        status: "published",
      })
      .onConflictDoNothing()
      .returning();

    const courseRow =
      created ?? (await db.select().from(courses).where(eq(courses.slug, slug)).limit(1))[0];
    if (!courseRow) continue;

    for (const [mi, m] of c.modules.entries()) {
      const existing = await db
        .select()
        .from(modules)
        .where(eq(modules.courseId, courseRow.id))
        .limit(1);
      // pula se o módulo já foi semeado antes
      const moduleExists = existing.some((x) => x.title === m.title);
      if (moduleExists) continue;

      const [moduleRow] = await db
        .insert(modules)
        .values({ courseId: courseRow.id, title: m.title, position: mi })
        .returning();

      for (const [li, l] of m.lessons.entries()) {
        await db.insert(lessons).values({
          moduleId: moduleRow.id,
          title: l.title,
          description: l.desc ?? "",
          durationMin: l.min,
          position: li,
          isFree: Boolean(l.free),
          videoUrl: l.free ? SAMPLE_VIDEOS[videoIndex++ % SAMPLE_VIDEOS.length] : null,
        });
      }
    }
  }

  // ── Matrícula e progresso de demonstração ───────────────────
  const freeCourse = (
    await db.select().from(courses).where(eq(courses.slug, slugify("Aconselhamento Bíblico"))).limit(1)
  )[0];

  if (studentRow && freeCourse) {
    await db
      .insert(enrollments)
      .values({ userId: studentRow.id, courseId: freeCourse.id })
      .onConflictDoNothing();

    await db
      .insert(payments)
      .values({
        userId: studentRow.id,
        courseId: freeCourse.id,
        amountCents: 0,
        status: "confirmed",
        method: "free",
      })
      .onConflictDoNothing();

    const freeCourseModules = await db
      .select()
      .from(modules)
      .where(eq(modules.courseId, freeCourse.id));
    if (freeCourseModules.length) {
      const firstLessons = await db
        .select()
        .from(lessons)
        .where(eq(lessons.moduleId, freeCourseModules[0].id));
      const first = firstLessons[0];
      if (first) {
        await db
          .insert(progress)
          .values({ userId: studentRow.id, lessonId: first.id })
          .onConflictDoNothing();
      }
    }
  }

  return { admin: Boolean(adminRow), student: Boolean(studentRow) };
}

/**
 * Semeadura de dados de demonstração DESATIVADA — a plataforma já usa
 * dados reais. A função continua existindo (vazia) para não quebrar as
 * páginas que ainda a chamam.
 */
export async function ensureSeeded(): Promise<void> {
  return;
}
