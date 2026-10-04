// Minimala typdeklarationer för de Cloudflare-API:er projektet använder.
// (Ersätter @cloudflare/workers-types för att hålla projektet beroendefritt.
//  Kör gärna `npx wrangler types` om du vill ha de fullständiga typerna.)

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface Fetcher {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}

interface D1Meta {
  changes: number;
  last_row_id: number;
  duration?: number;
}

interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: D1Meta;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<unknown>;
}

interface R2HTTPMetadata {
  contentType?: string;
  contentDisposition?: string;
  cacheControl?: string;
}

interface R2Object {
  key: string;
  size: number;
  etag: string;
  httpEtag: string;
  uploaded: Date;
  httpMetadata?: R2HTTPMetadata;
  customMetadata?: Record<string, string>;
  writeHttpMetadata(headers: Headers): void;
}

interface R2ObjectBody extends R2Object {
  body: ReadableStream;
  arrayBuffer(): Promise<ArrayBuffer>;
}

interface R2PutOptions {
  httpMetadata?: R2HTTPMetadata;
  customMetadata?: Record<string, string>;
}

interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
  head(key: string): Promise<R2Object | null>;
  put(key: string, value: ArrayBuffer | ReadableStream | string | Blob, options?: R2PutOptions): Promise<R2Object>;
  delete(key: string | string[]): Promise<void>;
}

interface KVNamespaceGetWithMetadataResult<T, M> {
  value: T | null;
  metadata: M | null;
}

interface KVNamespace {
  get(key: string, type: "text"): Promise<string | null>;
  get(key: string, type: "arrayBuffer"): Promise<ArrayBuffer | null>;
  getWithMetadata<M = unknown>(key: string, type: "stream"): Promise<KVNamespaceGetWithMetadataResult<ReadableStream, M>>;
  getWithMetadata<M = unknown>(key: string, type: "arrayBuffer"): Promise<KVNamespaceGetWithMetadataResult<ArrayBuffer, M>>;
  put(key: string, value: string | ArrayBuffer | ReadableStream, options?: { metadata?: unknown; expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

interface ScheduledController {
  scheduledTime: number;
  cron: string;
}

declare module "cloudflare:sockets" {
  export interface SocketOptions {
    secureTransport?: "off" | "on" | "starttls";
    allowHalfOpen?: boolean;
  }
  export interface Socket {
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
    opened: Promise<unknown>;
    closed: Promise<void>;
    close(): Promise<void>;
    startTls(): Socket;
  }
  export function connect(address: { hostname: string; port: number } | string, options?: SocketOptions): Socket;
}

/** Cloudflares cache i datacentret (Cache API). Finns inte i alla miljöer – kontrollera med typeof caches. */
interface CacheStorage {
  readonly default: Cache;
}
