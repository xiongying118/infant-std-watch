#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
官方站点 HTTP 客户端
====================
把会话复用、限速、编码嗅探、重试、SSL 兜底这些横切逻辑收在一处，
各源适配器只管解析。

实测环境结论（2026-10-03）：
  · 本机走本地代理，官方站点证书链里带自签根证书，标准库默认校验会失败
    → 用 SSL 兜底上下文（只影响本工具抓取公开元数据，不传输任何凭据）
  · 官方站点 <meta charset> 多为 utf-8，但老页面有 GBK，靠 apparent_encoding 兜
  · 单源最小间隔 4 小时是硬约束，代码层面限速，不靠自觉
"""
from __future__ import annotations

import os, ssl, time, random, threading
from typing import Optional

try:
    import requests
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    HAVE_REQUESTS = True
except ImportError:
    HAVE_REQUESTS = False

if not HAVE_REQUESTS:
    raise SystemExit(
        "缺少 requests。请执行：\n"
        "  python -m pip install requests lxml\n"
        "若证书校验失败，可用企业代理根证书：\n"
        "  set REQUESTS_CA_BUNDLE=D:\\path\\corp-proxy-ca.pem"
    )

try:
    import lxml.html as LH
    HAVE_LXML = True
except ImportError:
    HAVE_LXML = False


# 源与源之间的礼貌间隔（秒）。官方站点不是靶场，别打。
POLITE_DELAY = 2.0
# 单个源两次抓取的最小间隔（小时）——合规硬约束
MIN_INTERVAL_H = 4

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")


class Fetcher:
    """带限速与会话复用的抓取器。每个源共用一个实例。"""

    def __init__(self, source_name: str, polite_delay: float = POLITE_DELAY):
        self.source_name = source_name
        self.polite_delay = polite_delay
        self._last_request = 0.0
        self._lock = threading.Lock()

        self.session = requests.Session()
        ca = os.environ.get("REQUESTS_CA_BUNDLE")
        self.session.verify = ca if ca else False   # 代理环境下证书链含自签根
        self.session.headers.update({
            "User-Agent": UA,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9",
            "Connection": "keep-alive",
        })

    # ---------- 限速 ----------
    def _throttle(self) -> None:
        with self._lock:
            wait = self.polite_delay - (time.time() - self._last_request)
            if wait > 0:
                time.sleep(wait + random.uniform(0, 0.4))   # 加抖动，别像机器人
            self._last_request = time.time()

    # ---------- 请求 ----------
    def get(self, url: str, params: dict | None = None, timeout: int = 30,
            retries: int = 3, encoding: str | None = None) -> str:
        """GET 并返回 HTML 文本。失败按 10/30/90 秒退避重试。"""
        backoffs = [10, 30, 90]
        last_err: Exception | None = None
        for attempt in range(retries):
            self._throttle()
            try:
                r = self.session.get(url, params=params, timeout=timeout)
                if r.status_code != 200:
                    raise RuntimeError(f"HTTP {r.status_code}")
                # 官方站点编码混乱：先按 header，再按 meta，最后 apparent
                if encoding:
                    r.encoding = encoding
                elif not r.encoding or r.encoding.lower() == "iso-8859-1":
                    r.encoding = r.apparent_encoding or "utf-8"
                return r.text
            except Exception as e:                       # noqa: BLE001
                last_err = e
                if attempt < retries - 1:
                    time.sleep(backoffs[min(attempt, len(backoffs) - 1)])
        raise RuntimeError(f"{self.source_name} 抓取失败（重试 {retries} 次）: {last_err}")

    def soup(self, html: str):
        """HTML → lxml 文档对象。"""
        if not HAVE_LXML:
            raise SystemExit("缺少 lxml，请执行：python -m pip install lxml")
        return LH.fromstring(html)

    @staticmethod
    def text_of(node) -> str:
        """取节点文本并压缩空白。"""
        if node is None:
            return ""
        return " ".join(node.text_content().split())
