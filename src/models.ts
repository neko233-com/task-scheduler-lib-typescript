// Wire models — JSON field names match server-task-scheduler exactly.
// See server-task-scheduler/ARCHITECTURE.md.

export interface RegisterRequest {
  name: string;
  address: string; // public callback URL
  app: string;
  tasks: string[];
}

export interface RegisterResponse {
  worker_id: string;
  ttl_seconds: number;
}

export interface HeartbeatRequest {
  worker_id: string;
  tasks: string[];
}

export interface GenericAck {
  ok: boolean;
  ttl_seconds: number;
}

export interface ExecuteRequest {
  job_id: string;
  task_key: string;
  params: Record<string, any>;
  attempt: number;
  timeout_seconds: number;
}

export interface ExecuteResponse {
  success: boolean;
  output: string;
  error: string;
}
