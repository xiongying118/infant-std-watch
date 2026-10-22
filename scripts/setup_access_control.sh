#!/usr/bin/env bash
# ==============================================================
# 给静态站点加访问密码（Cloudflare Workers + Access）
# ==============================================================
# 为什么不直接用 GitHub Pages 加密码
#   GitHub Pages 免费版**硬性不支持**密码/认证，这是产品限制，
#   不是配置问题。别在这上面耗时间。
#
# 为什么不用 Basic Auth 塞进 HTML
#   那是纯前端，密码不进代码就等于没有，源码里放明文更是自欺欺人。
#   正确的密码验证必须发生在**服务端**。
#
# ★ 选定方案：Cloudflare Workers + Zero Trust Access ★
#   优点：真身份认证、支持邮箱白名单（只让你公司邮箱能进）、
#         不用改任何代码、免费额度够用、手机也能开。
#   代价：需要一个 Cloudflare 账号（免费），要把域名托管到 Cloudflare。
#
# 备选方案（不想动域名时用）
#   Cloudflare Workers 可以只代理一个子路径，不必托管整个域名：
#     你已有 xiongying118.github.io，
#     可以只把 new 站点的访问走 Workers 反代 + Access。
#
# 【本脚本只做校验和准备，不代你登录 Cloudflare】
#   涉及账号和 DNS 权限，必须你自己操作。
# ==============================================================

set -uo pipefail

echo "=============================================="
echo " 静态站点访问密码 · 环境自检"
echo "=============================================="
echo ""

# --- 1. 检查当前站点 ---
echo "[1] 当前公开站点"
SITE="https://xiongying118.github.io/infant-std-watch/"
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$SITE" 2>/dev/null || echo "000")
if [ "$CODE" = "200" ]; then
  echo "    $SITE"
  echo "    状态 HTTP $CODE —— 当前公开可访问"
else
  echo "    状态 HTTP $CODE（可能网络受限）"
fi
echo ""

# --- 2. 列出将要被保护的内容 ---
echo "[2] 放什么进去决定要不要加密码"
echo ""
echo "    公开（无需密码）—— 标准雷达现有内容："
echo "      · 327 条国家标准元数据（编号/名称/状态/实施日期）"
echo "      · 42 部法规、15 条标准勘误"
echo "      · 官方公告、订阅清单"
echo "    ↑ 这些本来就是公开信息，公开反而方便同事在外网查"
echo ""
echo "    需要密码 —— QA/QE 新增内容："
echo "      · 供应商名录与审核记录"
echo "      · 历史检验数据（批次/结果/规格限）"
echo "      · 内审不符合项与整改闭环"
echo "      · 人员资质、培训矩阵"
echo "      · HACCP 计划、CCP 监控记录"
echo "    ↑ 含商业敏感信息，绝不能公开"
echo ""

# --- 3. 输出方案对比 ---
echo "[3] 三个方案对比"
echo ""
echo "    方案 A：保持现状，只把新系统另开带密码的站  ★推荐"
echo "      标准雷达继续公开（同事外网可查，方便）"
echo "      QA/QE 系统单独部署 + Cloudflare Access 保护"
echo "      两者互不影响"
echo ""
echo "    方案 B：整个站点都加密码"
echo "      所有内容都需登录才能看"
echo "      外部同事/领导访问会麻烦"
echo ""
echo "    方案 C：迁到内网服务器"
echo "      数据完全不出公司网络，最安全"
echo "      但需要一台常开的机器 + 内网穿透或 VPN"
echo ""

echo "[4] 接下来要做的"
echo ""
echo "    选 A 或 B → 走 Cloudflare Workers + Access"
echo "      1. 注册 Cloudflare（免费）cloudflare.com"
echo "      2. 把 xiongying118.github.io 加为自定义域并托管"
echo "      3. 在 Zero Trust 里建 Access 应用，只放行公司邮箱"
echo "      4. Workers 里把请求反代到 GitHub Pages"
echo "      → 之后访问需登录 + 邮箱验证，密码我不用碰"
echo ""
echo "    选 C → 告诉我你们的网络环境（有没有常开的服务器）"
echo "      我直接给部署方案"
echo ""
echo "=============================================="
echo " 说明：以上操作都涉及账号和 DNS 权限，必须你自己来。"
echo " 我可以帮你做的：改站点内容、拆分成两个站、准备配置文件。"
echo "=============================================="
