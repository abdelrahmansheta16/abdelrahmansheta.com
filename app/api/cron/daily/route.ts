/**
 * GET|POST /api/cron/daily — the one scheduled job (vercel.json, 03:00 UTC).
 *
 * Four things, in order: delete everything past its retention date, close voice sessions whose webhook
 * never arrived (so their reservation goes back to the day budget), touch the database so a Supabase
 * Free project does not pause after 7 idle days, and roll month-to-date spend into the $27 / $30 rules.
 * Then one digest e-mail. Everything it does is idempotent, so a double-fire is harmless.
 */
import { dbOrNull } from "@/app/api/_lib/db";
import {
  applySpendRules,
  closeStaleSessions,
  keepAliveTouch,
  monthToDateSpend,
  purgeExpired,
  canSendEmail,
} from "@/lib/db/budgets";
import { send } from "@/app/api/_lib/email";
import { fail, json, safeEqual } from "@/app/api/_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  return run(request);
}

export async function POST(request: Request): Promise<Response> {
  return run(request);
}

async function run(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET ?? "";
  const presented = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (secret === "" || !safeEqual(presented, secret)) return fail("unauthorized", 401);

  const db = dbOrNull();
  if (db === null) return fail("unavailable", 503);

  const purged = await purgeExpired(db);
  const closed = await closeStaleSessions(db);
  await keepAliveTouch(db);

  // null means the ledger could not be read. Passing 0 in that case would tell apply_spend_rules to
  // CLEAR both overrides, so a transient error would lift a cap that was correctly in place. Skip
  // the rules instead and leave whatever is already set; the digest reports it so it is not silent.
  const monthToDate = await monthToDateSpend(db);
  const rule = monthToDate === null ? "unknown" : await applySpendRules(db, monthToDate);

  const report = {
    ok: true,
    purged_rows: purged,
    closed_sessions: closed,
    month_to_date_usd: monthToDate === null ? null : Math.round(monthToDate * 100) / 100,
    spend_rule: rule,
  };

  // "unreadable" is louder than "$0.00" — a digest that says zero when the ledger is down reads
  // like a quiet month rather than a broken control.
  const mtd = report.month_to_date_usd === null ? "unreadable" : `$${report.month_to_date_usd.toFixed(2)}`;

  const owner = process.env.OWNER_EMAIL ?? "";
  if (owner !== "" && (await canSendEmail(db, "digest"))) {
    await send({
      to: owner,
      subject: `abdelrahmansheta.com daily digest — ${mtd} MTD (${rule})`,
      text: [
        "Daily job for abdelrahmansheta.com.",
        "",
        `Rows purged:        ${String(purged)}`,
        `Stale sessions:     ${String(closed)}`,
        `Month-to-date:      ${mtd}`,
        `Spend rule applied: ${rule}`,
        "",
        rule === "voice_off"
          ? "Voice is OFF for the rest of the month. Text chat continues."
          : rule === "capped_540"
            ? "Daily voice cap reduced to 9 minutes."
            : "Caps are at their normal values.",
      ].join("\n"),
    });
  }

  return json(report);
}
