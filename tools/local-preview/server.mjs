// Lokal förhandsvisning UTAN wrangler – endast en reservlösning för miljöer där wrangler inte kan installeras.
// Kör samma Worker-kod (kompilerad till .build/) mot SQLite (node:sqlite) i stället för D1,
// och mot en mapp på disk i stället för R2. Använd `npm run dev` (wrangler dev) när det går.
//
//   npm run preview:node            → startar på http://localhost:8787
//   npm run preview:node -- --reset → nollställer databasen (migreringar + seed)

import { createServer } from "node:http";
import { register } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DATA = join(ROOT, "tools/local-preview/.data");
const PORT = Number(process.env.PORT ?? 8787);

if (process.argv.includes("--reset")) rmSync(DATA, { recursive: true, force: true });
mkdirSync(join(DATA, "r2"), { recursive: true });

// ---------- D1 → node:sqlite ----------
const dbFile = join(DATA, "local.sqlite");
const fresh = !existsSync(dbFile);
const sqlite = new DatabaseSync(dbFile);
sqlite.exec("PRAGMA foreign_keys = ON;");
if (fresh) {
  for (const f of readdirSync(join(ROOT, "migrations")).filter((f) => f.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(join(ROOT, "migrations", f), "utf8"));
    console.log("Migrering:", f);
  }
  sqlite.exec(readFileSync(join(ROOT, "seed/seed.sql"), "utf8"));
  console.log("Seed-data inläst");
}

