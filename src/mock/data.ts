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
  model?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
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
  promptTokens?: number;
  completionTokens?: number;
  durationMs?: number;
  model?: string;
}

export interface ChatThread {
  sessionId: string;
  messages: ChatMessage[];
}

const tMinutesAgo = (m: number) => new Date(now - m * 60 * 1000).toISOString();

export const chatThreadMock: ChatThread = {
  sessionId: '20260713_135012_56e011dc',
  messages: [
    { id: 'm1', role: 'user', content: '/sessions', at: tMinutesAgo(118), tokens: 4 },
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
      content: '20260713_135012_56e011dc, 並 UPDATE TITLE 為 AI AGENT UI',
      at: tMinutesAgo(60),
      tokens: 24,
    },
    {
      id: 'm4',
      role: 'tool',
      content:
        "hermes sessions rename → Session '20260713_135012_56e011dc' renamed to: AI AGENT UI",
      at: tMinutesAgo(60),
      durationMs: 412,
    },
    {
      id: 'm5',
      role: 'assistant',
      content: 'Renamed ✅. The active telegram session now has the title `AI AGENT UI`.',
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
    { id: 'm8', role: 'user', content: 'CMD prompt 如何啟動 UI?', at: tMinutesAgo(3), tokens: 8 },
    {
      id: 'm9',
      role: 'assistant',
      content: '```bash\ncd hermes-web-ui\nnpm install\nnpm run dev\n```\n-> http://localhost:5173',
      at: tMinutesAgo(2),
      tokens: 42,
      durationMs: 780,
    },
    { id: 'm10', role: 'user', content: '補 README', at: tMinutesAgo(1), tokens: 3 },
    {
      id: 'm11',
      role: 'assistant',
      content:
        'Done. README + docs/API.md + docs/SSE.md + docs/MINI_APP.md + docs/CONFIG.md + .env.example all committed.',
      at: tMinutesAgo(0),
      tokens: 38,
      durationMs: 920,
    },
  ],
};

/** Per-session thread lookup covering all 7 sessions in sessionsMock.
 *
 *  session                      listed  mock   gap
 *  56e011dc  AI AGENT UI         38     11    real content in SQLite
 *  a3f1b2    HK Brief             19      8    mock partial
 *  c4d5e6    XAUUSD brief         10      6    mock partial
 *  aa11bb    K8s probe            42      9    mock partial
 *  ff22cc    Twelve Data TZ       26      6    mock partial
 *  77ee99    Archive skill         14      5    mock partial
 *  44ab12    Archive cache         8      4    mock partial
 *
 *  Wire GET /api/sessions/:id/messages in v2 FastAPI to replace with live data.
 */
