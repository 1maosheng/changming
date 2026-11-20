#!/usr/bin/env bash
# 启动.sh —— Linux 下的启动入口（原仓库只提供 Windows 的 启动.vbs）
# 说明：只是入口替换，不改任何原有逻辑；环境变量都是 main.js 本来就支持的。
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 引擎：本夹的 engine/（可以是软链到已装的 DSH 引擎）
export DSH_HARNESS_DIR="${DSH_HARNESS_DIR:-$HERE/engine}"
# 数据隔离：这套工作台自己的 .dsh（会话 / 记忆 / 技能都落这里，不污染引擎目录）
export DSH_CUSTOMER_HOME="${DSH_CUSTOMER_HOME:-$HERE/data/.dsh}"
# 用系统 node 拉起引擎（否则 Electron 会以 ELECTRON_RUN_AS_NODE 方式跑）
export DSH_NODE="${DSH_NODE:-$(command -v node || true)}"

# ---- 单实例闸门（2026-11-20）----
# 为什么放在这里而不是只靠 main.js 的 requestSingleInstanceLock：
#   JS 要等 Chromium 起来之后才执行，第二个进程在那之前就已经去初始化 userData 下各 partition 的
#   IndexedDB 了，于是日志里刷一串 `Failed to open LevelDB database … /LOCK`（用户会以为坏了）。
#   flock 在进程启动前就拦住，第二个进程连 profile 都不碰。
STATE="$HERE/shell/data"
LOCK="$STATE/.run.lock"
PIDF="$STATE/.run.pid"
BEAT="$STATE/.run.beat"      # main.js 每 5 秒写一次（心跳：证明"活着"而不是"卡住了"）
FOCUS="$STATE/.focus.req"    # 我们写、main.js 看到就把窗口提到前台
mkdir -p "$STATE"
exec 9>"$LOCK"
# 先等一下再判定：用户常常是"刚关掉就再点一次"，那几秒里旧进程还在收尾（锁还没放）。
# 无条件等 3 秒太笨，这里只在拿不到锁时才等 —— 拿得到就是立刻启动，没有额外延迟。
if ! flock -w 3 9; then
  # 有人在跑（或有人卡在退出里）——先看心跳再决定：置顶 vs 清理
  if [ -f "$BEAT" ]; then age=$(( $(date +%s) - $(stat -c %Y "$BEAT" 2>/dev/null || echo 0) )); else age=99999; fi
  if [ "$age" -le 15 ]; then
    : > "$FOCUS"
    echo "[启动] 已经在运行（${age}s 前还有心跳）—— 已请求把它提到前台，本次不再启动第二份。"
    exit 0
  fi
  echo "[启动] 上次的实例没有心跳了（${age}s 前）——它可能卡在退出中，正在清理…"
  oldpid="$(cat "$PIDF" 2>/dev/null || true)"
  case "$oldpid" in ''|*[!0-9]*) oldpid='' ;; esac
  if [ -n "$oldpid" ]; then
    kill -TERM "$oldpid" 2>/dev/null || true
    for _ in 1 2 3 4 5 6; do sleep 0.4; flock -n 9 && break; done
    if ! flock -n 9; then kill -KILL "$oldpid" 2>/dev/null || true; sleep 1; fi
  fi
  if ! flock -n 9; then
    echo "[启动] 锁仍被占用，没敢继续（可能是另一个用户或用例）。排查：ps -ef | grep -i electron"
    exit 1
  fi
  echo "[启动] 已清理，继续启动。"
fi
echo $$ > "$PIDF"                      # exec 之后同一个 pid 就是 Electron 主进程
: > "$BEAT"

# ---- 孤儿引擎清理（2026-11-20）----
# 引擎是壳的子进程，但旧版 killServer() 只调 Windows 的 taskkill ⇒ Linux 上引擎不随壳退出。
# 后果不是"多占点内存"这么轻：它占住 DSH_PORT，下次启动 main.js 会把它当成「别人拉起的引擎」
# 直接复用 ⇒ 改了 profile / 新装的 MCP 插件全部不生效（实测在 3083 上卡了两小时才查出来）。
# 只收拾**父进程已经死了**的那种（父 pid 为空或 1）；用户自己另开的引擎不动。
# 想保留孤儿：DSH_KEEP_ENGINE=1 ./启动.sh
ENGINE_PORT="${DSH_PORT:-3083}"
if [ "${DSH_KEEP_ENGINE:-0}" != "1" ] && command -v pgrep >/dev/null 2>&1; then
  reaped=""
  for p in $(pgrep -f "bin\.js web .*--port ${ENGINE_PORT}" 2>/dev/null || true); do
    if [ "$p" = "$$" ]; then continue; fi
    pp="$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ' || true)"
    if [ -z "$pp" ] || [ "$pp" = "1" ]; then
      echo "[启动] 端口 ${ENGINE_PORT} 上有个没人管的旧引擎（pid $p）——先收掉它，否则新壳会复用它，profile / 插件改动不生效。"
      kill -TERM "$p" 2>/dev/null || true
      reaped="$reaped $p"
    fi
  done
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    [ -z "$reaped" ] && break
    sleep 0.3
    alive=""
    for p in $reaped; do if kill -0 "$p" 2>/dev/null; then alive="$alive $p"; fi; done
    [ -z "$alive" ] && break
    reaped="$alive"
    for p in $reaped; do kill -KILL "$p" 2>/dev/null || true; done
  done
fi

cd "$HERE/shell"
exec ./node_modules/.bin/electron . "$@"