// ── webai.mjs —— 把「顶栏那几个网页版 AI」当本地 API 用（0 API token）
//
// 用法（在**任何**会话里跑；只要工作台开着就行）：
//   node tools/webai.mjs list                                  # 有哪几个站、登录态在哪个分区
//   node tools/webai.mjs state                                 # 现在有没有任务在跑
//   node tools/webai.mjs ask kimi "用一句话解释什么是向量数据库"
//   node tools/webai.mjs ask tongyi "按这份需求写 5 条标题" --timeout 240000
//   node tools/webai.mjs ask tongyi --file notes.md --out out/  # 文件当问题、回答落盘
//
// 选项：
//   --timeout <ms>   默认 180000，最长 600000
//   --json           原样打印桥的回包（排查用）
//   --file <路径>    把文件内容接在问题后面一起发
//   --out <路径>     回答存文件，终端只回 600 字预览（长回答别整篇灌进会话上下文）
//                    给目录/不给扩展名 ⇒ 自动 `webai-<站点>-<年月日-时分>.md`
//   --dry            只回显将要发送的正文，不发出去
//
// 链路：本脚本 → HTTP 127.0.0.1:31239（主进程的桥服务，见 shell/main.js 的 WEB_AI_PORT）
//       → 渲染层 shell/renderer/webai-bridge.js 在**顶栏那个 webview**（登录态持久）里
//       输入问题、等它答完，再把正文带回来。全程复用你手动登录的那份 cookie，不碰 API key。
//
// ⚠ 前提：① 工作台开着；② 那个站的网页版**已登录**（未登录时会如实报「可能要登录」）；
//        ③ 桥是壳代码，改了 main.js/preload.js 必须重启 GUI。
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.WEB_AI_PORT || 31239);
const BASE = 'http://127.0.0.1:' + PORT;
const argv = process.argv.slice(2);

function takeValue(name, dflt) {
  const i = argv.indexOf(name);
  if (i < 0) return dflt;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v === undefined ? true : v;
}
function takeBool(name) {
  const i = argv.indexOf(name);
  if (i < 0) return false;
  argv.splice(i, 1);
  return true;
}

const asJson = takeBool('--json');
const dry = takeBool('--dry');
const timeoutMs = Math.max(5000, Math.min(600000, Number(takeValue('--timeout', 180000)) || 180000));
const fileArg = takeValue('--file', null);
const outArg = takeValue('--out', null);
const cmd = String(argv.shift() || 'list').toLowerCase();

const die = (msg, hint) => {
  console.error('✗ ' + msg);
  if (hint) console.error('  ' + hint);
  process.exit(2);
};

async function getJson(p) {
  try {
    const r = await fetch(BASE + p);
    return await r.json();
  } catch (e) {
    die('连不上桥服务 ' + BASE + '（' + e.message + '）', '先确认工作台开着（./启动.sh）。');
  }
}

// 落盘一律 Markdown：给目录/不给扩展名 ⇒ 自动命名；.txt ⇒ 改 .md；代码后缀原样
const CODEY = /^\.(html?|js|mjs|cjs|ts|tsx|jsx|py|sh|ps1|bat|cmd|sql|json|ya?ml|toml|ini|css|scss|xml|csv|tsv|svg|vue|rb|go|rs|java|c|h|cpp|cs|php|pl|lua)$/i;
function resolveTextOut(outPath, key) {
  const strip = (s) => String(s || '').replace(/[\\/]+$/, '');
  const isDir = fs.existsSync(outPath) && fs.statSync(outPath).isDirectory();
  const hasExt = /\.[a-z0-9]{2,5}$/i.test(path.basename(strip(outPath)));
  if (isDir || !hasExt) {
    const d = new Date();
    const p2 = (n) => String(n).padStart(2, '0');
    const stamp = d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '-' + p2(d.getHours()) + p2(d.getMinutes());
    return { out: path.join(strip(outPath), 'webai-' + key + '-' + stamp + '.md'), why: isDir ? '目录 ⇒ 自动命名' : '没写扩展名 ⇒ 按 md 规矩' };
  }
  const ext = path.extname(outPath);
  if (/^\.(txt|text)$/i.test(ext)) return { out: outPath.replace(/\.[a-z0-9]+$/i, '.md'), why: '.txt ⇒ 改正为 .md' };
  if (!/^\.md$/i.test(ext) && !CODEY.test(ext)) return { out: outPath, why: '⚠ 不是 .md —— 文本一律存 Markdown' };
  return { out: outPath, why: '' };
}