export const chatThreadsBySession: Record<string, ChatThread> = {
  [chatThreadMock.sessionId]: chatThreadMock,

  '20260713_090007_a3f1b2': {
    sessionId: '20260713_090007_a3f1b2',
    messages: [
      { id: 'hk1', role: 'system', content: 'cron · Daily Hong Kong Briefing · Jul 13 09:03 HKT', at: tMinutesAgo(280) },
      { id: 'hk2', role: 'assistant', content: 'Running morning brief pipeline…', at: tMinutesAgo(279) },
      { id: 'hk3', role: 'tool', content: 'hkex.status → Main market active · closes 16:00 HKT · Pre-mkt 09:00–09:30', at: tMinutesAgo(279), durationMs: 310 },
      { id: 'hk4', role: 'tool', content: 'weather.hko 9am → 29°C, cloudy, Typhoon Signal 1 in effect', at: tMinutesAgo(279), durationMs: 480 },
      { id: 'hk5', role: 'assistant', content: 'Markets: Hang Seng Futures +0.3% pre-mkt. Baidu earnings after close today.', at: tMinutesAgo(278), tokens: 210, durationMs: 3800 },
      { id: 'hk6', role: 'assistant', content: '📬 Sent to telegram (home 980366696). Closing in 2h19m.', at: tMinutesAgo(277), tokens: 88, durationMs: 920 },
      { id: 'hk7', role: 'system', content: 'Session closed · 19 messages · 09:03 → 09:04 HKT', at: tMinutesAgo(276) },
    ],
  },

  '20260713_083007_c4d5e6': {
    sessionId: '20260713_083007_c4d5e6',
    messages: [
      { id: 'xg1', role: 'system', content: 'cron · Daily XAUUSD 黃金簡報 · Jul 13 08:31 HKT', at: tMinutesAgo(310) },
      { id: 'xg2', role: 'assistant', content: 'Gold spot analysis running…', at: tMinutesAgo(309) },
      { id: 'xg3', role: 'tool', content: 'twelve.get_price XAU/USD → 4085.64 mid, 4085.10 bid, 4086.18 ask', at: tMinutesAgo(309), durationMs: 540 },
      { id: 'xg4', role: 'tool', content: 'XAUUSD 15m candle: high 4092.40 low 4079.80 close 4085.64 +0.38%', at: tMinutesAgo(309), durationMs: 290 },
      { id: 'xg5', role: 'assistant', content: 'XAU/USD 08:31 HKT brief:\n• Bias: Bullish — holding 4080 support\n• Resistance: 4095 / 4105\n• Watch: 4075 break would accelerate', at: tMinutesAgo(308), tokens: 140, durationMs: 4200 },
      { id: 'xg6', role: 'system', content: 'Session closed · 10 messages · 08:31 → 08:32 HKT', at: tMinutesAgo(307) },
    ],
  },

  '20260712_214500_aa11bb': {
    sessionId: '20260712_214500_aa11bb',
    messages: [
      { id: 'k1', role: 'user', content: 'cluster health?', at: tMinutesAgo(60 * 16) },
      { id: 'k2', role: 'assistant', content: 'Querying k8s API…', at: tMinutesAgo(60 * 16) },
      { id: 'k3', role: 'tool', content: 'kubectl top nodes → cpu% mem%\n  node-1  Ready  23%   41%\n  node-2  Ready  18%   38%\n  node-3  Ready  61%   72%  ⚠️ high\n  node-4  NotReady  —  cordoned (kernel oops)', at: tMinutesAgo(60 * 16), durationMs: 890 },
      { id: 'k4', role: 'user', content: "what's wrong with node-4?", at: tMinutesAgo(60 * 16 - 5) },
      { id: 'k5', role: 'tool', content: 'kubectl describe node node-4 → LastStateReady: false\n  Reason: KubeletNotReady\n  Message: PLEG is not healthy\n  kernel: BUG: soft lockup — CPU#0 stuck for 23s', at: tMinutesAgo(60 * 16 - 5), durationMs: 620 },
      { id: 'k6', role: 'assistant', content: 'node-4 has a kernel soft lockup — CPU stuck. Already cordoned.\n3/4 nodes Ready. etcd quorum: 3/3 ✅\nRecommendation: drain node-4, terminate and replace instance.', at: tMinutesAgo(60 * 16 - 4), tokens: 185, durationMs: 1100 },
      { id: 'k7', role: 'user', content: 'drain and replace', at: tMinutesAgo(60 * 16 - 3) },
      { id: 'k8', role: 'assistant', content: 'Running: kubectl drain node-4 —ignore-daemonsets —delete-emptydir-data\nDone. node-4 cordoned and drained (0 pods remaining). Ready for termination.', at: tMinutesAgo(60 * 16 - 2), tokens: 94, durationMs: 3200 },
      { id: 'k9', role: 'system', content: 'Session closed · 42 messages · pinned', at: tMinutesAgo(60 * 15) },
    ],
  },

  '20260712_181432_ff22cc': {
    sessionId: '20260712_181432_ff22cc',
    messages: [
      { id: 'td1', role: 'user', content: 'twelve data bar 時區差 10 小時？', at: tMinutesAgo(60 * 19) },
      { id: 'td2', role: 'assistant', content: 'Inspecting timestamp handling…', at: tMinutesAgo(60 * 19) },
      { id: 'td3', role: 'tool', content: 'fetch_data → get_latest_bar() returned 2026-07-13T15:30:00Z\n  UTC: 15:30  HKT: 23:30  ← latest bar\n  Local HKT now (screenshot): 13:33  ← 10h ahead', at: tMinutesAgo(60 * 19), durationMs: 440 },
      { id: 'td4', role: 'assistant', content: '確認係 Twelve Data 伺服器時鐘偏差，唔係我哋 timezone 轉換 bug。Badge 用 Date.UTC() construction 正確。X軸已加 timeZone: Asia/Hong_Kong。', at: tMinutesAgo(60 * 19 - 1), tokens: 112, durationMs: 980 },
      { id: 'td5', role: 'user', content: 'fix badge latest_bar_str bug', at: tMinutesAgo(60 * 19 - 2) },
      { id: 'td6', role: 'tool', content: 'patch dashboard_chart.py: latest_bar_str now uses .astimezone(hkt).strftime() instead of formatting UTC as HKT. All 45 tests pass ✅', at: tMinutesAgo(60 * 19 - 2), durationMs: 760 },
      { id: 'td7', role: 'assistant', content: 'Fixed. Dashboard badge now shows correct HKT. X軸時間亦已對齊。', at: tMinutesAgo(60 * 18 - 30), tokens: 62, durationMs: 640 },
      { id: 'td8', role: 'system', content: 'Session closed · 26 messages', at: tMinutesAgo(60 * 18) },
    ],
  },

  '20260710_103022_77ee99': {
    sessionId: '20260710_103022_77ee99',
    messages: [
      { id: 'sk1', role: 'user', content: 'create skill for daily gold brief', at: tMinutesAgo(60 * 24 * 3) },
      { id: 'sk2', role: 'assistant', content: 'Drafting xauusd-daily-brief SKILL.md…', at: tMinutesAgo(60 * 24 * 3) },
      { id: 'sk3', role: 'tool', content: 'write_file: src/daily_xauusd_brief/SKILL.md\nfrontmatter: name, trigger, category, validations, steps, pitfalls', at: tMinutesAgo(60 * 24 * 3), durationMs: 1200 },
      { id: 'sk4', role: 'assistant', content: 'SKILL.md scaffolded. Try running the skill to validate frontmatter + steps.', at: tMinutesAgo(60 * 24 * 3 - 10), tokens: 78, durationMs: 890 },
      { id: 'sk5', role: 'system', content: 'Session archived · skill authoring try #3 · 14 messages', at: tMinutesAgo(60 * 24 * 3 - 20) },
    ],
  },

  '20260708_143000_44ab12': {
    sessionId: '20260708_143000_44ab12',
    messages: [
      { id: 'pc1', role: 'user', content: 'prompt caching research — what models support it?', at: tMinutesAgo(60 * 24 * 5) },
      { id: 'pc2', role: 'assistant', content: 'Checking provider docs…', at: tMinutesAgo(60 * 24 * 5) },
      { id: 'pc3', role: 'tool', content: 'Claude 3.5: cache-control beta, 200k context, $3.50/1M cache\nGPT-4o: not yet, 128k context\nGemini 1.5: 1M context, $0.50/1M cache', at: tMinutesAgo(60 * 24 * 5), durationMs: 2100 },
      { id: 'pc4', role: 'assistant', content: 'Prompt caching is model-specific and expensive. Best for long repetitive contexts. For Hermes brief pipelines, standard 128k windows are sufficient for now.', at: tMinutesAgo(60 * 24 * 5 - 5), tokens: 140, durationMs: 1800 },
      { id: 'pc5', role: 'system', content: 'Session archived · prompt caching research · 8 messages', at: tMinutesAgo(60 * 24 * 5 - 10) },
    ],
  },
};

/** Empty thread — returned for session ids not yet in chatThreadsBySession. */
export const emptyThread: ChatThread = { sessionId: '', messages: [] };

/* --------------------------------- Trace -------------------------------- */

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

/* --------------------------------- Context -------------------------------- */

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

/* ------------------------------ Dashboard ------------------------------ */

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