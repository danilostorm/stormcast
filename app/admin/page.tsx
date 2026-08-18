import { requireAdmin } from "../../lib/auth";
import AdminClient from "./AdminClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Administração", robots: { index: false, follow: false } };

export default async function AdminPage() {
  const admin = await requireAdmin("/admin");
  return <AdminClient admin={admin} />;
}
