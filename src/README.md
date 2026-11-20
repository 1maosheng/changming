# 常明

一套跑在本机的 **常明**：把日常的活分成「场景」，每个场景一条常驻 AI 会话 + 一份写在本地的记忆。
不是聊天工具，是「让 AI 记住你这摊活」的一套工作方式。

> 本包只提供**工作台层**（界面 + 场景 + 记忆约定 + 工具）。AI 引擎请自行安装 DSH。

## 场景

| 场景 | 干什么 |
|---|---|
| **命令** | 总览：记忆网络（谁跟谁有关）+ AI 助手 |

内置就这一个场景，够把整套机制跑起来。想加自己的场景，看文末「加一个场景」。

## 跑之前先确认三件事

| 检查 | 要求 | 不满足会怎样 |
|---|---|---|
| Node.js | **24.9+**（`node -v` 能看到版本） | 引擎起不来或 `npm install` 报错 |
| DSH 引擎 | 目录放在**本夹的 `engine/`**（和 `shell/` 同级，名字就叫「引擎」） | 启动后停在「引擎启动失败 100%」 |
| 端口 | `3083`（引擎）/ `31238`（界面）/ `31239`（网页版 AI 桥）没被占用 | 白屏、一直重试 |

> 引擎不是本包自带的：按 DSH 官方方式装好一份，把整个目录放成 `src/engine/` 即可
> （`engine/apps/cli/lib/bin.js` 存在就算对）。

## 快速开始

```bash
# 0) 确认引擎已就位
ls engine/apps/cli/lib/bin.js

# 1) 装依赖（只需一次）
cd shell && npm install && cd ..

# 2) 启动（拉起自己的引擎，端口 3083）
./启动.sh          # Linux / macOS
启动.vbs           # Windows：双击

# 3) 给带 AI 的面板建会话并写回（--title 要和场景里显示的名字逐字一致）
node shell/scripts/建会话.mjs --title "命令" --bind

# 4) 体检
node shell/scripts/sessions.mjs --check
```

第一次用直接跑 `node tools/场景记忆.mjs init --场景 命令`：记忆目录不存在时它会照着身份索引自己建，然后生成身份卡/画像。

## 记忆机制（这套工作台的核心）

```
data/.dsh/场景记忆/
  命令/场景私有记忆.md    ← 这个场景的记忆（唯一真源）
  命令/_文件索引.md       ← 它有哪些文件
  命令/归档/             ← 交接时旧版挪进这里
  _共享记忆/             ← 多个场景都要用的东西
```

- §〇 当前交接 **≤4 KB**：只写「下一轮要知道的」
- 交接才归档：`node tools/场景记忆.mjs 交接 --场景 命令`
- 自检：`node tools/场景记忆.mjs check --场景 命令`
- 换会话（把旧会话交班给新会话）：`node shell/scripts/换会话.mjs cmd-chat --go`
- 跨场景留言：`node tools/发消息.mjs --to 命令 "帮我看下这个"`（纯文件，不发网络请求）

细节看 `docs/记忆约定.md`。

## 目录

```
shell/            工作台界面（Electron）
data/.dsh/   这套工作台自己的数据（会话/记忆/技能/plugins）
tools/            记忆、发消息、封装、发布前检查
docs/            记忆约定、使用说明
启动.sh          启动器（Linux / macOS，端口 3083）
启动.vbs         启动器（Windows，双击）
```

## 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| 启动后「引擎启动失败 100%」 | `engine/` 不存在或路径不对 | 确认 `engine/apps/cli/lib/bin.js` 存在 |
| 界面白屏 / 一直重试 | 端口被占用（常见：开了两个壳） | 关掉另一个实例，或先杀 3083/31238 上的进程 |
| `npm install` 卡住/报错 | 网络或 Node 太旧 | 换镜像 `npm config set registry https://registry.npmmirror.com`；Node 升到 24.9+ |
| AI 面板「未连接」 | 没配模型/账号 | 点右上角「登录」或填 API Key（保存在本地） |
| 记忆面板显示 0 个区域 | 记忆目录不在 `data/.dsh/场景记忆` | 用 `./启动.sh` 启动（它会把数据目录指对）；别直接 `electron .` |
| 想换端口 | 默认 3083 / 31238 | shell/main.js 顶部 `DSH_PORT` / `SITE_PORT`，两个都改 |

## 网页版当工具（MCP，可选）

`mcp/webai-mcp.mjs` 是零依赖的 stdio MCP server：引擎挂上它以后，模型就多了 `mcp__webai_<站>__ask`。
把 `data/.dsh/profiles/web/cordis.patch.example.yml` 复制成 `cordis.patch.yml`，把 `<node>` / `<src>` 换成自己的路径即可。
细节（含四条脾气）见 `docs/使用说明.md` 的「六之二」。

## 打包带走

```bash
node tools/封装.mjs --out ./dist
```

生成 `发布包-常明-<版本>-<日期>.zip` + `SHA256SUMS`，自动排除 node_modules / 引擎 / 本机数据。

## 加一个场景

**界面**：顶栏标签栏最右点 `＋`，填名字 / 英文 id / 一句话说明 —— 它会把下面 1–5 步全做完
（写 json、建会话并回写 `sessionId`、建记忆目录、登记身份索引、写定位卡骨架），成功后直接切过去。

**命令行**：

1. 复制一份 `shell/scenarios/command.json`，改 `id` / `name` / `panels`（布局用 `cols` + 每块的 `w`×`h`）
2. 写定位卡 `shell/scenarios/<id>-context.md`（这场景管什么、不碰什么）
3. `node tools/场景记忆.mjs init --场景 <名字>`
4. `node shell/scripts/建会话.mjs --title "<名字>" --bind`，id 自动写回场景 json
5. 在 `shell/scenarios/_场景身份索引.md` 加一行
6. `node shell/scripts/sessions.mjs --check` 过了就点顶栏 ⟳

## 许可

见 `LICENSE`。本包内的记忆方法论与文档版权归其作者所有。

## 说明

- 不含引擎、不含密钥、不含任何真实用户数据
- 数据目录可用环境变量覆盖：`DSH_HARNESS_DIR`（引擎目录）、`DSH_HOME`（.dsh 数据）、`DSH_GUI_BASE`（默认 `http://127.0.0.1:3083`）