#!/usr/bin/env node
// 生成 shell/data/工具清单.json（右上角「工具（Tools）」面板的数据源）
//
// 为什么要有这个脚本：面板只读一个 json，而"这个引擎到底装了什么工具"只有引擎自己知道。
// 引擎没有 CLI 能列工具，所以这里做**静态扫描**：把引擎源码里所有 packages/**/tool-* 的
// package.json 收一遍，用下面的中文对照表补人话，按用途分组写进 json。
//
// 局限（写清楚，免得以后当成"引擎实时状态"）：
//   · 只反映**引擎代码里有这些包**，不反映当前 profile 是否挂载、MCP 是否开启
//   · 引擎升级/删包后要重跑：node shell/scripts/生成工具清单.mjs
//   · MCP 工具（mcp__xxx__yyy）不在这里，它们在右上角「MCP」面板里管
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHELL = path.dirname(HERE);                 // <工作台>/src/shell
const PROJECT = path.dirname(SHELL);              // <工作台>/src
const ENGINE = process.env.DSH_ENGINE_DIR || path.join(PROJECT, 'engine');
const OUT = path.join(SHELL, 'data', '工具清单.json');

// 工具名 / 一句话（对照引擎包名；没有对照的包会退回包描述，不会凭空编名字）
const CN = {
  'tool-fs': { names: ['read', 'write', 'edit', 'read_image'], plain: '读写文件：整篇读、整段替换、按行改' },
  'tool-fs-search': { names: ['glob', 'grep'], plain: '找文件（按路径通配）/ 搜内容（按正则）' },
  'tool-str-replace-editor': { names: ['str_replace_editor'], plain: '按行号/字符串编辑文件（编辑器式）' },
  'tool-bash': { names: ['bash'], plain: '跑一条 shell 命令，拿 stdout/stderr 和退出码' },
  'tool-bash-persistent': { names: ['bash_persistent'], plain: '常驻 shell 会话：cd/变量跨命令保留' },
  'tool-pwsh': { names: ['pwsh'], plain: '跑一条 PowerShell 命令（Windows）' },
  'tool-pwsh-persistent': { names: ['pwsh_persistent'], plain: '常驻 PowerShell 会话' },
  'tool-terminal': { names: ['terminal'], plain: '开/读/关交互式终端会话' },
  'tool-jobs': { names: ['job_list', 'job_output', 'job_kill'], plain: '后台任务：列出来 / 读输出 / 杀掉' },
  'tool-todo': { names: ['todo_write'], plain: '任务清单：多步计划、标进行中、打勾' },
  'tool-goal': { names: ['create_goal', 'get_goal', 'update_goal'], plain: '长跑目标：跨轮次自动续跑，可暂停/完成' },
  'tool-subagent': { names: ['subagent', 'subagent_fork'], plain: '派子代理干独立活（自带上下文，只回结果）' },
  'tool-subagent-control': { names: ['list_agents', 'send_message', 'interrupt_agent'], plain: '管子代理：列/追问/打断' },
  'tool-agent-team': { names: ['agent_team'], plain: '多代理小队协作' },
  'tool-workflow': { names: ['workflow'], plain: '用 JS 脚本编排一大批子代理（扇出/流水线）' },
  'tool-ralph': { names: ['ralph'], plain: '反复自我迭代直到达标' },
  'tool-schedule': { names: ['schedule_create', 'schedule_update', 'schedule_delete', 'schedule_list'], plain: '定时提醒：几分钟后 / 每天 / 每周 / cron' },
  'tool-session-query': { names: ['session_query'], plain: '翻历史会话记录' },
  'tool-web': { names: ['web_search', 'web_fetch'], plain: '联网搜 / 抓网页正文' },
  'tool-lsp': { names: ['lsp'], plain: '语言服务：跳定义、找引用、看诊断' },
  'tool-ask-user': { names: ['ask_user_question'], plain: '拿不准时反问用户（给选项）' },
  'tool-present': { names: ['present'], plain: '把文件登记成"交付物"给用户看' },
  'tool-skill': { names: ['skill'], plain: '加载技能（预设的操作手册）' },
  'tool-cordis': { names: ['cordis'], plain: '查/改引擎自身插件树' },
  'tool-worktree': { names: ['worktree'], plain: 'git worktree 隔离开发' },
  'tool-workspace-dependencies': { names: ['workspace_dependencies'], plain: '装/查项目依赖' },
  'tool-working-directory': { names: ['working_directory'], plain: '读/切当前工作目录' },
};

