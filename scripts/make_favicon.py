# -*- coding: utf-8 -*-
"""生成 prototype/favicon.svg —— 盾牌标志（和顶栏 logo 一致）
   顺便让浏览器不再去请求 /favicon.ico（那是 404）"""
import io, os

SVG = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2563eb"/>
      <stop offset="1" stop-color="#0ea5e9"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="#f1f5f9"/>
  <path d="M32 8 L52 15 V32 C52 44 43 53 32 57 C21 53 12 44 12 32 V15 Z"
        fill="url(#g)"/>
  <path d="M23 32 L29 39 L42 24" fill="none" stroke="#fff"
        stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
'''

p = os.path.join('prototype', 'favicon.svg')
io.open(p, 'w', encoding='utf-8', newline='').write(SVG)
print('已生成', p, len(SVG), '字节')
