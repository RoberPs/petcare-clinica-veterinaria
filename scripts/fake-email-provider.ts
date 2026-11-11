/**
 * Proveedor de correo falso que imita la API transaccional de Brevo (POST /v3/smtp/email).
 * Guarda los correos en memoria para que las pruebas los consulten.
 *
 *   node scripts/fake-email-provider.ts [--port 8025] [--fail N]
 *   node scripts/fake-email-provider.ts --list        (lista los correos del servidor en marcha)
 *
 * Endpoints:
 *   POST   /v3/smtp/email   recibe un correo (201) o falla con 500 si quedan fallos simulados
 *   GET    /emails          lista los correos recibidos
 *   DELETE /emails          vacía la lista
 *   POST   /control         { "fail": N, "failStatus": 500 } simula N fallos seguidos
 *
 * Sin dependencias: se ejecuta con Node (eliminación de tipos) dentro y fuera de Docker.
 */
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export interface FakeEmail {
  id: string;
  receivedAt: string;
  apiKey: string | null;
  body: Record<string, unknown>;
}

export interface FakeEmailServer {
  server: Server;
  url: string;
  emails: FakeEmail[];
  setFailures: (count: number, status?: number) => void;
  close: () => Promise<void>;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

export function startFakeEmailServer(options: { port?: number; fail?: number } = {}): Promise<FakeEmailServer> {
  const emails: FakeEmail[] = [];
  let failuresLeft = options.fail ?? 0;
  let failStatus = 500;

  const server = createServer(async (req, res) => {
    try {
      const path = (req.url ?? '/').split('?')[0];
      if (req.method === 'POST' && path === '/v3/smtp/email') {
        const raw = await readBody(req);
        if (failuresLeft > 0) {
          failuresLeft -= 1;
          return send(res, failStatus, { code: 'simulated_failure', message: 'Fallo simulado' });
        }
        const apiKey = typeof req.headers['api-key'] === 'string' ? req.headers['api-key'] : null;
        if (!apiKey) return send(res, 401, { code: 'unauthorized', message: 'Falta api-key' });
        const email: FakeEmail = {
          id: `<${randomUUID()}@fake.local>`,
          receivedAt: new Date().toISOString(),
          apiKey,
          body: JSON.parse(raw || '{}') as Record<string, unknown>,
        };
        emails.push(email);
        return send(res, 201, { messageId: email.id });
      }
      if (req.method === 'GET' && path === '/emails') return send(res, 200, emails);
      if (req.method === 'DELETE' && path === '/emails') {
        emails.length = 0;
        failuresLeft = 0;
        return send(res, 200, { ok: true });
      }
      if (req.method === 'POST' && path === '/control') {
        const body = JSON.parse((await readBody(req)) || '{}') as { fail?: number; failStatus?: number };
        failuresLeft = body.fail ?? 0;
        failStatus = body.failStatus ?? 500;
        return send(res, 200, { ok: true, failuresLeft, failStatus });
      }
      return send(res, 404, { code: 'not_found' });
    } catch {
      return send(res, 400, { code: 'bad_request' });
    }
  });

  return new Promise((resolve) => {
    server.listen(options.port ?? 0, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : options.port;
      resolve({
        server,
        url: `http://localhost:${port}`,
        emails,
        setFailures: (count, status = 500) => {
          failuresLeft = count;
          failStatus = status;
        },
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  if (process.argv.includes('--list')) {
    const base = process.env.FAKE_EMAIL_URL ?? 'http://localhost:8025';
    const res = await fetch(`${base}/emails`);
    const list = (await res.json()) as FakeEmail[];
    console.log(`${list.length} correo(s) en ${base}`);
    for (const e of list) {
      const to = (e.body.to as { email: string }[] | undefined)?.map((t) => t.email).join(', ');
      console.log(`- ${e.receivedAt} · para: ${to} · asunto: ${String(e.body.subject)}`);
    }
  } else {
    const port = Number(argValue('--port') ?? 8025);
    const fail = Number(argValue('--fail') ?? 0);
    await startFakeEmailServer({ port, fail });
    console.log(`Proveedor de correo falso escuchando en http://localhost:${port} (fallos simulados: ${fail})`);
  }
}
