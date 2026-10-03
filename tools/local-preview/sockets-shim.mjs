// Minimal Node-version av Cloudflares connect() från "cloudflare:sockets" – bara för lokal testning.
import net from "node:net";
import tls from "node:tls";

const insecure = process.env.PREVIEW_TLS_INSECURE === "1"; // tillåter självsignerat cert i lokala tester

function wrap(nodeSocket, hostname) {
  const readable = new ReadableStream({
    start(controller) {
      nodeSocket.on("data", (chunk) => controller.enqueue(new Uint8Array(chunk)));
      nodeSocket.on("end", () => { try { controller.close(); } catch {} });
      nodeSocket.on("error", (e) => { try { controller.error(e); } catch {} });
    },
  });
  const writable = new WritableStream({
    write(chunk) {
      return new Promise((res, rej) => nodeSocket.write(chunk, (err) => (err ? rej(err) : res())));
    },
  });
  const socket = {
    readable,
    writable,
    opened: Promise.resolve({}),
    closed: new Promise((res) => nodeSocket.on("close", () => res())),
    async close() { nodeSocket.destroy(); },
    startTls() {
      nodeSocket.removeAllListeners("data");
      const secure = tls.connect({ socket: nodeSocket, servername: hostname, rejectUnauthorized: !insecure });
      return wrap(secure, hostname);
    },
  };
  return socket;
}

export function connect(address, options = {}) {
  const { hostname, port } = typeof address === "string" ? { hostname: address.split(":")[0], port: +address.split(":")[1] } : address;
  const s = options.secureTransport === "on"
    ? tls.connect({ host: hostname, port, servername: hostname, rejectUnauthorized: !insecure })
    : net.connect({ host: hostname, port });
  return wrap(s, hostname);
}