// 桥在正文里夹的诊断标记（[[bridge:v3.36]] / [[webai-img:…]] 等）—— 落盘前剥掉
const MARK = /\[\[(?:bridge|webai-note|webai-img|webai-img-err|webai-pick)[^\]]*\]\]/g;

async function askOnce(key, text) {
  const t0 = Date.now();
  let r;
  try {
    const res = await fetch(BASE + '/webai/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, text, timeoutMs }),
    });
    r = await res.json();
  } catch (e) {
    return { ok: false, err: '连不上桥服务 ' + BASE + '（' + e.message + '）', elapsedMs: Date.now() - t0 };
  }
  const rawText = String(r.text || '').trim();
  const clean = rawText.replace(MARK, '').trim();
  return {
    ok: !!r.ok && !!clean,
    err: r.err || (clean ? '' : '回包是空的（那个窗口可能没在跑，或站点没答完）'),
    elapsedMs: Number(r.elapsedMs || Date.now() - t0),
    raw: r,
    text: clean,
    diag: rawText.match(MARK) || [],
  };
}

if (cmd === 'list' || cmd === 'keys') {
  const r = await getJson('/webai/keys');
  const st = await getJson('/webai/state');
  console.log('可用站点（key · 名字 · 地址）：');
  for (const s of r.keys) console.log('  ' + s.key + ' · ' + s.name + ' · ' + s.url);
  console.log('\n桥服务：' + BASE + ' · 在跑的任务 ' + (st.pending || []).length + ' 个');
  console.log('登录态存在 shell/data/electron-profile/sessions/Partitions/webai-<key>/ 下（⏏ 释放内存不会掉登录）');
} else if (cmd === 'state') {
  const r = await getJson('/webai/state');
  console.log(JSON.stringify(r, null, 2));
} else if (cmd === 'who') {
  const r = await getJson('/webai/who');
  console.log(JSON.stringify(r, null, 2));
} else if (cmd === 'ask') {
  const key = String(argv.shift() || '').trim();
  if (!key) die('缺站点 key', '例：node tools/webai.mjs ask kimi "问题"（key 用 list 看）');
  let text = argv.filter((x) => typeof x === 'string').join(' ').trim();
  if (fileArg && fileArg !== true) {
    const p = String(fileArg);
    if (!fs.existsSync(p)) die('--file 指向的文件不存在：' + p);
    text = (text ? text + '\n\n' : '') + fs.readFileSync(p, 'utf8');
  }
  if (!text) die('问题是空的', '直接跟在 key 后面写，或用 --file 指向一个文件。');
  if (dry) {
    console.log('[dry] key=' + key + ' timeout=' + timeoutMs + 'ms 正文字数=' + text.length);
    console.log('--- 将要发送 ---\n' + text.slice(0, 2000));
    process.exit(0);
  }
  const t0 = Date.now();
  const r = await askOnce(key, text);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (asJson) { console.log(JSON.stringify(r.raw || r, null, 2)); process.exit(r.ok ? 0 : 1); }
  if (!r.ok) die(r.err + '（' + secs + 's）', '未登录/要过验证码/站点改版都会这样；顶栏点开那个站看一眼。');
  if (outArg && outArg !== true) {
    const { out, why } = resolveTextOut(String(outArg), key);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, r.text.endsWith('\n') ? r.text : r.text + '\n', 'utf8');
    const preview = r.text.length > 600 ? r.text.slice(0, 600) + '\n…（共 ' + r.text.length + ' 字，已截断）' : r.text;
    console.log(preview);
    console.log('\n✓ ' + key + ' 回答 ' + r.text.length + ' 字 · ' + secs + 's · 已存 ' + out + (why ? '（' + why + '）' : ''));
  } else {
    console.log(r.text);
    console.error('\n[' + key + ' · ' + secs + 's · ' + r.text.length + ' 字]');
  }
} else {
  console.log('用法：node tools/webai.mjs <list|state|who|ask> …');
  process.exit(2);
}