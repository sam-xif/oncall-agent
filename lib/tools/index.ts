import { tool } from "ai";
import { z } from "zod";
import runbooks from "@/lib/runbooks.json";

const MOCK_ALERTS = [
  {
    id: "INC-4821",
    service: "checkout-service",
    severity: "P1",
    title: "Checkout service 5xx error rate > 15%",
    firedAt: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    errorRate: "18.3%",
    affectedRegions: ["us-east-1"],
    status: "triggered",
  },
  {
    id: "INC-4820",
    service: "auth-service",
    severity: "P2",
    title: "Auth service p99 latency > 2s",
    firedAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    p99LatencyMs: 2340,
    affectedRegions: ["us-east-1", "eu-west-1"],
    status: "acknowledged",
  },
];

const MOCK_LOGS: Record<string, { timestamp: string; level: string; message: string }[]> = {
  "checkout-service": [
    { timestamp: new Date(Date.now() - 60000).toISOString(), level: "ERROR", message: "DB connection timeout after 5000ms — pool exhausted (32/32 connections in use)" },
    { timestamp: new Date(Date.now() - 55000).toISOString(), level: "ERROR", message: "ECONNREFUSED connecting to postgres-primary:5432" },
    { timestamp: new Date(Date.now() - 50000).toISOString(), level: "ERROR", message: "Failed to process order ORD-99281: upstream DB unavailable" },
    { timestamp: new Date(Date.now() - 45000).toISOString(), level: "WARN",  message: "Retry attempt 3/3 for order ORD-99282 — giving up" },
    { timestamp: new Date(Date.now() - 30000).toISOString(), level: "ERROR", message: "HTTP 500 returned to client — checkout failed" },
  ],
  "auth-service": [
    { timestamp: new Date(Date.now() - 70000).toISOString(), level: "WARN",  message: "Redis cache miss rate at 94% — possible cold cache" },
    { timestamp: new Date(Date.now() - 65000).toISOString(), level: "ERROR", message: "Token validation latency 2340ms (threshold: 500ms)" },
    { timestamp: new Date(Date.now() - 60000).toISOString(), level: "WARN",  message: "Memory usage at 81% — approaching threshold" },
  ],
  "api-gateway": [
    { timestamp: new Date(Date.now() - 40000).toISOString(), level: "ERROR", message: "Upstream checkout-service timed out after 10s" },
    { timestamp: new Date(Date.now() - 35000).toISOString(), level: "WARN",  message: "Circuit breaker for checkout-service: OPEN" },
  ],
};

export const getActiveAlerts = tool({
  description: "Fetch currently active on-call alerts and incidents. Use this first to understand what is firing.",
  inputSchema: z.object({
    severity: z
      .enum(["P1", "P2", "P3", "all"])
      .optional()
      .describe("Filter by severity. Omit to get all."),
  }),
  execute: async ({ severity = "all" }) => {
    const filtered =
      severity === "all"
        ? MOCK_ALERTS
        : MOCK_ALERTS.filter((a) => a.severity === severity);
    return { alerts: filtered, fetchedAt: new Date().toISOString() };
  },
});

export const queryLogs = tool({
  description: "Query recent error logs for a specific service to identify the root cause of an incident.",
  inputSchema: z.object({
    service: z
      .string()
      .describe("Service name, e.g. checkout-service, auth-service, api-gateway"),
    level: z
      .enum(["ERROR", "WARN", "INFO", "all"])
      .optional()
      .describe("Filter by log level"),
    limit: z.number().min(1).max(20).optional().describe("Max log lines to return"),
  }),
  execute: async ({ service, level = "all", limit = 10 }) => {
    const serviceLogs = MOCK_LOGS[service];
    if (!serviceLogs) {
      return { service, logs: [], note: `No logs found for service "${service}". Known services: ${Object.keys(MOCK_LOGS).join(", ")}` };
    }
    const filtered =
      level === "all" ? serviceLogs : serviceLogs.filter((l) => l.level === level);
    return { service, logs: filtered.slice(0, limit), total: filtered.length };
  },
});

