#!/usr/bin/env bash
# ==============================================================
# 一键推送到 GitHub（配合 GitHub Actions 云端定时）
# ==============================================================
# 用途
#   把本地仓库推到 GitHub，让 GitHub Actions 每天自动抓官方源、
#   更新 data.js 并部署 Pages。这样电脑关不关机都不影响。
#
# 为什么不走WorkBuddy 的 GitHub 连接器
#   连接器统一管着129 个 MCP 服务器（~/.workbuddy/connectors/default/mcp.json），
#   会话里显示"已连接"但磁盘配置仍是 disabled:true，工具没注入，
#   手改那个文件风险与收益不成比例。git + token 是标准做法，长期稳定。
#
# 用法
#   export GITHUB_TOKEN='ghp_xxxx'
#   export GITHUB_USER=xiongying118# 可省，有默认值
#   bash scripts/push_to_github.sh
#
# token 权限：classic token 勾 public_repo 即可
#   https://github.com/settings/tokens
#   推完请去那里删掉该token（它只显示一次，贴进对话记录过就该作废）。
# ==============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_NAME="${REPO_NAME:-infant-std-watch}"
USER="${GITHUB_USER:-xiongying118}"
REMOTE="https://github.com/${USER}/${REPO_NAME}.git"

cd "$ROOT"

# --- 0. 前置检查 -------------------------------------------------------
if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "[x] 未设置 GITHUB_TOKEN"
  echo ""
  echo "    到 https://github.com/settings/tokens 生成classic token，"
  echo "    勾选 public_repo 权限即可。然后执行："
  echo ""
  echo "      export GITHUB_TOKEN='ghp_你的token'"
  exit 1
fi

# --- 凭据：免交互，且不把 token 写进 .git/config ----------------------
# 这里踩了三个坑，逐个记一下：
#
#  1. `credential.helper=store -f <file>` 不行——git 会把它当成
#     `git push -c ...`，而 push 不支持 -c（只有 fetch 支持），
#     报 "unknown switch `c'"。
#  2. `git push -c key=val` 也不行，push 压根不接受 -c。
#     只有全局的 `git -c key=val git push` 才行，但那样又没法
#     把参数只作用于这一条命令。
#  3. helper 是 shell 函数时，里面的 $1 会被 `set -u` 判为
#     unbound variable 直接中止。
#
# 正解是 GIT_ASKPASS：git 需要凭据时会调这个程序，
# 读 password=$GITHUB_TOKEN 即可。它是 env 而非 git 参数，
# 所以 push / ls-remote 都吃，也不会污染 .git/config。
ASKPASS="$(mktemp)"
trap 'rm -f "$ASKPASS"' EXIT
cat > "$ASKPASS" <<'APEOF'
#!/usr/bin/env bash
case "${1:-}" in
  Username*) echo "x-access-token" ;;
  Password*) echo "${GITHUB_TOKEN:-}" ;;
esac
APEOF
chmod +x "$ASKPASS"
export GIT_ASKPASS="$ASKPASS"
export GIT_TERMINAL_PROMPT=0

# --- 1. 仓库是否已存在 -------------------------------------------------
# ★ 原来用「git ls-remote 输出是否为空」判断，踩过坑：
#   **空仓库的 ls-remote 本来就返回空输出**，跟"仓库不存在"无法区分，
#   于是第二次跑又走新建，撞 422 name already exists。
#   改用 API 判存在：200 = 存在，404 = 不存在。语义唯一。
echo "-- 检查远端仓库"
API_CODE="$(curl -s -o /dev/null -w '%{http_code}' \
  "https://api.github.com/repos/${USER}/${REPO_NAME}" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json")"

if [ "$API_CODE" = "200" ]; then
  echo "   远端已存在，直接推送"
else
  echo "   远端不存在（API $API_CODE），新建"
  code="$(curl -s -o /tmp/_gh_resp.json -w '%{http_code}' \
    -X POST "https://api.github.com/user/repos" \
    -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    -d "{\"name\":\"${REPO_NAME}\",\"private\":false,\"auto_init\":false,\"description\":\"婴幼儿配方乳粉官方标准变更提醒 — 云端每日自动抓取官方源\"}")"
  if [ "$code" = "201" ]; then
    echo "   [OK] 已创建公开仓库 https://github.com/${USER}/${REPO_NAME}"
  else
    echo "   [x] 创建失败 HTTP $code"
    head -c 400 /tmp/_gh_resp.json
    echo ""
    echo "   常见原因：token 缺 public_repo 权限，或仓库名已被占用。"
    echo "   若名称冲突，改名重跑： REPO_NAME=另一个名字 bash scripts/push_to_github.sh"
    exit 1
  fi
fi

# --- 2. 配置远端 -------------------------------------------------------
git remote remove origin 2>/dev/null || true
git remote add origin "$REMOTE"
git branch -M main

# --- 3. 推送 -----------------------------------------------------------
echo "-- 推送代码"
git add -A
if git diff --cached --quiet; then
  echo "   本地无新提交，跳过 commit"
else
  git -c core.autocrlf=false commit -q -m "feat: 云端定时检查（GitHub Actions）+ 条数断崖守卫

- daily-check.yml：每天两次 UTC 定时抓取，check/deploy 两段式闸门
- sanity_guard.py：条数合理性检查，防源改版导致静默推坏数据
- node 路径改为三级回退，兼容 Linux CI runner"
fi
git push -u origin main

unset GITHUB_TOKEN

# --- 4. 后续手动步骤 ---------------------------------------------------
cat <<'EOF'

[OK] 推送完成

接下来在 GitHub 网页点两下（这步没法代劳）：

1) 开 Pages
   https://github.com/<你的账号>/infant-std-watch/settings/pages
   Source 选 "GitHub Actions"，保存。
   不开这步，Actions 会在 deploy 那一步报错。

2) 手动触发一次，验证全链路
   仓库的 Actions 标签页 -> 选 "每日官方标准检查" -> "Run workflow"
   约 4~6 分钟。两个 job 都变绿即成功。

跑通后站点地址：
   https://<你的账号>.github.io/infant-std-watch/

提醒：Actions 定时任务有 5~15 分钟排队延迟，属正常现象。
EOF