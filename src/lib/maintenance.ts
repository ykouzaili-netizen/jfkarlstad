import type { Env } from "../env.js";

/** Daglig städning. Håller databasen liten och uppfyller lagringstiderna i integritetspolicyn. */
export async function runMaintenance(env: Env): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')"),
    env.DB.prepare("DELETE FROM password_resets WHERE expires_at < datetime('now') OR used_at IS NOT NULL"),
    // Rate limit-rader äldre än ett dygn
    env.DB.prepare("DELETE FROM rate_limits WHERE window_start < ?").bind(now - 86400),
    // Formulärinskick raderas efter 12 månader (se integritetspolicyn)
    env.DB.prepare("DELETE FROM submissions WHERE created_at < datetime('now', '-12 months')"),
    // Ändringsloggen sparas i två år
    env.DB.prepare("DELETE FROM audit_log WHERE created_at < datetime('now', '-24 months')"),
  ]);
}
