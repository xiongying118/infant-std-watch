/** 提取 index.html 里最长的**内联** script 正文。

 * ★ 踩过的坑（三个都踩了）★
 * 1) 用「最后一个结束标签往前找开始标签」→ 页里有
 *    script src="data.js" 自闭合对，会把整页 DOCTYPE 圈进来。
 * 2) 用正则 lastIndex 当游标 → 匹配位置回退时 lastIndex 被重置，
 *    正文开头被吃掉（提取出 3536字符，注释的/* 都没了）。
 * 3) 用 `html.indexOf('</script')` 找结束 → script 内容是 **raw text**，
 *    结束标签是唯一能结束它的东西，规则本身对，但要和 1/2 配套。
 *
 * 正确做法：顺序配对 + 手动推进游标，只取没有 src 的块，取最长的。
 * 用 node --check 验过：提取结果能通过语法检查。 */
function extractInlineScript(src) {
  const openRe = /<script(\s[^>]*)?>/gi;
  const closeRe = /<\/\s*script\s*>/i;
  const blocks = [];
  let pos = 0;
  while (pos < src.length) {
    openRe.lastIndex = pos;
    const m = openRe.exec(src);
    if (!m) break;
    const bodyStart = openRe.lastIndex;
    const c = closeRe.exec(src.slice(bodyStart));   // 从正文起找第一个结束标签
    if (!c) break;
    const body = src.slice(bodyStart, bodyStart + c.index);
    if (!/\ssrc\s*=/i.test(m[1] || '')) blocks.push(body);
    pos = bodyStart + c.index + c[0].length;
  }
  blocks.sort((a, b) => b.length - a.length);
  return blocks[0] || '';
}

/** 切到 marker 之前（marker 不存在则原样返回）。
 *  ★ 切点必须晚于被测函数 ★
 *  页面里 offLink / postJump / officialUrl 定义在 REFGROUPS 常量**之后**，
 *  切在 'const REFGROUPS =' 会把它们一起切掉，
 *  报 "offLink is not defined" —— 看起来像页面缺函数，其实是切早了。 */
function sliceBefore(src, marker) {
  const i = src.indexOf(marker);
  return i > 0 ? src.slice(0, i) : src;
}
module.exports = { extractInlineScript, sliceBefore };