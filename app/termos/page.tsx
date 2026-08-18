import { getSiteSettings } from "../../lib/site-settings";
import Link from "next/link";
export default async function Terms() {
  const settings = await getSiteSettings();
  return (
    <main className="legal-page">
      <Link href="/">← Voltar</Link>
      <h1>Termos de uso</h1>
      <div>{settings.terms_content}</div>
    </main>
  );
}
