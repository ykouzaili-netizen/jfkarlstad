// Node-modulkrok för förhandsvisningen: pekar "cloudflare:sockets" till en Node-implementation.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:sockets") {
    return { url: new URL("./sockets-shim.mjs", import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