// 分组（按包所在目录；没列到的进「其他」）
const GROUPS = [
  ['文件与检索', 'tool-fs|tool-fs-search|tool-str-replace-editor'],
  ['终端与后台', 'tool-bash|tool-bash-persistent|tool-pwsh|tool-pwsh-persistent|tool-terminal|tool-jobs'],
  ['任务 / 子代理 / 编排', 'tool-todo|tool-goal|tool-subagent|tool-subagent-control|tool-agent-team|tool-workflow|tool-ralph|tool-schedule|tool-session-query'],
  ['网页与代码智能', 'tool-web|tool-lsp'],
  ['交互与其他', 'tool-ask-user|tool-present|tool-skill|tool-cordis|tool-worktree|tool-workspace-dependencies|tool-working-directory'],
];

function findPkgs(dir, out = []) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    if (!e.isDirectory() || e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (/^tool-/.test(e.name) && fs.existsSync(path.join(full, 'package.json'))) {
      try { out.push({ dir: e.name, pkg: JSON.parse(fs.readFileSync(path.join(full, 'package.json'), 'utf8')) }); } catch {}
      continue;
    }
    // 引擎是 packages/<类别>/<包>：往下找一层就够，别递归太深
    if (path.relative(ENGINE, full).split(path.sep).length <= 2) findPkgs(full, out);
  }
  return out;
}

const pkgs = findPkgs(ENGINE).filter((p) => /dsh-tool-/.test(p.pkg.name || ''));
const seen = new Set();
const items = [];
for (const p of pkgs) {
  if (seen.has(p.dir)) continue;
  seen.add(p.dir);
  const cn = CN[p.dir];
  items.push({
    dir: p.dir,
    name: cn && cn.names.length ? cn.names.join(' / ') : p.dir,
    plain: (cn && cn.plain) || (p.pkg.description || '').split(/[.;]/)[0] || '（引擎内置工具）',
    where: 'engine/packages/**/' + p.dir,
  });
}

const used = new Set();
const groups = GROUPS.map(([title, re]) => {
  const rx = new RegExp('^(?:' + re.replace(/\|/g, '$|^') + ')$');
  const got = items.filter((it) => rx.test(it.dir));
  got.forEach((it) => used.add(it.dir));
  return {
    title,
    note: got.length + ' 个',
    sections: [{ title: '', items: got.map((it) => ({ name: it.name, tag: '', plain: it.plain, where: it.where })) }],
  };
}).filter((g) => g.sections[0].items.length);

const rest = items.filter((it) => !used.has(it.dir));
if (rest.length) {
  groups.push({ title: '其他', note: rest.length + ' 个', sections: [{ title: '', items: rest.map((it) => ({ name: it.name, tag: '', plain: it.plain, where: it.where })) }] });
}

const total = groups.reduce((a, g) => a + g.sections.reduce((b, s) => b + s.items.length, 0), 0);
const d = new Date();
const p2 = (n) => String(n).padStart(2, '0');
const out = {
  updated: `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`,
  engine: path.relative(PROJECT, ENGINE) || ENGINE,   // 相对路径：清单要能进公开仓，别写死本机目录
  note: '静态扫描引擎源码（packages/**/tool-*）；不反映 profile 是否挂载、MCP 是否开启。引擎升级后重跑本脚本。',
  groups,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
console.log(`✓ ${total} 个工具 / ${groups.length} 组 → ${path.relative(process.cwd(), OUT)}`);