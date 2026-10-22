-- ============================================================
--  标准雷达 · 婴配标准变更提醒系统  数据库设计
--  适配 PostgreSQL / Supabase；SQLite 可兼容大部分语法
--  设计原则：标准元数据与提醒分离；每次抓取留快照，变更可追溯
-- ============================================================

-- ---------- 1. 官方数据源 ----------
CREATE TABLE sources (
  id              SERIAL PRIMARY KEY,
  code            TEXT UNIQUE NOT NULL,          -- SRC-01
  name            TEXT NOT NULL,                 -- 全国标准信息公共服务平台
  org             TEXT,                          -- 发布机构
  base_url        TEXT NOT NULL,                 -- 入口 URL
  crawl_type      TEXT NOT NULL,                 -- list / detail / api / single
  scope           TEXT,                          -- 覆盖范围描述
  cron            TEXT DEFAULT '0 7 * * *',      -- 抓取频率
  min_interval_h  NUMERIC DEFAULT 4,             -- 单源最小间隔（小时），防封
  priority        TEXT DEFAULT '中',             -- 高/中/低
  has_free_dl     BOOLEAN DEFAULT FALSE,         -- 官方是否提供免费下载
  enabled         BOOLEAN DEFAULT TRUE,
  last_run_at     TIMESTAMPTZ,
  last_status     TEXT,                          -- ok / delay / fail
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ---------- 2. 监控关键词 ----------
CREATE TABLE keywords (
  id           SERIAL PRIMARY KEY,
  term         TEXT NOT NULL,                    -- 关键词或标准号
  category     TEXT NOT NULL,                    -- 产品/检测/生产/体系/关联
  match_type   TEXT DEFAULT '精确',              -- 精确/模糊/通配
  priority     TEXT DEFAULT '中',                -- 高/中/低 → 决定提醒级别下限
  enabled      BOOLEAN DEFAULT TRUE,
  note         TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(term, category)
);
CREATE INDEX idx_kw_term ON keywords(term);

-- ---------- 3. 标准主表（元数据，回填官方源） ----------
CREATE TABLE standards (
  id                SERIAL PRIMARY KEY,
  std_no            TEXT UNIQUE NOT NULL,        -- GB 10765-2021（归一化：大写、空格归一）
  std_no_norm       TEXT UNIQUE NOT NULL,        -- GB10765-2021（去空格，匹配用）
  title             TEXT NOT NULL,               -- 标准名称
  category          TEXT NOT NULL,               -- product/test/prod/sys/assoc
  status            TEXT NOT NULL,               -- 现行/即将实施/废止/被代替
  is_mandatory      BOOLEAN DEFAULT FALSE,       -- 是否强制性
  publish_date      DATE,
  implement_date    DATE,
  abolish_date      DATE,
  replaces          TEXT[],                      -- 代替了哪些标准号
  replaced_by       TEXT,                        -- 被哪个标准号代替
  jurisdiction_org  TEXT,                        -- 归口单位
  issuer_org        TEXT,                        -- 发布机构
  source_id         INT REFERENCES sources(id), -- 首次发现来源
  official_url      TEXT,                        -- 官方详情页（唯一入口）
  read_url          TEXT,                        -- 官方在线阅读地址
  download_url      TEXT,                        -- 仅当 has_free_dl=true 时有值
  download_allowed  BOOLEAN DEFAULT FALSE,       -- 是否允许展示下载按钮
  copyright_note    TEXT,                        -- 版权提示语
  is_iso            BOOLEAN DEFAULT FALSE,       -- 采标类，正版购买
  first_seen_at     TIMESTAMPTZ DEFAULT now(),
  last_seen_at      TIMESTAMPTZ DEFAULT now(),
  content_hash      TEXT                         -- 详情页关键字段哈希，变了即变更
);
CREATE INDEX idx_std_cat    ON standards(category);
CREATE INDEX idx_std_status ON standards(status);
CREATE INDEX idx_std_imp    ON standards(implement_date);
CREATE INDEX idx_std_norm   ON standards(std_no_norm);

-- ---------- 4. 抓取快照（每次全量抓完存一份，diff 用） ----------
CREATE TABLE snapshots (
  id            SERIAL PRIMARY KEY,
  run_id        UUID NOT NULL,                   -- 一次抓取运行
  source_id     INT REFERENCES sources(id),
  fetched_at    TIMESTAMPTZ DEFAULT now(),
  item_count    INT DEFAULT 0,
  new_count     INT DEFAULT 0,
  changed_count INT DEFAULT 0,
  payload_path  TEXT,                            -- 原始 JSON 存档
  status        TEXT DEFAULT 'ok',
  error_msg     TEXT
);
CREATE INDEX idx_snap_run ON snapshots(run_id);

-- ---------- 5. 标准快照明细（字段级 diff 比对基准） ----------
CREATE TABLE snapshot_items (
  id            BIGSERIAL PRIMARY KEY,
  snapshot_id   BIGINT REFERENCES snapshots(id) ON DELETE CASCADE,
  std_no_norm   TEXT NOT NULL,
  std_no        TEXT,
  title         TEXT,
  status        TEXT,
  publish_date  DATE,
  implement_date DATE,
  abolish_date  DATE,
  replaced_by   TEXT,
  raw           JSONB,                           -- 该条抓到的完整字段
  row_hash      TEXT NOT NULL
);
CREATE INDEX idx_snapitem_no ON snapshot_items(std_no_norm);

-- ---------- 6. 变更事件（核心） ----------
CREATE TABLE change_events (
  id             BIGSERIAL PRIMARY KEY,
  std_id         INT REFERENCES standards(id),
  std_no         TEXT NOT NULL,
  event_type     TEXT NOT NULL,                  -- NEW/SUPERSEDE/UPCOMING/ACTIVE/ABOLISH/REVISION
  level          TEXT NOT NULL,                  -- high/mid/low
  title          TEXT NOT NULL,                  -- 一句话结论（说人话）
  what_changed   TEXT,                           -- 变了什么
  why_matters    TEXT,                           -- 为什么重要
  actions        TEXT[],                         -- 实验室要做什么
  diff_detail    JSONB,                          -- 字段级 before/after
  dedup_key      TEXT UNIQUE,                    -- 去重键：std_no+event_type+日期桶
  detected_at    TIMESTAMPTZ DEFAULT now(),
  first_notified_at TIMESTAMPTZ,                 -- 首次提醒时间
  notify_stage   TEXT DEFAULT 'none'             -- none/90d/30d（倒计时提醒阶段）
);
CREATE INDEX idx_ce_detected ON change_events(detected_at DESC);
CREATE INDEX idx_ce_std      ON change_events(std_no);
CREATE UNIQUE INDEX idx_ce_dedup ON change_events(dedup_key);

-- ---------- 7. 提醒队列（进 待办 的东西） ----------
CREATE TABLE alerts (
  id             BIGSERIAL PRIMARY KEY,
  change_id      BIGINT REFERENCES change_events(id) ON DELETE CASCADE,
  std_no         TEXT NOT NULL,
  level          TEXT NOT NULL,
  title          TEXT NOT NULL,
  body           TEXT,
  user_id        INT,                            -- 收件人
  status         TEXT DEFAULT 'unread',          -- unread/read/ignored/resolved
  read_at        TIMESTAMPTZ,
  resolved_at    TIMESTAMPTZ,
  resolve_note   TEXT,                           -- 处理记录：改了什么文件
  created_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_alert_user   ON alerts(user_id, status);
CREATE INDEX idx_alert_created ON alerts(created_at DESC);

-- ---------- 8. 用户订阅 ----------
CREATE TABLE users (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  email        TEXT,
  role         TEXT,                            -- QC/QA/实验室检测员/合规
  weekly_email BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE subscriptions (
  id            SERIAL PRIMARY KEY,
  user_id       INT REFERENCES users(id) ON DELETE CASCADE,
  category      TEXT,                            -- 产品/检测/生产/体系/关联
  keyword_id    INT REFERENCES keywords(id) ON DELETE CASCADE,
  notify_level  TEXT DEFAULT '全部',             -- 全部/仅高优
  enabled       BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, category, keyword_id)
);

-- ---------- 9. 提醒强度设置（90/30 天、周期） ----------
CREATE TABLE reminder_rules (
  id             SERIAL PRIMARY KEY,
  user_id        INT REFERENCES users(id) ON DELETE CASCADE,
  days_first     INT DEFAULT 90,                 -- 首次提醒阈值
  days_second    INT DEFAULT 30,                 -- 二次提醒阈值
  weekly_report  BOOLEAN DEFAULT TRUE,
  report_day     INT DEFAULT 1,                  -- 周一
  report_time    TEXT DEFAULT '08:00',
  push_channels TEXT[] DEFAULT ARRAY['inapp','email']
);

-- ---------- 10. 抓取日志（后台展示） ----------
CREATE TABLE crawl_logs (
  id          BIGSERIAL PRIMARY KEY,
  run_id      UUID,
  level       TEXT,                              -- ok/warn/error
  source_code TEXT,
  message     TEXT,
  cost_ms     INT,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_log_created ON crawl_logs(created_at DESC);

-- ---------- 11. 周报记录 ----------
CREATE TABLE weekly_reports (
  id           SERIAL PRIMARY KEY,
  user_id      INT REFERENCES users(id) ON DELETE CASCADE,
  period_start DATE,
  period_end   DATE,
  file_path    TEXT,                             -- 导出 PDF/Excel
  pushed_at    TIMESTAMPTZ,
  stats        JSONB,                            -- {high:3, mid:3, low:1, total:12}
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
--  常用查询
-- ============================================================

-- 每日待办：高优 + 未读 + 未处理
-- SELECT * FROM alerts WHERE status='unread' ORDER BY
--   CASE level WHEN 'high' THEN 0 WHEN 'mid' THEN 1 ELSE 2 END, created_at DESC;

-- 近 7 天更新数（首页 KPI）
-- SELECT level, COUNT(*) FROM change_events
--  WHERE detected_at >= now() - interval '7 days' GROUP BY level;

-- 30 天内即将实施（倒计时）
-- SELECT std_no, title, implement_date, implement_date - CURRENT_DATE AS days_left
--  FROM standards WHERE status='现行' AND implement_date IS NOT NULL
--  AND implement_date - CURRENT_DATE BETWEEN 0 AND 90 ORDER BY days_left;

-- 变更留痕：某标准的历史
-- SELECT * FROM change_events WHERE std_no='GB 25596' ORDER BY detected_at DESC;
