/**
 * Mock data for HERMES Web UI v1.
 * All timestamps and values are deterministic (seedable).
 * Replace with real backend fetches when wiring FastAPI.
 */

export interface SessionItem {
  id: string;
  title: string;
  preview: string;
  source: 'cli' | 'gateway' | 'cron' | 'telegram' | 'dashboard';
  status: 'active' | 'idle' | 'archived' | 'error';
  startedAt: string; // ISO
  lastActiveAt: string; // ISO
  messageCount: number;
  pinned?: boolean;
  unread?: number;
}

const now = Date.now();
const minutesAgo = (m: number) => new Date(now - m * 60 * 1000).toISOString();

export const sessionsMock: SessionItem[] = [
  {
    id: '20260713_135012_56e011dc',
    title: 'AI AGENT UI',
    preview: 'high-fidelity ops console shell…',
    source: 'telegram',
    status: 'active',
    startedAt: minutesAgo(120),
    lastActiveAt: minutesAgo(2),
    messageCount: 38,
    unread: 1,
  },
  {
    id: '20260713_090007_a3f1b2',
    title: 'Daily Hong Kong Briefing · Jul 13 09:03',
    preview: 'cron delivered morning briefing…',
    source: 'cron',
    status: 'idle',
    startedAt: minutesAgo(280),
    lastActiveAt: minutesAgo(275),
    messageCount: 19,
  },
  {
    id: '20260713_083007_c4d5e6',
    title: 'Daily XAUUSD 黃金簡報 · Jul 13 08:31',
    preview: 'gold spot short report sent…',
    source: 'cron',
    status: 'idle',
    startedAt: minutesAgo(310),
    lastActiveAt: minutesAgo(308),
    messageCount: 10,
  },
  {
    id: '20260712_214500_aa11bb',
    title: 'K8s cluster health probe',
    preview: 'pinned: review infra dashboard…',
    source: 'cli',
    status: 'idle',
    startedAt: minutesAgo(60 * 16),
    lastActiveAt: minutesAgo(60 * 15),
    messageCount: 42,
    pinned: true,
  },
  {
    id: '20260712_181432_ff22cc',
    title: 'Twelve Data timezone investigation',
    preview: 'bar timestamps 10h ahead of local…',
    source: 'cli',
    status: 'idle',
    startedAt: minutesAgo(60 * 19),
    lastActiveAt: minutesAgo(60 * 18 + 30),
    messageCount: 26,
    pinned: true,
  },
  {
    id: '20260710_103022_77ee99',
    title: 'Archive: skill authoring try #3',
    preview: 'older exploratory session, archived…',
    source: 'cli',
    status: 'archived',
    startedAt: minutesAgo(60 * 24 * 3),
    lastActiveAt: minutesAgo(60 * 24 * 3 - 20),
    messageCount: 14,
  },
  {
    id: '20260708_143000_44ab12',
    title: 'Archive: prompt caching research',
    preview: 'archived after relevance expired…',
    source: 'cli',
    status: 'archived',
    startedAt: minutesAgo(60 * 24 * 5),
    lastActiveAt: minutesAgo(60 * 24 * 5 - 50),
    messageCount: 8,
  },
];

export const pinnedSessions = sessionsMock.filter((s) => s.pinned);
export const archivedSessions = sessionsMock.filter((s) => s.status === 'archived');
export const recentSessions = sessionsMock.filter((s) => s.status !== 'archived');

/* ----------------------------- Chat ----------------------------- */

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  at: string; // ISO
  tokens?: number;
  durationMs?: number;
}

export interface ChatThread {
  sessionId: string;
  messages: ChatMessage[];
}

const tMinutesAgo = (m: number) => new Date(now - m * 60 * 1000).toISOString();

