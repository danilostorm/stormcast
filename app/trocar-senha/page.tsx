import { requireUser } from "../../lib/auth";
import PasswordChangeClient from "./PasswordChangeClient";
export default async function PasswordChangePage() {
  const user = await requireUser("/trocar-senha");
  return <PasswordChangeClient name={user.name} />;
}
