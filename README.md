# 常明 · 多场景 AI 桌面工作台

> 一条**常驻 AI 会话**配一份**写在本地的记忆**，按「场景」分开。
> 不是又一个聊天框 —— 是让 AI 记住你这摊活，而且记忆你能读、能改、能 grep 的工作台。

本机跑的 Electron 外壳 + [DeepSeek Harness](https://github.com/deepseek-ai)（DSH）引擎；记忆全是 markdown 文件，没有数据库、没有云端同步。

---

## 它解决什么

| 普通 AI 对话 | 这个工作台 |
|---|---|
| 换个窗口 / 新开会话，上下文归零 | 每个场景固定一条会话，**换窗口不换上下文** |
| 记忆在平台服务器里，看不见也改不了 | 记忆是 `data/.dsh/场景记忆/**/*.md`，能直接编辑、grep、用 git 管 |
| 一个助手干所有事，职责混在一起 | 「命令 / 翻译 / 写作…」各自一条会话 + 各自记忆 + 各自屏幕布局 |
| 工具是平台给的，加不了 | MCP：**把你登录的网页版 AI 也变成模型可调用的工具**（0 API token） |

## 三个概念

**场景（scene）** —— 一屏布局 + 一条常驻 AI 会话 + 一份私有记忆。存在 `shell/scenarios/<id>.json`，是文件，不是某个账号里的配置。

**会话（session）** —— 引擎里跑的 agent，有流式输出和工具调用。场景 json 用 `sessionId` 钉住它；换会话只改这一个字段，布局和记忆都不动（`shell/scripts/换会话.mjs`）。

**记忆（memory）** —— 三层，都是纯文本：

```
data/.dsh/场景记忆/
  命令/场景私有记忆.md    ← 这个场景的记忆（唯一真源，§〇 当前交接 ≤4 KB）
  命令/身份卡.md          ← 这场景管什么、不碰什么
  命令/场景画像.md        ← 自动生成的摘要（由记忆重算，别手改）
  命令/归档/              ← 交接时旧版挪进来
  _共享记忆/              ← 多个场景都要用的（项目、待办、跨场景通知）
```

规则很短：**只写「下一轮要知道的」**；交接才归档（`tools/场景记忆.mjs 交接`）；写完自检（`check`）。
记忆面板把这块目录画成一张可拖拽旋转的**神经元图**：节点 = 记忆区域 / 场景 / 技能 / 项目，连线 = 依赖关系，点节点看详情。

## 面板与场景

顶栏标签栏最右的 `＋` 就能新建场景：填「名字 / 英文 id / 一句话说明」，它一次做齐
写场景配置 → 建常驻 AI 会话并回写 `sessionId` → 建记忆目录 → 登记身份索引 → 写定位卡骨架。

面板类型（场景 json 里的 `type`）：

`neuron` 记忆神经元 · `harness` AI 会话 · `web` 网页版（顶栏 5 个站，登录态独立持久）· `embed` 内嵌网页 · `file` 文件 · `log` 日志 · `chart` 图表 · `flow` 流程 · `board` 看板 · `dash` 仪表盘

## 网页版 AI 当工具（MCP）

顶栏的 DeepSeek / 豆包 / 千问 / 智谱 / Kimi 不只是用来手点的：

- **当接口**：`node tools/webai.mjs ask tongyi "…"` —— 走本地桥（`127.0.0.1:31239`），用的是你手动登录的那份 cookie，不花 API token。
- **当模型工具**：`mcp/webai-mcp.mjs` 是零依赖的 stdio MCP server，引擎用 `@deepseek-ai/dsh-mcp-client` 挂上它，模型就多出 `mcp__webai_tongyi__ask` 这类工具，能自己判断「这题去问一下网页版」。

配置模板：`data/.dsh/profiles/web/cordis.patch.example.yml`（复制成 `cordis.patch.yml`，把 `<node>` / `<src>` 换成自己机器上的路径）。细节见 [使用说明](src/docs/使用说明.md) 的「六之二」。

代价说清楚：网页版**没有流式**（一次 10–60 秒）、单通道串行、受风控影响 ⇒ 适合当「第二意见」，不适合当流式主对话。

## 快速开始

**前置**

| 要什么 | 说明 |
|---|---|
| Node.js ≥ 24.9 | `node -v` |
| DSH 引擎 | 按官方方式装好，把目录（或软链）放到 `src/engine/`；`src/engine/apps/cli/lib/bin.js` 存在即可 |
| 端口空闲 | `3083` 引擎 · `31238` 界面 · `31239` 网页版桥 |

```bash
cd src

# 1) 装依赖（只需一次）
cd shell && npm install && cd ..

# 2) 启动（它会拉起自己的引擎）
./启动.sh              # Linux / macOS
启动.vbs               # Windows：双击

# 3) 建 AI 会话并回写场景（--title 要和场景显示名逐字一致）
node shell/scripts/建会话.mjs --title "命令" --bind

# 4) 生成记忆骨架 + 自检
node tools/场景记忆.mjs init --场景 命令
node shell/scripts/check-gui.mjs
node shell/scripts/sessions.mjs --check
```

AI 面板要能答话，还得在界面里配模型（右上角登录 / 填 API Key，保存在本机）。

## 目录

```
src/
  启动.sh / 启动.vbs     启动器（单实例闸门 + 心跳 + 孤儿引擎清理）
  shell/                 Electron 外壳：main.js（IPC / 窗口 / 本地桥）、renderer/（界面）、scripts/（会话与自检）
  shell/scenarios/       场景配置：一场景一个 json + 一张定位卡 + 身份索引
  tools/                 场景记忆 / 发消息 / 封装 / 发布前检查
  mcp/                   webai-mcp.mjs：网页版 → MCP 工具
  data/.dsh/             工作台数据目录（记忆 / 会话 / profile；运行时生成的都不入库）
  docs/                  使用说明、记忆约定、记忆层设计
  workspace/             agent 的工作目录（含 AGENTS.md）
```

## 常用命令

| 命令 | 干什么 |
|---|---|
| `node shell/scripts/check-gui.mjs` | 全局契约自检（布局 / 图标 / 文件白名单） |
| `node shell/scripts/sessions.mjs --check` | 场景 ↔ 会话 对照 |
| `node tools/场景记忆.mjs list` / `check --场景 命令` | 记忆清单 / 单场景体检 |
| `node tools/场景记忆.mjs 交接 --场景 命令` | 归档旧记忆并补 §〇 |
| `node shell/scripts/换会话.mjs cmd-chat --go` | 换会话（旧的交班给新的） |
| `node tools/发消息.mjs --to 命令 "内容"` | 跨场景留言（纯文件，不走网络） |
| `node shell/scripts/生成工具清单.mjs` | 重扫引擎里的工具，刷新工具面板 |
| `node shell/scripts/重置网页版存储.mjs kimi --idb` | 某站分区坏了（LevelDB LOCK 之类）时只重置它 |
| `node tools/封装.mjs --out ./dist` | 打发布包（自动排除 node_modules / 引擎 / 本机数据） |

## 它不是什么

- **不是模型**：不含引擎、不含密钥 —— 模型由 DSH 引擎 + 你自己的账号 / Key 提供。
- **不是云端服务**：没有服务器、没有账号体系，记忆和会话都在本机。
- **不做浏览器兼容**：Electron 桌面应用，Linux / Windows 为主（macOS 未测）。
- **网页版通道不是稳定 API**：答案是从页面文字里读出来的，站点改版就可能读歪；别拿它做严格 JSON 流水线。

## 许可

见 [LICENSE](LICENSE)。记忆方法论与文档版权归其作者所有。

更多细节：[src/README.md](src/README.md) · [使用说明](src/docs/使用说明.md) · [记忆约定](src/docs/记忆约定.md) · [记忆层设计](src/docs/记忆层-v2.md)