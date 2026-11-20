#!/usr/bin/env node
// 重置网页版站点在本机的存储（登录态之外的那一层：IndexedDB / 整个分区）
//
// 为什么需要：Chromium 的 IndexedDB 是磁盘上的 LevelDB。应用被强杀（kill -9 / 崩溃 / 两个实例抢同一份
// profile）之后，日志里会反复出现
//   Failed to open LevelDB database from …/Partitions/webai-kimi/IndexedDB/https_www.kimi.com_0.indexeddb.leveldb
//   IO error: …/LOCK: No further details.
// 此后该站点的 indexedDB.open() 永远 UnknownError，页面看着正常、但依赖 IndexedDB 的功能（部分站点的
// 登录态缓存 / 会话历史）会坏掉。把那个目录挪走让 Chromium 重新建库即可恢复。
//
// 用法（必须在应用关闭时运行）：
//   node scripts/重置网页版存储.mjs --list              # 看每个站点各占多大
//   node scripts/重置网页版存储.mjs kimi --idb          # 只挪 IndexedDB（推荐，不动 cookie / localStorage）
//   node scripts/重置网页版存储.mjs kimi --all          # 整个分区（等于该站点彻底回到未登录状态）
//   加 --dry 只打印不动手
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHELL = path.resolve(HERE, '..');
const PARTS = path.join(SHELL, 'data', 'electron-profile', 'sessions', 'Partitions');
const LOCK = path.join(SHELL, 'data', '.run.lock');   // 与 启动.sh 的闸门同一个文件
const KEYS = ['deepseek', 'doubao', 'tongyi', 'chatglm', 'kimi'];

const argv = process.argv.slice(2);
const dry = argv.includes('--dry');
const all = argv.includes('--all');
const site = argv.find((a) => !a.startsWith('--'));
const human = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n > 1024 ? (n / 1024).toFixed(0) + ' KB' : n + ' B');
const sizeOf = (p) => {
  try {
    const st = fs.statSync(p);
    if (!st.isDirectory()) return st.size;
    return fs.readdirSync(p).reduce((s, f) => s + sizeOf(path.join(p, f)), 0);
  } catch { return 0; }
};

if (!fs.existsSync(PARTS)) {
  console.error('✗ 找不到分区目录：' + PARTS + '\n  先启动一次应用再说。');
  process.exit(1);
}

if (argv.includes('--list') || !site) {
  console.log('分区目录：' + PARTS + '\n');
  for (const k of KEYS) {
    const dir = path.join(PARTS, 'webai-' + k);
    if (!fs.existsSync(dir)) { console.log('  ' + k.padEnd(9) + '（没建过）'); continue; }
    const idb = sizeOf(path.join(dir, 'IndexedDB'));
    console.log('  ' + k.padEnd(9) + '分区 ' + human(sizeOf(dir)).padStart(9) + '   IndexedDB ' + human(idb).padStart(9));
  }
  console.log('\n重置某个站点：node scripts/重置网页版存储.mjs <' + KEYS.join('|') + '> --idb');
  process.exit(0);
}

if (!KEYS.includes(site)) {
  console.error('✗ 不认识的站点：' + site + '（可用：' + KEYS.join(' / ') + '）');
  process.exit(1);
}

// 应用开着的时候动这些目录没有意义（它会把文件锁住，挪走了也还在内存里用着）
const held = (() => {
  if (process.platform !== 'linux') return false;
  const r = spawnSync('flock', ['-n', LOCK, 'true'], { stdio: 'ignore' });
  if (r.error) return false;              // 没有 flock 命令就跳过这道检查
  return r.status !== 0;                  // 0 = 能拿到锁 = 应用没跑
})();
if (held) {
  console.error('✗ 应用正在运行，先关掉它再重置（否则文件被占用，挪走了也不生效）。');
  process.exit(1);
}

const partDir = path.join(PARTS, 'webai-' + site);
if (!fs.existsSync(partDir)) {
  console.error('✗ 这个站点还没建过分区：' + partDir);
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupRoot = path.join(SHELL, 'data', 'electron-profile', 'sessions', 'Partitions', '_重置备份', site + '-' + stamp);
const targets = all ? [{ from: partDir, to: path.join(backupRoot, 'partition') }]
  : [{ from: path.join(partDir, 'IndexedDB'), to: path.join(backupRoot, 'IndexedDB') }];

let moved = 0;
for (const t of targets) {
  if (!fs.existsSync(t.from)) { console.log('· 跳过（不存在）：' + t.from); continue; }
  const sz = sizeOf(t.from);
  if (dry) { console.log('· 会挪走：' + t.from + '（' + human(sz) + '）→ ' + t.to); continue; }
  fs.mkdirSync(path.dirname(t.to), { recursive: true });
  fs.renameSync(t.from, t.to);
  console.log('✓ 已挪走：' + path.relative(SHELL, t.from) + '（' + human(sz) + '）');
  moved++;
}
if (dry) { console.log('\n（--dry：什么都没动）'); process.exit(0); }
if (!moved) { console.log('\n没有可挪的东西。'); process.exit(0); }
console.log('\n备份在：' + path.relative(SHELL, backupRoot));
console.log('下次启动该站点会重新建库。想反悔：把备份目录挪回原位（先关应用）。');