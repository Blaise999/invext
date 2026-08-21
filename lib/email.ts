import { Resend } from "resend";

/**
 * Resend is fully wired. Set two variables and it sends:
 *
 *   RESEND_API_KEY=re_xxxxxxxx
 *   EMAIL_FROM="InveXt <security@yourdomain.com>"
 *
 * The From domain must be verified in the Resend dashboard, otherwise the
 * API accepts the call and the mail never lands. Until RESEND_API_KEY is set,
 * emails are logged to the server console instead — so you can run the whole
 * OTP flow locally without sending anything.
 */

const KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM || "InveXt <onboarding@resend.dev>";
const REPLY_TO = process.env.EMAIL_REPLY_TO;

const resend = KEY ? new Resend(KEY) : null;

type SendResult = { ok: true } | { ok: false; error: string };

async function send(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
  tag: string;
}): Promise<SendResult> {
  if (!resend) {
    console.warn(
      `\n[email:${opts.tag}] RESEND_API_KEY not set — not sending.\n  to: ${opts.to}\n  subject: ${opts.subject}\n${opts.text}\n`,
    );
    return { ok: true };
  }
  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      ...(REPLY_TO ? { replyTo: REPLY_TO } : {}),
      headers: { "X-Entity-Ref-ID": `${opts.tag}-${Date.now()}` },
    });
    if (error) {
      console.error(`[email:${opts.tag}]`, error);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    console.error(`[email:${opts.tag}]`, e);
    return { ok: false, error: "send_failed" };
  }
}

/* ---------------- shared shell ----------------
   Table-based, inline styles, no external CSS or web fonts — that is what
   survives Outlook and Gmail clipping. Dark background with a light fallback
   for clients that strip background colours.                              */

function shell(inner: string, preheader: string) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>InveXt</title>
</head>
<body style="margin:0;padding:0;background:#0b0b0d;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b0d;padding:36px 16px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#101013;border:1px solid #23232a;">
    <tr><td style="padding:26px 30px 0;">
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:19px;font-weight:800;letter-spacing:-0.5px;color:#f0eee9;text-transform:uppercase;">Inve<span style="color:#e8a33d;">X</span>t</div>
    </td></tr>
    ${inner}
    <tr><td style="padding:24px 30px 30px;border-top:1px solid #23232a;">
      <p style="margin:0 0 10px;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.6;color:#6d6c68;">
        Funding on InveXt is crypto only, and only through the deposit flow inside your account. We will never ask you to send funds by Zelle, wire to an individual, gift card, or to any address outside the app. We will never ask for this code by phone, text or email reply.
      </p>
      <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.6;color:#4d4c48;">
        Sent by InveXt &middot; United States &middot; This is a transactional security message.
      </p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

/* ---------------- OTP ---------------- */

export function otpEmail(code: string, purpose: "signup" | "login", minutes: number) {
  const heading =
    purpose === "signup" ? "Confirm your email" : "Confirm this sign-in";
  const line =
    purpose === "signup"
      ? "Enter this code to finish creating your InveXt account."
      : "Enter this code to finish signing in to InveXt.";

  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;

  const inner = `
    <tr><td style="padding:26px 30px 0;">
      <h1 style="margin:0 0 10px;font-family:Helvetica,Arial,sans-serif;font-size:24px;line-height:1.2;font-weight:800;color:#f0eee9;letter-spacing:-0.6px;">${heading}</h1>
      <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#b6b4ae;">${line}</p>
    </td></tr>
    <tr><td style="padding:24px 30px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#0b0b0d;border:1px solid #23232a;">
        <tr><td align="center" style="padding:22px 16px;">
          <div style="font-family:'SFMono-Regular',Consolas,monospace;font-size:36px;font-weight:700;letter-spacing:10px;color:#e8a33d;">${spaced}</div>
        </td></tr>
      </table>
      <p style="margin:14px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#8b8a85;">
        Expires in ${minutes} minutes. It can be used once.
      </p>
    </td></tr>
    <tr><td style="padding:22px 30px 26px;">
      <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#8b8a85;">
        Didn't request this? You can ignore this email &mdash; ${
          purpose === "signup"
            ? "no account will be created without the code."
            : "no one can sign in without it. If this keeps happening, change your password."
        }
      </p>
    </td></tr>`;

  const text = `${heading}

${line}

  ${code}

Expires in ${minutes} minutes and can be used once.

Didn't request this? Ignore this email.

Funding on InveXt is crypto only, and only through the deposit flow inside your account. We will never ask you to send funds by Zelle, wire to an individual, gift card, or to any address outside the app. We will never ask for this code by phone, text or email reply.`;

  return { html: shell(inner, `Your InveXt code is ${code}`), text };
}

