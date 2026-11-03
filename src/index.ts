import * as http from 'http';
import {
  RegisterRequest,
  RegisterResponse,
  HeartbeatRequest,
  ExecuteRequest,
  ExecuteResponse,
  GenericAck,
} from './models';

export type TaskHandler = (params: Record<string, any>) => Promise<string> | string;

export interface WorkerOptions {
  /** Center base URL, e.g. "http://localhost:6432". */
  serverUrl: string;
  name: string;
  app: string;
  /** Local TCP port the worker listens on for /execute. */
  listenPort: number;
  /** Public URL the center calls back, e.g. "http://localhost:8084". */
  publicUrl: string;
}

/**
 * Embeddable worker for server-task-scheduler. Auto-registers with the center,
 * sends heartbeats, declares the tasks it can run, and serves POST /execute so
 * the center can dispatch scheduled jobs to it.
 *
 * Zero runtime dependencies — uses Node's built-in http + fetch, so it can be
 * copied into any Node project (or used as a submodule) without `npm install`.
 */
export class Worker {
  private serverUrl: string;
  private name: string;
  private app: string;
  private listenPort: number;
  private publicUrl: string;
  private handlers = new Map<string, TaskHandler>();
  private workerId = '';
  private ttlSeconds = 30;
  private server?: http.Server;

  constructor(opts: WorkerOptions) {
    this.serverUrl = opts.serverUrl.replace(/\/$/, '');
    this.name = opts.name;
    this.app = opts.app;
    this.listenPort = opts.listenPort;
    this.publicUrl = opts.publicUrl;
  }

  /** Register a handler for `taskKey`. Call before run(). */
  handle(taskKey: string, handler: TaskHandler): void {
    this.handlers.set(taskKey, handler);
  }

  private taskKeys(): string[] {
    return [...this.handlers.keys()];
  }

  private async register(): Promise<void> {
    const body: RegisterRequest = {
      name: this.name,
      app: this.app,
      address: this.publicUrl,
      tasks: this.taskKeys(),
    };
    const resp = await this.post<RegisterRequest, RegisterResponse>(
      '/api/v1/workers/register',
      body
    );
    this.workerId = resp.worker_id;
    if (resp.ttl_seconds > 0) this.ttlSeconds = resp.ttl_seconds;
    console.log(
      `[worker] registered id=${this.workerId} ttl=${this.ttlSeconds}s tasks=${this.taskKeys()}`
    );
  }

  private async heartbeat(): Promise<void> {
    const body: HeartbeatRequest = {
      worker_id: this.workerId,
      tasks: this.taskKeys(),
    };
    await this.post<HeartbeatRequest, GenericAck>(
      '/api/v1/workers/heartbeat',
      body
    );
  }

  private async deregister(): Promise<void> {
    if (!this.workerId) return;
    await this.post<{ worker_id: string }, GenericAck>(
      '/api/v1/workers/deregister',
      { worker_id: this.workerId }
    );
  }

  private async post<TReq, TRes>(path: string, body: TReq): Promise<TRes> {
    const res = await fetch(this.serverUrl + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`center returned ${res.status} for ${path}`);
    }
    return (await res.json()) as TRes;
  }

  /** Register, start heartbeat, serve /execute, and block until SIGINT/SIGTERM. */
  async run(): Promise<void> {
    await this.register();

    const intervalMs = Math.max(1000, Math.floor(this.ttlSeconds / 2) * 1000);
    const hbTimer = setInterval(() => {
      this.heartbeat().catch((e) => console.error('[worker] heartbeat failed', e));
    }, intervalMs);

    const server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/execute') {
        let data = '';
        req.on('data', (chunk) => (data += chunk));
        req.on('end', () => this.handleExecute(data, res));
      } else {
        this.send(res, 404, { success: false, error: 'not found' });
      }
    });
    this.server = server;

    await new Promise<void>((resolve) => server.listen(this.listenPort, resolve));
    console.log(`[worker] serving /execute on port ${this.listenPort}`);

    const shutdown = () => {
      clearInterval(hbTimer);
      server.close();
      this.deregister()
        .catch(() => {})
        .finally(() => process.exit(0));
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }

  private async handleExecute(data: string, res: http.ServerResponse): Promise<void> {
    let reqBody: ExecuteRequest;
    try {
      reqBody = JSON.parse(data || '{}');
    } catch {
      this.send(res, 400, { success: false, error: 'invalid JSON' });
      return;
    }
    const handler = this.handlers.get(reqBody.task_key);
    if (!handler) {
      this.send(res, 200, {
        success: false,
        error: `unknown task_key ${reqBody.task_key}`,
      });
      return;
    }
    try {
      const output = await handler(reqBody.params || {});
      this.send(res, 200, { success: true, output });
    } catch (e: any) {
      this.send(res, 200, {
        success: false,
        error: String(e?.message ?? e),
      });
    }
  }

  private send(
    res: http.ServerResponse,
    code: number,
    body: ExecuteResponse | Record<string, any>
  ): void {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  }
}
