import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth";
import { AuthPage } from "../login/page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Criar conta", robots: { index: false, follow: false } };

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "admin" ? "/admin" : "/app");
  return <AuthPage mode="register" />;
}
