import { db } from "@/db";
import { courses, enrollments, payments, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notifyEnrollmentWhatsApp } from "@/lib/integrations";

/**
 * Confirma um pagamento, ativa a matrícula do aluno e dispara a
 * notificação de WhatsApp (se a integração Meta estiver configurada).
 * É usado tanto pelo fluxo de demonstração quanto pelo webhook do Asaas.
 */
export async function confirmPaymentAndEnroll(paymentId: string) {
  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.id, paymentId))
    .limit(1);

  if (!payment) throw new Error("Pagamento não encontrado.");
  if (payment.status === "confirmed") return payment; // idempotente

  await db
    .update(payments)
    .set({ status: "confirmed", updatedAt: new Date() })
    .where(eq(payments.id, payment.id));

  // Ativa a matrícula (ignora se já existir)
  await db
    .insert(enrollments)
    .values({ userId: payment.userId, courseId: payment.courseId })
    .onConflictDoNothing();

  // Notifica via WhatsApp (boa prática: usar template aprovado em produção)
  const [student] = await db.select().from(users).where(eq(users.id, payment.userId)).limit(1);
  const [course] = await db.select().from(courses).where(eq(courses.id, payment.courseId)).limit(1);
  if (student && course) {
    await notifyEnrollmentWhatsApp({
      phone: student.phone,
      studentName: student.name.split(" ")[0],
      courseTitle: course.title,
    });
  }

  return payment;
}