export const chatThreadMock: ChatThread = {
  sessionId: '20260713_135012_56e011dc',
  messages: [
    {
      id: 'm1',
      role: 'user',
      content: '/sessions',
      at: tMinutesAgo(118),
      tokens: 4,
    },
    {
      id: 'm2',
      role: 'assistant',
      content:
        'Showing 3 most recent sessions. Pass a query= to search, or session_id+around_message_id to scroll.',
      at: tMinutesAgo(117),
      tokens: 36,
      durationMs: 880,
    },
    {
      id: 'm3',
      role: 'user',
      content:
        '20260713_135012_56e011dc, 並 UPDATE TITLE 為 AI AGENT UI',
      at: tMinutesAgo(60),
      tokens: 24,
    },
    {
      id: 'm4',
      role: 'tool',
      content: "hermes sessions rename → Session '20260713_135012_56e011dc' renamed to: AI AGENT UI",
      at: tMinutesAgo(60),
      durationMs: 412,
    },
    {
      id: 'm5',
      role: 'assistant',
      content:
        'Renamed ✅. The active telegram session now has the title `AI AGENT UI`.',
      at: tMinutesAgo(59),
      tokens: 22,
      durationMs: 310,
    },
    {
      id: 'm6',
      role: 'user',
      content:
        '請實作 HERMES Web UI v1，只做 responsive UI shell，不接 backend / auth / DB / Telegram bot，不改現有 dashboard 與既有功能。',
      at: tMinutesAgo(6),
      tokens: 58,
    },
    {
      id: 'm7',
      role: 'assistant',
      content:
        'OK. Vite + React + TS SPA, operations-console aesthetic. Will scaffold, build chat/dashboard/sessions/settings pages with mock data, reserve integration points, smoke-test, commit.',
      at: tMinutesAgo(5),
      tokens: 48,
      durationMs: 5200,
    },
  ],
};

export interface TraceEntry {
  id: string;
  startedAt: string;
  durationMs: number;
  label: string;
  status: 'ok' | 'warn' | 'err' | 'pending';
  tokens?: number;
  tool?: string;
}

export const traceMock: TraceEntry[] = [
  { id: 't1', startedAt: tMinutesAgo(6), durationMs: 5200, label: 'plan.scaffold', status: 'ok', tokens: 520 },
  { id: 't2', startedAt: tMinutesAgo(6), durationMs: 880, label: 'tools.terminal', status: 'ok', tool: 'npm create vite' },
  { id: 't3', startedAt: tMinutesAgo(5), durationMs: 412, label: 'tools.terminal', status: 'ok', tool: 'hermes sessions rename' },
  { id: 't4', startedAt: tMinutesAgo(5), durationMs: 280, label: 'agent.reply', status: 'ok', tokens: 22 },
  { id: 't5', startedAt: tMinutesAgo(2), durationMs: 1200, label: 'tools.file.write', status: 'pending', tool: 'tokens.css' },
];

export interface ContextStats {
  windowUsedPct: number;
  windowTotal: number;
  messagesCached: number;
  skillsLoaded: string[];
  memoryHits: number;
  toolsRegistered: number;
}

export const contextMock: ContextStats = {
  windowUsedPct: 62,
  windowTotal: 200_000,
  messagesCached: 6,
  skillsLoaded: ['hermes-agent'],
  memoryHits: 4,
  toolsRegistered: 18,
};

/* ---------------------------- Dashboard ---------------------------- */

export interface DashboardKPI {
  label: string;
  value: string;
  delta?: string;
  status?: 'ok' | 'warn' | 'err' | 'pending';
}

export const overviewKpis: DashboardKPI[] = [
  { label: 'Active sessions', value: '3', status: 'ok' },
  { label: 'Cron jobs running', value: '2 / 5', status: 'ok' },
  { label: 'Cron failures (24h)', value: '0', status: 'ok' },
  { label: 'Tokens today', value: '184k', delta: '+12%' },
  { label: 'Cost today', value: '$0.42', delta: '+8%' },
  { label: 'Avg latency', value: '1.8s', delta: '-0.3s' },
];

export interface HealthRow {
  name: string;
  category: 'core' | 'tool' | 'platform' | 'integration';
  status: 'ok' | 'warn' | 'err' | 'pending';
  detail: string;
}

export const healthRows: HealthRow[] = [
  { name: 'LLM gateway', category: 'core', status: 'ok', detail: 'deepseek@primary' },
  { name: 'Memory backend', category: 'integration', status: 'ok', detail: 'built-in sqlite' },
  { name: 'Cron scheduler', category: 'core', status: 'ok', detail: '5 jobs · tick 30s' },
  { name: 'Telegram gateway', category: 'platform', status: 'ok', detail: 'connected · id 980366696' },
  { name: 'Daily XAUUSD job', category: 'core', status: 'ok', detail: 'last run 09:03 HKT' },
  { name: 'Twelve Data', category: 'integration', status: 'warn', detail: 'bar timestamps 10h ahead' },
  { name: 'TradingView Lightweight', category: 'integration', status: 'ok', detail: 'shipped in dashboard' },
  { name: 'Session DB', category: 'core', status: 'ok', detail: 'sqlite · 3 sessions' },
];

