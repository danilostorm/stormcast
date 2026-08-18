import StudioApp from "../studio/StudioApp";
import { requireUser } from "../../lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meu estúdio", robots: { index: false, follow: false } };

export default async function AppPage() {
  const user = await requireUser("/app");
  return <StudioApp user={user} />;
}
