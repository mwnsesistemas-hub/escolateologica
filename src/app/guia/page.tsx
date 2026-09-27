import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function GuidePage() {
  const user = await getSessionUser().catch(() => null);
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/painel");
  redirect("/admin");
}
