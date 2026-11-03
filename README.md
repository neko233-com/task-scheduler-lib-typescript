# task-scheduler-lib-typescript

TypeScript SDK for [server-task-scheduler](https://github.com/neko233-com/server-task-scheduler).
An embeddable worker that **auto-registers** with the center, sends heartbeats,
declares the tasks it can run, and serves `POST /execute` so the center can
dispatch scheduled jobs to it.

**Zero runtime dependencies** (Node's built-in `http` + `fetch`). Vendored by
design — copy `src/` into your project, or use it as a git submodule. No npm
publish required.

## Use

```ts
import { Worker } from './src';

const worker = new Worker({
  serverUrl: 'http://localhost:6432', // center
  name: 'my-worker',
  app: 'my-app',
  listenPort: 8084, // local bind
  publicUrl: 'http://localhost:8084', // public callback URL
});

worker.handle('send_email', async (params) => {
  return `queued email to ${params.to}`;
});

worker.run(); // registers, heartbeats, serves /execute
```

## API

| Member | Description |
|--------|-------------|
| `new Worker({ serverUrl, name, app, listenPort, publicUrl })` | Construct a worker. |
| `handle(taskKey, fn)` | Register a handler `fn(params) => string \| Promise<string>`. Thrown errors become a failed task. |
| `run()` | Register, start heartbeat, serve `/execute`, deregister on SIGINT/SIGTERM. |

The center calls `POST {publicUrl}/execute` with
`{job_id, task_key, params, attempt, timeout_seconds}` and expects
`{success, output, error}`.

## Run the demo

```bash
npm install
SCHEDULER_URL=http://localhost:6432 npm run example
# then on the center:
curl -X POST http://localhost:6432/api/v1/schedules -H 'Content-Type: application/json' \
  -d '{"name":"demo","task_key":"hello","cron":"*/30 * * * *","params":{"name":"world"},"enabled":true}'
```