export interface ReviewRow {
  date: string;
  topic: string;
  predicted: 'bullish' | 'bearish' | 'neutral';
  outcome: 'correct' | 'wrong' | 'partial' | 'pending';
  notes: string;
}

export const reviewRows: ReviewRow[] = [
  { date: '2026-07-13', topic: 'XAUUSD morning brief', predicted: 'bullish', outcome: 'pending', notes: 'awaiting 14:00 review' },
  { date: '2026-07-12', topic: 'XAUUSD morning brief', predicted: 'bullish', outcome: 'correct', notes: '+0.42% close' },
  { date: '2026-07-11', topic: 'XAUUSD morning brief', predicted: 'bearish', outcome: 'wrong', notes: '+0.18% intraday' },
  { date: '2026-07-10', topic: 'XAUUSD morning brief', predicted: 'neutral', outcome: 'partial', notes: 'range ±0.3%' },
];

export interface QueueRow {
  id: string;
  kind: 'cron' | 'webhook' | 'spawn';
  name: string;
  status: 'queued' | 'running' | 'scheduled' | 'paused' | 'err';
  nextRun?: string;
  detail?: string;
}

export const queueRows: QueueRow[] = [
  { id: 'q1', kind: 'cron', name: 'Daily Hong Kong Briefing', status: 'scheduled', nextRun: minutesAgo(-120), detail: 'next 09:03' },
  { id: 'q2', kind: 'cron', name: 'Daily XAUUSD 黃金簡報', status: 'scheduled', nextRun: minutesAgo(-60), detail: 'next 08:31' },
  { id: 'q3', kind: 'cron', name: 'Twelve Data refresh', status: 'running', detail: 'tick 30s' },
  { id: 'q4', kind: 'webhook', name: 'github:pr.opened', status: 'paused' },
  { id: 'q5', kind: 'spawn', name: 'review-agent', status: 'queued' },
];

export const placeholderChartBox = {
  title: 'Daily Tokens (last 14d)',
  height: 220,
  hint: 'Integration slot — drop in <DashboardChart/> blocks from daily-xauusd-bot.',
};

/* ------------------------------ Status badges ------------------------------ */

/**
 * Status tokens are exposed as a Record indexed by string. The union of
 * possible keys is broad (covers health / KPI / queue / trace / session /
 * chat role / outcome / predicted / kind). We keep them as plain strings so
 * new mock rows can re-use the same lookup without a TS narrowing chase.
 */
export interface StatusMetaEntry {
  label: string;
  tone: 'ok' | 'warn' | 'err' | 'pending' | 'info';
}

export const statusMeta: Record<string, StatusMetaEntry> = {
  ok: { label: 'ok', tone: 'ok' },
  warn: { label: 'warn', tone: 'warn' },
  err: { label: 'error', tone: 'err' },
  pending: { label: 'pending', tone: 'pending' },
  queued: { label: 'queued', tone: 'pending' },
  running: { label: 'running', tone: 'info' },
  scheduled: { label: 'scheduled', tone: 'info' },
  paused: { label: 'paused', tone: 'pending' },
  correct: { label: 'correct', tone: 'ok' },
  wrong: { label: 'wrong', tone: 'err' },
  partial: { label: 'partial', tone: 'warn' },
  idle: { label: 'idle', tone: 'pending' },
  active: { label: 'active', tone: 'ok' },
  archived: { label: 'archived', tone: 'pending' },
  bullish: { label: 'bullish', tone: 'ok' },
  bearish: { label: 'bearish', tone: 'err' },
  neutral: { label: 'neutral', tone: 'pending' },
  tool: { label: 'tool', tone: 'pending' },
  user: { label: 'user', tone: 'pending' },
  assistant: { label: 'assistant', tone: 'pending' },
  system: { label: 'system', tone: 'pending' },
  info: { label: 'info', tone: 'info' },
  webhook: { label: 'webhook', tone: 'pending' },
  spawn: { label: 'spawn', tone: 'pending' },
  cron: { label: 'cron', tone: 'pending' },
} as const;
