#!/usr/bin/env node
// ── webai-mcp.mjs —— 把「顶栏那几个网页版 AI」包成 MCP 工具（stdio，零依赖）
//
// 谁在用：引擎的 @deepseek-ai/dsh-mcp-client。它按 profile 里的条目起这个进程，
// 把这里 tools/list 报的工具挂到 ctx.tools 上，模型看到的名字是
//     mcp__<serverName>__ask       例：mcp__webai_deepseek__ask
//
// 一个进程只服务一个站（--site），这样 MCP 面板里每个站能单独开关：
//     node mcp/webai-mcp.mjs --site deepseek
//
// 链路：引擎 → 本进程 → HTTP 127.0.0.1:31239（主进程的桥）→ 顶栏 webview 里的网页版
// ⇒ 前提：① 工作台开着；② 那个站已登录。等价于 `node tools/webai.mjs ask <site> "…"`。
//
// 协议：stdio，一行一个 JSON-RPC 2.0 消息（MCP 的 stdio transport 就是这么跑帧的）。
// 本文件不引任何 npm 包，避免 profile 里装依赖；只用到 node 内置 + 全局 fetch。
import process from 'node:process';

const argv = process.argv.slice(2);
const argOf = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt;
};

const PORT = Number(process.env.WEB_AI_PORT || 31239);
const BASE = 'http://127.0.0.1:' + PORT;
const SITE = String(argOf('--site', 'deepseek')).trim();
const DEFAULT_TIMEOUT = Math.max(5000, Math.min(600000, Number(argOf('--timeout', 180000)) || 180000));
// 单次回包上限：模型上下文很贵，长文让它自己决定要不要落盘（走 bash 调 tools/webai.mjs）
const MAX_CHARS = 12000;

const SITES = {
  deepseek: { name: 'DeepSeek 网页版', hint: '长文本、写代码、难一点的推理' },
  doubao: { name: '豆包网页版', hint: '生图、生视频、日常问答' },
  tongyi: { name: '通义千问网页版', hint: '生图（备用）、中文常识' },
  chatglm: { name: '智谱清言网页版', hint: '中文问答、写作' },
  kimi: { name: 'Kimi 网页版', hint: '长文档' },
};
const site = SITES[SITE] || { name: SITE, hint: '' };

// 桥在正文里夹的诊断标记（[[bridge:v3.36]] / [[webai-img:…]] 等）—— 交给模型前剥掉
const MARK = /\[\[(?:bridge|webai-note|webai-img|webai-img-err|webai-pick)[^\]]*\]\]/g;

const log = (...a) => console.error('[webai-mcp:' + SITE + ']', ...a);

// ── stdio 帧：一行一条消息 ─────────────────────────────────────────────
const send = (obj) => {
  process.stdout.write(JSON.stringify(obj) + '\n');
};
const sendResult = (id, result) => send({ jsonrpc: '2.0', id, result });
const sendError = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

// ── 工具定义 ───────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'ask',
    description:
      '免费问「' + site.name + '」（' + site.hint + '），复用顶栏里已登录的网页版，不花 API token。' +
      '一问一答、没有流式：慢的站要 10–60 秒，超时会如实报错。' +
      '适合当第二意见、抓网页版的最新信息、生图生视频这类 API 模型做不了的事；' +
      '别用它做需要工具调用或多轮推理的活。',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: '要发给网页版的问题/正文，可以很长（整篇文档也行）。' },
        timeoutMs: {
          type: 'integer',
          minimum: 5000,
          maximum: 600000,
          description: '等它答完的上限，默认 ' + DEFAULT_TIMEOUT + ' 毫秒；长文/生图就给到 300000。',
        },
      },
      required: ['question'],
    },
  },
];

async function askOnce(text, timeoutMs) {
  const t0 = Date.now();
  let res, body;
  try {
    res = await fetch(BASE + '/webai/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: SITE, text, timeoutMs }),
    });
  } catch (e) {
    return {
      ok: false,
      err:
        '连不上本机桥服务 ' + BASE + '（' + e.message + '）—— 工作台没开或已退出。' +
        '请先让用户启动工作台（./启动.sh），再重试。',
      elapsedMs: Date.now() - t0,
    };
  }
  try {
    body = await res.json();
  } catch (e) {
    return { ok: false, err: '桥回了非 JSON（HTTP ' + res.status + '）：' + e.message, elapsedMs: Date.now() - t0 };
  }
  const raw = String(body.text || '').trim();
  const clean = raw.replace(MARK, '').trim();
  return {
    ok: !!body.ok && !!clean,
    err:
      body.err ||
      (clean ? '' : '回包是空的（那个站的窗口可能没在跑，或还没答完）。顶栏点开 ' + SITE + ' 看一眼是否已登录。'),
    text: clean,
    elapsedMs: Number(body.elapsedMs || Date.now() - t0),
  };
}

