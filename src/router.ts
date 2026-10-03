import type { Env } from "./env.js";
import type { Settings } from "./lib/settings.js";

export interface RequestContext {
  req: Request;
  env: Env;
  exec: ExecutionContext;
  url: URL;
  params: Record<string, string>;
  /** CSP-nonce för inline <style>/<script> i denna förfrågan. */
  nonce: string;
  /** Satt bara när adminpanelen förhandsvisar osparade ändringar. */
  preview?: Partial<Settings>;
  /** Översiktens klickbara webbplats: allt som går att ändra markeras när man pekar på det. */
  editMap?: boolean;
}

export type Handler = (c: RequestContext) => Promise<Response> | Response;

interface Route {
  method: string;
  parts: string[];
  handler: Handler;
}

/** Liten router: stödjer statiska segment och :parametrar, t.ex. /aktuellt/:slug */
export class Router {
  private routes: Route[] = [];

  on(method: string | string[], path: string, handler: Handler): this {
    const methods = Array.isArray(method) ? method : [method];
    for (const m of methods) {
      this.routes.push({ method: m.toUpperCase(), parts: split(path), handler });
    }
    return this;
  }

  get(path: string, handler: Handler): this {
    return this.on(["GET", "HEAD"], path, handler);
  }

  post(path: string, handler: Handler): this {
    return this.on("POST", path, handler);
  }

  match(method: string, pathname: string): { handler: Handler; params: Record<string, string> } | "method-not-allowed" | null {
    const parts = split(pathname);
    let pathMatched = false;
    for (const route of this.routes) {
      const params = matchParts(route.parts, parts);
      if (!params) continue;
      pathMatched = true;
      if (route.method === method.toUpperCase()) return { handler: route.handler, params };
    }
    return pathMatched ? "method-not-allowed" : null;
  }
}

function split(path: string): string[] {
  return path.split("/").filter(Boolean);
}

function matchParts(pattern: string[], actual: string[]): Record<string, string> | null {
  if (pattern.length !== actual.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i++) {
    const p = pattern[i]!;
    const a = actual[i]!;
    if (p.startsWith(":")) {
      try {
        params[p.slice(1)] = decodeURIComponent(a);
      } catch {
        return null;
      }
    } else if (p !== a) {
      return null;
    }
  }
  return params;
}
