/** Bindningar och variabler som Workern får från wrangler.jsonc och Worker secrets. */
export interface Env {
  DB: D1Database;
  /** Uppladdade filer. R2 används om bindningen finns, annars KV (FILES). Se src/lib/storage.ts. */
  UPLOADS?: R2Bucket;
  FILES?: KVNamespace;
  ASSETS: Fetcher;

  // vars
  SITE_URL: string;
  TURNSTILE_SITE_KEY: string;

  // secrets (kan saknas lokalt – koden ska tåla det)
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  /** Valfritt: "implicit" eller "starttls". Standard: implicit på port 465, annars STARTTLS. */
  SMTP_TLS?: string;
  MAIL_TO?: string;
  TURNSTILE_SECRET_KEY?: string;
  SETUP_TOKEN?: string;
  IP_HASH_SALT?: string;
}