async function callTool(name, args) {
  if (name !== 'ask') return { isError: true, text: '没有这个工具：' + name + '（只有 ask）' };
  const question = String(args && args.question != null ? args.question : '').trim();
  if (!question) return { isError: true, text: 'question 是空的。' };
  const timeoutMs = Math.max(5000, Math.min(600000, Number(args && args.timeoutMs) || DEFAULT_TIMEOUT));
  log('ask ' + question.length + ' 字 · timeout ' + timeoutMs + 'ms');
  const r = await askOnce(question, timeoutMs);
  const secs = (r.elapsedMs / 1000).toFixed(1);
  if (!r.ok) {
    return {
      isError: true,
      text:
        '✗ ' + site.name + ' 没答上来（' + secs + 's）：' + (r.err || '未知原因') + '\n' +
        '排查：① 工作台是否开着；② 顶栏点开 ' + SITE + ' 看是否登录/是否在弹验证码；③ 站点改版也会这样。' +
        '（2026-09-23 实测 kimi 打不进输入框，别开。）',
    };
  }
  const truncated = r.text.length > MAX_CHARS;
  const text = truncated
    ? r.text.slice(0, MAX_CHARS) +
      '\n\n…（共 ' + r.text.length + ' 字，这里只给前 ' + MAX_CHARS + ' 字。' +
      '要全文就让 AI 用 bash 跑 node tools/webai.mjs ask ' + SITE + ' "<问题>" --out 目录/）'
    : r.text;
  return { isError: false, text: '【' + site.name + ' · ' + secs + 's · ' + r.text.length + ' 字】\n' + text };
}

// ── JSON-RPC 分发 ──────────────────────────────────────────────────────
async function handle(msg) {
  const { id, method, params } = msg || {};
  const isNote = id === undefined || id === null;

  switch (method) {
    case 'initialize': {
      log('握手：客户端 ' + ((params && params.clientInfo && params.clientInfo.name) || '?')
        + ' / 协议 ' + ((params && params.protocolVersion) || '?'));
      // 客户端报的版本能接受就照它回（我们只用 tools，各修订版都兼容）
      const want = params && params.protocolVersion;
      sendResult(id, {
        protocolVersion: want || '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'webai-' + SITE, version: '1.0.0' },
        instructions:
          '这个 server 只有 ask 一个工具：把问题发给已经登录的' + site.name + '并取回正文。' +
          '没有流式、单通道串行，慢的时候要几十秒。',
      });
      return;
    }
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return;
    case 'ping':
      if (!isNote) sendResult(id, {});
      return;
    case 'tools/list':
      log('要工具表（' + TOOLS.length + ' 个）⇒ 说明真的挂上了');
      sendResult(id, { tools: TOOLS });
      return;
    case 'tools/call': {
      const name = params && params.name;
      const args = (params && params.arguments) || {};
      let out;
      try {
        out = await callTool(name, args);
      } catch (e) {
        out = { isError: true, text: '工具执行抛异常：' + ((e && e.stack) || e) };
      }
      sendResult(id, { content: [{ type: 'text', text: out.text }], isError: !!out.isError });
      return;
    }
    case 'prompts/list':
      sendResult(id, { prompts: [] });
      return;
    case 'resources/list':
      sendResult(id, { resources: [] });
      return;
    default:
      if (isNote) return; // 不认识的通知，忽略即可（协议允许）
      sendError(id, -32601, 'Method not found: ' + method);
  }
}

// ── 主循环：逐行读 stdin ───────────────────────────────────────────────
let buf = '';
let chain = Promise.resolve(); // 串行处理：桥本身也是单通道，别让两个 ask 抢同一个窗口
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch (e) {
      log('收到非 JSON 行，丢弃：' + line.slice(0, 120));
      continue;
    }
    chain = chain.then(() => handle(msg)).catch((e) => log('处理出错：' + ((e && e.stack) || e)));
  }
});
process.stdin.on('end', () => {
  chain.then(() => process.exit(0));
});
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
log('起来了 · 桥 ' + BASE + ' · 站点 ' + SITE);