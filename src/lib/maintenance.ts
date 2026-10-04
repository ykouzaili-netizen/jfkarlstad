import { ensureInstagramSchema, instagramConfigured, syncInstagram } from "./instagram.js";
import type { Env } from "../env.js";
import { mailConfigured, sendMail } from "./mail.js";

/** Städning varje timme. Håller databasen liten och uppfyller lagringstiderna i integritetspolicyn. */
export async function runMaintenance(env: Env): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')"),
    env.DB.prepare("DELETE FROM password_resets WHERE expires_at < datetime('now') OR used_at IS NOT NULL"),
    // Rate limit-rader vars tidsfönster (max 1 timme) har gått ut. Cron körs varje timme, så ingen rad
    // överlever längre än ca 2 timmar – väl inom löftet "inom 24 timmar" i integritetspolicyn.
    env.DB.prepare("DELETE FROM rate_limits WHERE window_start < ?").bind(now - 3600),
    // Formulärinskick raderas efter 12 månader (se integritetspolicyn)
    env.DB.prepare("DELETE FROM submissions WHERE created_at < datetime('now', '-12 months')"),
    // Ändringsloggen sparas i två år
    env.DB.prepare("DELETE FROM audit_log WHERE created_at < datetime('now', '-24 months')"),
    // Partnerstatistiken (bara totalsiffror) sparas i tre år
    env.DB.prepare("DELETE FROM stats_daily WHERE day < date('now', '-3 years')"),
    // Versionshistoriken: de 25 senaste versionerna av varje text räcker
    env.DB.prepare(
      `DELETE FROM setting_versions WHERE id IN (
         SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY key ORDER BY id DESC) AS rn FROM setting_versions) WHERE rn > 25
       )`,
    ),
  ]);
  await remindAboutWaitingMessages(env);
  await ensureInstagramSchema(env.DB);
  if (instagramConfigured(env)) await syncInstagram(env);
}

/**
 * Påminnelse till styrelsen om meddelanden som väntat på svar i mer än en vecka.
 * Ett samlat mejl, högst en gång per meddelande. Mejlet innehåller bara antal och ämnen –
 * inga namn eller e-postadresser.
 */
async function remindAboutWaitingMessages(env: Env): Promise<void> {
  if (!mailConfigured(env)) return;
  const { results } = await env.DB.prepare(
    "SELECT id, form, subject FROM submissions WHERE status = 'ny' AND reminded_at IS NULL AND created_at <= datetime('now', '-7 days') ORDER BY created_at LIMIT 50",
  ).all<{ id: number; form: string; subject: string | null }>();
  if (!results.length) return;
  const site = env.SITE_URL.replace(/\/$/, "");
  const lines = results.map((m) => `- ${m.subject || "(inget ämne)"}`);
  try {
    await sendMail(env, {
      to: [env.MAIL_TO || env.SMTP_USER!],
      subject: results.length === 1 ? "Påminnelse: ett meddelande väntar på svar" : `Påminnelse: ${results.length} meddelanden väntar på svar`,
      text: `Hej!\n\n${results.length === 1 ? "Ett meddelande" : `${results.length} meddelanden`} till föreningen har väntat på svar i mer än en vecka:\n\n${lines.join("\n")}\n\nLäs och svara i adminpanelen:\n${site}/admin/meddelanden\n\nMarkera meddelandet som hanterat när det är klart, så kommer det inga fler påminnelser om det.\n\n/ JFK:s webbplats`,
    });
    await env.DB.prepare(`UPDATE submissions SET reminded_at = datetime('now') WHERE id IN (${results.map(() => "?").join(",")})`)
      .bind(...results.map((r) => r.id))
      .run();
  } catch (err) {
    console.error("Kunde inte skicka påminnelsen", err instanceof Error ? err.message : err);
  }
}