export function sendOtpEmail(
  to: string,
  code: string,
  purpose: "signup" | "login",
  minutes: number,
) {
  const { html, text } = otpEmail(code, purpose, minutes);
  return send({
    to,
    subject: `${code} is your InveXt verification code`,
    html,
    text,
    tag: `otp-${purpose}`,
  });
}

/* ---------------- welcome ---------------- */

export function welcomeEmail(firstName: string, appUrl: string) {
  const inner = `
    <tr><td style="padding:26px 30px 0;">
      <h1 style="margin:0 0 12px;font-family:Helvetica,Arial,sans-serif;font-size:26px;line-height:1.15;font-weight:800;color:#f0eee9;letter-spacing:-0.7px;">Welcome, ${firstName}.</h1>
      <p style="margin:0 0 16px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#b6b4ae;">
        Your email is confirmed and your account is active. Before you look at anything else, three things worth knowing about how we work.
      </p>
    </td></tr>
    <tr><td style="padding:6px 30px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${[
          [
            "Seven of the companies we track trade. Two don't.",
            "SpaceX (Nasdaq: SPCX, listed June 2026), Tesla, NVIDIA, Apple, Amazon, Palantir and Rivian are public securities with real quotes. Grok, X and Starlink are not separate companies — they are divisions inside SPCX. Neuralink and The Boring Company are still private: no ticker, no continuous quote.",
          ],
          [
            "We show delayed data and say so.",
            "Quotes on the market page are end-of-day and delayed. They are for orientation inside the platform.",
          ],
          [
            "Funding is crypto only, inside the app.",
            "Deposits are accepted only through the official deposit flow in your account. We will never ask you to send funds by Zelle, wire to an individual, gift card, or to any address outside the app. Anyone claiming otherwise is not us.",
          ],
        ]
          .map(
            ([h, b]) => `
        <tr><td style="padding:0 0 18px;border-bottom:1px solid #23232a;">
          <p style="margin:0 0 6px;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:#f0eee9;">${h}</p>
          <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:13.5px;line-height:1.6;color:#8b8a85;">${b}</p>
        </td></tr>
        <tr><td style="height:18px;"></td></tr>`,
          )
          .join("")}
      </table>
    </td></tr>
    <tr><td style="padding:4px 30px 30px;">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr><td style="background:#e8a33d;">
          <a href="${appUrl}/dashboard" style="display:inline-block;padding:13px 26px;font-family:Helvetica,Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#0b0b0d;text-decoration:none;">Open your dashboard</a>
        </td></tr>
      </table>
    </td></tr>`;

  const text = `Welcome, ${firstName}.

Your email is confirmed and your account is active. Three things worth knowing:

1. Seven of the companies we track trade. Two don't.
   SpaceX (Nasdaq: SPCX, listed June 2026), Tesla, NVIDIA, Apple, Amazon,
   Palantir and Rivian are public securities with real quotes. Grok, X and
   Starlink are not separate companies — they are divisions inside SPCX.
   Neuralink and The Boring Company are still private: no ticker, no continuous
   quote.

2. We show delayed data and say so.
   Quotes are end-of-day and delayed. For orientation inside the platform.

3. Funding is crypto only, inside the app.
   Deposits are accepted only through the official deposit flow in your
   account. We will never ask you to send funds by Zelle, wire to an
   individual, gift card, or to any address outside the app.

Open your dashboard: ${appUrl}/dashboard`;

  return { html: shell(inner, "Your InveXt account is active"), text };
}

export function sendWelcomeEmail(to: string, firstName: string, appUrl: string) {
  const { html, text } = welcomeEmail(firstName, appUrl);
  return send({
    to,
    subject: "Your InveXt account is active",
    html,
    text,
    tag: "welcome",
  });
}