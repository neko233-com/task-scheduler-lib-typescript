import { Worker } from './index';

// Demo worker for server-task-scheduler (TypeScript SDK).
//   SCHEDULER_URL=http://localhost:6432 npm run example
// Then create a schedule on the center with task_key "hello".

const serverUrl = process.env.SCHEDULER_URL || 'http://localhost:6432';

const worker = new Worker({
  serverUrl,
  name: 'demo-typescript',
  app: 'demo',
  listenPort: 8084,
  publicUrl: 'http://localhost:8084',
});

worker.handle('hello', async (params) => {
  const name = (params && params.name) || 'world';
  const msg = `hello, ${name}! (worker=demo-typescript)`;
  console.log(msg);
  return msg;
});

worker.run().catch((e) => {
  console.error('worker error', e);
  process.exit(1);
});