export const searchRunbook = tool({
  description: "Search internal runbooks for remediation steps matching a service name or symptom keywords.",
  inputSchema: z.object({
    query: z.string().describe("Service name or symptom keywords, e.g. 'checkout 500' or 'db replication lag'"),
  }),
  execute: async ({ query }) => {
    const q = query.toLowerCase();
    const matches = (runbooks as typeof runbooks).filter((rb) => {
      const haystack = [rb.service, rb.title, ...rb.keywords].join(" ").toLowerCase();
      return q.split(" ").some((word) => haystack.includes(word));
    });
    if (matches.length === 0) {
      return { query, results: [], note: "No runbooks matched. Try broader keywords." };
    }
    return { query, results: matches };
  },
});

export const postSlackUpdate = tool({
  description: "Post an incident status update to the Slack incidents channel. Use this to keep the team informed at key moments: when investigation starts, when root cause is identified, and when remediation is applied.",
  inputSchema: z.object({
    message: z.string().describe("The message to post. Include incident ID, current status, and next steps."),
    severity: z.enum(["P1", "P2", "P3"]).optional().describe("Incident severity for the header emoji"),
  }),
  execute: async ({ message, severity = "P2" }) => {
    const emoji = severity === "P1" ? "🔴" : severity === "P2" ? "🟡" : "🟢";
    const fullMessage = `${emoji} *[ON-CALL UPDATE]* ${message}`;

    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) {
      return {
        status: "skipped",
        note: "SLACK_WEBHOOK_URL not set — message would have been posted:",
        message: fullMessage,
      };
    }

    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: fullMessage }),
      });
      if (!res.ok) {
        return { status: "error", httpStatus: res.status, message: fullMessage };
      }
      return { status: "sent", message: fullMessage };
    } catch (err) {
      return { status: "error", error: String(err), message: fullMessage };
    }
  },
});

export const executeRemediation = tool({
  description: "Execute a remediation action against a service. Supported actions: restart (restart all pods), rollback (deploy previous stable version), scale (increase replica count), set-env-flag (update a feature flag or env var).",
  inputSchema: z.object({
    service: z.string().describe("Target service name"),
    action: z
      .enum(["restart", "rollback", "scale", "set-env-flag"])
      .describe("Remediation action to perform"),
    params: z
      .record(z.string(), z.string())
      .optional()
      .describe("Action parameters. For scale: { replicas: '6' }. For rollback: { version: 'v2.3.1' }. For set-env-flag: { key: 'AUTH_FALLBACK', value: 'true' }."),
  }),
  execute: async ({ service, action, params = {} }) => {
    // Simulate execution time
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const timestamp = new Date().toISOString();

    switch (action) {
      case "restart":
        return {
          status: "success",
          action: "restart",
          service,
          message: `Restarted all pods for ${service}. 3/3 pods running. Rolling restart completed in 38s.`,
          timestamp,
        };
      case "rollback": {
        const version = params.version ?? "previous";
        return {
          status: "success",
          action: "rollback",
          service,
          message: `Rolled back ${service} to ${version}. Deploy completed in 52s. 3/3 pods healthy.`,
          timestamp,
        };
      }
      case "scale": {
        const replicas = params.replicas ?? "4";
        return {
          status: "success",
          action: "scale",
          service,
          message: `Scaled ${service} to ${replicas} replicas. All replicas ready.`,
          timestamp,
        };
      }
      case "set-env-flag": {
        const { key, value } = params;
        return {
          status: "success",
          action: "set-env-flag",
          service,
          message: `Set ${key}=${value} on ${service}. Change applied without restart.`,
          timestamp,
        };
      }
    }
  },
});

export const chatTools = {
  getActiveAlerts,
  queryLogs,
  searchRunbook,
};

export const agentTools = {
  getActiveAlerts,
  queryLogs,
  searchRunbook,
  postSlackUpdate,
  executeRemediation,
};
