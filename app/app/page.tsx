import StudioApp from "../studio/StudioApp";
import { requireUser } from "../../lib/auth";
import { getSiteSettings } from "../../lib/site-settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meu estúdio", robots: { index: false, follow: false } };

export default async function AppPage() {
  const user = await requireUser("/app");
  const settings = await getSiteSettings();
  return <StudioApp user={user} features={{vertical:settings.feature_vertical!=="0",captions:settings.feature_captions!=="0",brandkit:settings.feature_brandkit!=="0",payments:settings.feature_payments==="1"}} />;
}
