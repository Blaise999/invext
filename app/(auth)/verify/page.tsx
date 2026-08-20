import { redirect } from "next/navigation";
import { getChallenge, findPersonById } from "@/lib/auth-store";
import { getChallengeCookie, maskEmail, devOtpEnabled } from "@/lib/auth";
import VerifyForm from "./VerifyForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Both lookups now hit Postgres.
 *
 * Previously the challenge came from the JSON store — which on Vercel lives in
 * a per-instance /tmp, so it was usually absent here — and the user came from
 * `findUserById()` in that same store, which signup stopped writing to when
 * accounts moved to Supabase Auth. That second one missed every single time,
 * which is why /verify bounced to /login even when the OTP email had gone out.
 */
export default async function VerifyPage() {
  const id = await getChallengeCookie();
  if (!id) redirect("/login");

  const challenge = await getChallenge(id);
  if (!challenge || challenge.consumed_at || challenge.expires_at < Date.now()) {
    redirect("/login");
  }

  const person = await findPersonById(challenge.user_id);
  if (!person) redirect("/login");

  return (
    <VerifyForm
      masked={maskEmail(person.email)}
      purpose={challenge.purpose}
      expiresAt={challenge.expires_at}
      devBypass={devOtpEnabled()}
    />
  );
}
