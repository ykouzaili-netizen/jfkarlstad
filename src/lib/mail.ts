import { connect, type Socket } from "cloudflare:sockets";
import type { Env } from "../env.js";

/**
 * Minimal SMTP-klient för Cloudflare Workers (TCP via cloudflare:sockets).
 * One.com: värd send.one.com, port 465 (SSL/TLS direkt) eller 587 (STARTTLS), inloggning krävs.
 * Port 25 är blockerad i Workers.
 *
 * E-post är en "best effort"-funktion: formulärinskick sparas alltid i databasen först,
 * så om e-posten misslyckas syns meddelandet ändå i adminpanelen.
 */

export interface MailMessage {
  to: string[];
  subject: string;
  text: string;
  replyTo?: string;
}

/**
 * Inställningarna med mellanslag och radbrytningar bortrensade – de följer lätt med när man klistrar in
 * i Cloudflare, och ett lösenord med ett osynligt mellanslag på slutet ger bara "fel lösenord".
 */
export interface MailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  to: string;
  implicitTls: boolean;
}

export function mailConfig(env: Env): MailConfig | null {
  const host = (env.SMTP_HOST ?? "").trim();
  const user = (env.SMTP_USER ?? "").trim();
  const pass = (env.SMTP_PASS ?? "").replace(/^[\r\n]+|[\r\n]+$/g, "");
  if (!host || !user || !pass) return null;
  const port = parseInt((env.SMTP_PORT ?? "").trim() || "465", 10) || 465;
  // 465 = SSL/TLS direkt (One.com standard). Andra portar använder STARTTLS, om inte SMTP_TLS=implicit.
  return { host, port, user, pass, to: (env.MAIL_TO ?? "").trim() || user, implicitTls: port === 465 || (env.SMTP_TLS ?? "").trim() === "implicit" };
}

export function mailConfigured(env: Env): boolean {
  return mailConfig(env) !== null;
}

/** Adressen som notiserna skickas till (MAIL_TO, annars avsändaradressen). */
export function mailRecipient(env: Env): string {
  return mailConfig(env)?.to ?? "";
}

/** Vilket steg i samtalet med e-postservern som gick fel – används för begripliga felmeddelanden i adminpanelen. */
export type SmtpStep = "anslutning" | "kryptering" | "inloggning" | "avsandare" | "mottagare" | "meddelande";

export class SmtpError extends Error {
  constructor(
    readonly step: SmtpStep,
    message: string,
  ) {
    super(message);
  }
}

const TIMEOUT_MS = 15000;
const enc = new TextEncoder();

function b64(text: string): string {
  const bytes = enc.encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** RFC 2047-kodad rubrik, så å, ä och ö visas rätt i ämnesraden. */
function encodeHeader(text: string): string {
  return /^[\x20-\x7e]*$/.test(text) ? text : `=?UTF-8?B?${b64(text)}?=`;
}

function wrap76(s: string): string {
  return s.replace(/.{1,76}/g, "$&\r\n");
}

/** Skydd mot header-injektion: inga radbrytningar i adresser/ämnen. */
function clean(s: string): string {
  return s.replace(/[\r\n]+/g, " ").trim();
}

class SmtpConnection {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private writer: WritableStreamDefaultWriter<Uint8Array>;
  private buffer = "";
  private decoder = new TextDecoder();

  constructor(private socket: Socket) {
    this.reader = socket.readable.getReader();
    this.writer = socket.writable.getWriter();
  }

  /** Läs ett (eventuellt flerradigt) svar: "250-..." fortsätter, "250 ..." avslutar. */
  async read(): Promise<{ code: number; text: string }> {
    const deadline = Date.now() + TIMEOUT_MS;
    const linesRead: string[] = [];
    for (;;) {
      let idx: number;
      while ((idx = this.buffer.indexOf("\r\n")) >= 0) {
        const line = this.buffer.slice(0, idx);
        this.buffer = this.buffer.slice(idx + 2);
        linesRead.push(line);
        if (/^\d{3} /.test(line) || /^\d{3}$/.test(line)) {
          return { code: parseInt(line.slice(0, 3), 10), text: linesRead.join("\n") };
        }
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("SMTP: tidsgräns vid läsning");
      const chunk = await Promise.race([
        this.reader.read(),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("SMTP: tidsgräns vid läsning")), remaining)),
      ]);
      if (chunk.done) throw new Error("SMTP: servern stängde anslutningen");
      this.buffer += this.decoder.decode(chunk.value, { stream: true });
    }
  }

  async write(line: string): Promise<void> {
    await this.writer.write(enc.encode(line));
  }

  async command(line: string, expect: number[]): Promise<{ code: number; text: string }> {
    await this.write(line + "\r\n");
    const res = await this.read();
    if (!expect.includes(res.code)) {
      // Visa aldrig lösenordet i loggen
      const shown = line.startsWith("AUTH") || /^[A-Za-z0-9+/=]{8,}$/.test(line) ? "[inloggningsuppgifter]" : line;
      throw new Error(`SMTP: oväntat svar på "${shown}": ${res.text}`);
    }
    return res;
  }

  /** Byt till TLS efter STARTTLS. */
  upgrade(): void {
    this.reader.releaseLock();
    this.writer.releaseLock();
    this.socket = this.socket.startTls();
    this.reader = this.socket.readable.getReader();
    this.writer = this.socket.writable.getWriter();
    this.buffer = "";
  }

  async close(): Promise<void> {
    try {
      await this.socket.close();
    } catch {
      /* redan stängd */
    }
  }
}

