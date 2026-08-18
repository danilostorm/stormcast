import { getSiteSettings } from "../../lib/site-settings";
import Link from "next/link";
export default async function Privacy() {
  const settings = await getSiteSettings();
  return (
    <main className="legal-page">
      <Link href="/">← Voltar</Link>
      <h1>Política de privacidade</h1>
      <div>{settings.privacy_content}</div>
    </main>
  );
}