function d1Value(v) {
  if (v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  return v;
}

class Stmt {
  constructor(sql, params = []) { this.sql = sql; this.params = params; }
  bind(...values) { return new Stmt(this.sql, values.map(d1Value)); }
  async all() {
    const s = sqlite.prepare(this.sql);
    const reader = /^\s*(select|with|pragma)|returning/i.test(this.sql);
    if (reader) return { results: s.all(...this.params).map((r) => ({ ...r })), success: true, meta: { changes: 0, last_row_id: 0 } };
    const r = s.run(...this.params);
    return { results: [], success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
  async first(col) {
    const row = sqlite.prepare(this.sql).get(...this.params);
    if (!row) return null;
    return col ? row[col] ?? null : { ...row };
  }
  async run() { return this.all(); }
}

const DB = {
  prepare: (sql) => new Stmt(sql),
  async batch(stmts) {
    sqlite.exec("BEGIN");
    try {
      const out = [];
      for (const s of stmts) out.push(await s.all());
      sqlite.exec("COMMIT");
      return out;
    } catch (e) {
      sqlite.exec("ROLLBACK");
      throw e;
    }
  },
  async exec(sql) { sqlite.exec(sql); return { count: 1 }; },
};

// ---------- R2 → disk ----------
const r2Path = (key) => join(DATA, "r2", encodeURIComponent(key));
const UPLOADS = {
  async put(key, value, opts = {}) {
    const buf = Buffer.from(value instanceof ArrayBuffer ? new Uint8Array(value) : await new Response(value).arrayBuffer());
    writeFileSync(r2Path(key), buf);
    writeFileSync(r2Path(key) + ".meta.json", JSON.stringify({ httpMetadata: opts.httpMetadata ?? {}, customMetadata: opts.customMetadata ?? {} }));
    return this.head(key);
  },
  async head(key) {
    if (!existsSync(r2Path(key))) return null;
    const meta = JSON.parse(readFileSync(r2Path(key) + ".meta.json", "utf8"));
    const size = statSync(r2Path(key)).size;
    return {
      key, size, etag: String(size), httpEtag: `"${size}"`, uploaded: new Date(), ...meta,
      writeHttpMetadata(h) { if (meta.httpMetadata?.contentType) h.set("Content-Type", meta.httpMetadata.contentType); if (meta.httpMetadata?.contentDisposition) h.set("Content-Disposition", meta.httpMetadata.contentDisposition); },
    };
  },
  async get(key) {
    const head = await this.head(key);
    if (!head) return null;
    const data = readFileSync(r2Path(key));
    return { ...head, body: new Response(data).body, arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) };
  },
  async delete(keys) {
    for (const k of [].concat(keys)) { rmSync(r2Path(k), { force: true }); rmSync(r2Path(k) + ".meta.json", { force: true }); }
  },
};

// ---------- Statiska filer ----------
const TYPES = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".woff": "font/woff", ".woff2": "font/woff2", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8", ".webmanifest": "application/manifest+json" };
function staticFile(pathname) {
  const p = normalize(join(ROOT, "public", decodeURIComponent(pathname)));
  if (!p.startsWith(join(ROOT, "public")) || pathname.endsWith("/_headers")) return null;
  if (!existsSync(p) || !statSync(p).isFile()) return null;
  return new Response(readFileSync(p), { headers: { "Content-Type": TYPES[extname(p)] ?? "application/octet-stream", "Cache-Control": "no-cache" } });
}
const ASSETS = { fetch: async (req) => staticFile(new URL(typeof req === "string" ? req : req.url).pathname) ?? new Response("Not found", { status: 404 }) };

// ---------- Miljövariabler (vars från wrangler.jsonc + .dev.vars) ----------
const jsonc = readFileSync(join(ROOT, "wrangler.jsonc"), "utf8").replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1");
const vars = { ...JSON.parse(jsonc).vars, SITE_URL: `http://localhost:${PORT}` };
const devVarsFile = existsSync(join(ROOT, ".dev.vars")) ? join(ROOT, ".dev.vars") : join(ROOT, ".dev.vars.example");
for (const line of readFileSync(devVarsFile, "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) vars[m[1]] = m[2];
}
// KV-shim (FILES) ovanpå samma diskmapp
const FILES = {
  async put(key, value, opts = {}) {
    await UPLOADS.put(key, value, { httpMetadata: {}, customMetadata: opts.metadata ?? {} });
  },
  async getWithMetadata(key, type) {
    const head = await UPLOADS.head(key);
    if (!head) return { value: null, metadata: null };
    const data = readFileSync(r2Path(key));
    const value = type === "stream" ? new Response(data).body : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    return { value, metadata: head.customMetadata };
  },
  async delete(key) { await UPLOADS.delete(key); },
};
const env = { ...vars, DB, FILES, ASSETS };

// ---------- HTTP-server ----------
register("./hooks.mjs", import.meta.url); // "cloudflare:sockets" → Node-shim
const worker = (await import(pathToFileURL(join(ROOT, ".build/index.js")).href)).default;

createServer(async (req, res) => {
  try {
    const url = `http://localhost:${PORT}${req.url}`;
    const asset = req.method === "GET" || req.method === "HEAD" ? staticFile(new URL(url).pathname) : null;
    let response = asset;
    if (!response) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = chunks.length && !["GET", "HEAD"].includes(req.method) ? Buffer.concat(chunks) : undefined;
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
      headers.set("cf-connecting-ip", req.socket.remoteAddress ?? "127.0.0.1");
      const request = new Request(url, { method: req.method, headers, body, redirect: "manual" });
      const waits = [];
      response = await worker.fetch(request, env, { waitUntil: (p) => waits.push(p), passThroughOnException() {} });
      Promise.allSettled(waits);
    }
    const outHeaders = {};
    response.headers.forEach((v, k) => { outHeaders[k] = k === "set-cookie" ? response.headers.getSetCookie() : v; });
    res.writeHead(response.status, outHeaders);
    res.end(response.body ? Buffer.from(await response.arrayBuffer()) : undefined);
    console.log(response.status, req.method, req.url);
  } catch (e) {
    console.error(e);
    res.writeHead(500).end("Internt fel i förhandsvisningen");
  }
}).listen(PORT, () => console.log(`Förhandsvisning: http://localhost:${PORT}`));