export async function sendMail(env: Env, msg: MailMessage): Promise<void> {
  const cfg = mailConfig(env);
  if (!cfg) throw new Error("SMTP är inte konfigurerat");
  const { host, port, user, implicitTls } = cfg;
  let step: SmtpStep = "anslutning";

  const socket = connect({ hostname: host, port }, { secureTransport: implicitTls ? "on" : "starttls", allowHalfOpen: false });
  const smtp = new SmtpConnection(socket);
  try {
    const greeting = await smtp.read();
    if (greeting.code !== 220) throw new Error("SMTP: oväntad hälsning: " + greeting.text);

    const ehloName = new URL(env.SITE_URL).hostname || "localhost";
    let ehlo = await smtp.command(`EHLO ${ehloName}`, [250]);
    if (!implicitTls) {
      step = "kryptering";
      if (!/STARTTLS/i.test(ehlo.text)) throw new Error("SMTP: servern erbjuder inte STARTTLS");
      await smtp.command("STARTTLS", [220]);
      smtp.upgrade();
      ehlo = await smtp.command(`EHLO ${ehloName}`, [250]);
    }

    step = "inloggning";
    if (/AUTH[ =][^\n]*PLAIN/i.test(ehlo.text)) {
      await smtp.command(`AUTH PLAIN ${b64(`\0${user}\0${cfg.pass}`)}`, [235]);
    } else {
      await smtp.command("AUTH LOGIN", [334]);
      await smtp.command(b64(user), [334]);
      await smtp.command(b64(cfg.pass), [235]);
    }

    step = "avsandare";
    await smtp.command(`MAIL FROM:<${clean(user)}>`, [250]);
    step = "mottagare";
    for (const to of msg.to) await smtp.command(`RCPT TO:<${clean(to)}>`, [250, 251]);
    step = "meddelande";
    await smtp.command("DATA", [354]);

    const domain = user.split("@")[1] ?? "localhost";
    const headers = [
      `From: ${encodeHeader("JFK webbplats")} <${clean(user)}>`,
      `To: ${msg.to.map(clean).join(", ")}`,
      msg.replyTo ? `Reply-To: <${clean(msg.replyTo)}>` : "",
      `Subject: ${encodeHeader(clean(msg.subject))}`,
      `Date: ${new Date().toUTCString().replace("GMT", "+0000")}`,
      `Message-ID: <${crypto.randomUUID()}@${domain}>`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: base64",
      "Auto-Submitted: auto-generated",
    ].filter(Boolean);
    // Base64-kodad brödtext innehåller aldrig en ensam punkt på en rad, så ingen "dot-stuffing" behövs.
    await smtp.write(headers.join("\r\n") + "\r\n\r\n" + wrap76(b64(msg.text)) + ".\r\n");
    const done = await smtp.read();
    if (done.code !== 250) throw new Error("SMTP: meddelandet godtogs inte: " + done.text);
    try {
      await smtp.command("QUIT", [221]);
    } catch {
      /* spelar ingen roll */
    }
  } catch (err) {
    throw new SmtpError(step, err instanceof Error ? err.message : String(err));
  } finally {
    await smtp.close();
  }
}
