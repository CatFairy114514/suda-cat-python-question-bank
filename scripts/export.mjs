import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const chapterDirectory = new URL("chapters/", root);
const chapterNames = {
  C01: "语言概述", C02: "基础语法", C03: "数据结构", C04: "控制结构", C05: "函数",
  C06: "面向对象", C07: "字符串", C08: "文件操作", C09: "异常处理",
};
const typeNames = { single: "单选题", multiple: "多选题", boolean: "判断题" };
const evidenceNames = {
  platform_confirmed: "平台公布答案",
  manual_confirmed: "人工核对",
  score_verified: "历史判分核对",
};
const title = "苏州大学应用技术学院 Python 程序设计客观题题库";
const bank = JSON.parse(await readFile(new URL("bank.json", root), "utf8"));
assert.equal(bank.schema_version, 1, "Unsupported bank.json schema");
assert.ok(Array.isArray(bank.items) && bank.items.length, "The bank has no questions");

const escape = value => value.replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);
const paragraphs = value => escape(value).replace(/\r\n?|\n/g, "<br>\n");
const pre = value => `<pre><code>${escape(value).replace(/[ \t]+(?=\r?$)/gm, spaces =>
  spaces.replace(/ /g, "&#32;").replace(/\t/g, "&#9;"))}</code></pre>`;
const ids = new Set();
const variants = new Map();
const chapters = Object.entries(chapterNames).map(([code, name]) => ({
  code,
  title: `第 ${code.slice(1)} 章 · ${name}`,
  questions: [],
}));
const chaptersByCode = new Map(chapters.map(chapter => [chapter.code, chapter]));

for (const item of bank.items) {
  assert.match(item.id, /^p_[a-f0-9]{32}$/);
  assert.ok(!ids.has(item.id), `Duplicate ID: ${item.id}`);
  ids.add(item.id);
  assert.match(item.code, /^PY-C\d+-[A-Z]+-\d+$/);
  assert.ok(item.code.startsWith(`PY-${item.chapter}-`) && chaptersByCode.has(item.chapter), `Invalid chapter: ${item.code}`);
  assert.ok(Object.hasOwn(typeNames, item.type), `Unexpected question type: ${item.code}`);
  assert.equal(typeof item.stem, "string");
  assert.ok(Array.isArray(item.options) && item.options.length, `Missing options: ${item.code}`);
  assert.equal(typeof item.answer_known, "boolean");
  assert.equal(item.needs_review, !item.answer_known);
  for (const option of item.options) {
    assert.match(option.key, /^[A-Z]+$/);
    assert.equal(typeof option.text, "string");
  }
  if (item.answer_known) {
    const answer = item.grading_answer;
    assert.ok(Object.hasOwn(evidenceNames, answer.verification), `Unknown grading evidence: ${item.code}`);
    assert.ok(answer.selected_texts.length && answer.selected_texts.every(text => item.options.some(option => option.text === text)),
      `Answer does not match an option: ${item.code}`);
  }
  variants.set(item.code, (variants.get(item.code) || 0) + 1);
  chaptersByCode.get(item.chapter).questions.push(item);
}

function renderAnswer(item) {
  if (!item.answer_known) return '<p class="pending"><strong>待核对</strong> · 暂无确定答案</p>';

  const { selected_texts, explanation, verification, explanation_source } = item.grading_answer;
  const selected = selected_texts.map(text => `<li>${/\r|\n/.test(text) ? pre(text) : escape(text)}</li>`).join("");
  const sourceNote = verification === "platform_confirmed" && explanation_source === "platform" && explanation
    ? '<p class="muted">原解析中的选项字母可能对应旧顺序，请以此处列出的答案原文为准。</p>' : "";
  return `<details><summary>答案与解析</summary><ul>${selected}</ul><p>答案依据 · ${evidenceNames[verification]}</p>${
    explanation ? `<p>${paragraphs(explanation)}</p>${sourceNote}` : ""
  }</details>`;
}

function renderQuestion(item) {
  const stem = item.stem.replace(/^\[PY-C\d+-[A-Z]+-\d+\][ \t]*(?:[-–][ \t]*)?/, "");
  const [intro, ...lines] = stem.split(/\r\n?|\n/);
  const options = item.options.map(({ key, text }) =>
    `<li><strong>${key}.</strong> ${/\r|\n/.test(text) ? pre(text) : escape(text)}</li>`).join("");
  return `<p>${escape(intro)}</p>\n${lines.length ? `${pre(lines.join("\n"))}\n` : ""}<ul class="options">${options}</ul>\n${renderAnswer(item)}`;
}

function renderChapter(chapter, html) {
  const variantIndices = new Map();
  return chapter.questions.map(item => {
    const index = (variantIndices.get(item.code) || 0) + 1;
    variantIndices.set(item.code, index);
    const type = item.code.includes("-RP-") ? "阅读程序题" : typeNames[item.type];
    const heading = `${item.code}${variants.get(item.code) > 1 ? `（版本 ${index}）` : ""} · ${type}`;
    const body = renderQuestion(item);
    return html ? `<article><h3>${heading}</h3>\n${body}\n</article>` : `### ${heading}\n\n${body}`;
  }).join("\n\n");
}

const gradable = bank.items.filter(item => item.answer_known).length;
await mkdir(chapterDirectory, { recursive: true });
for (const chapter of chapters) {
  const markdown = `# ${chapter.title}\n\n[返回题库目录](../README.md) · 共 ${chapter.questions.length} 题\n\n${renderChapter(chapter, false)}\n`;
  await writeFile(new URL(`${chapter.code}.md`, chapterDirectory), markdown);
}

const toc = chapters.map(chapter =>
  `<li><a href="#${chapter.code}">${chapter.title}</a>（${chapter.questions.length} 题）</li>`).join("\n");
const sections = chapters.map(chapter => `<section id="${chapter.code}">
<h2>${chapter.title}</h2>
<p><a href="#toc">返回章节目录</a></p>
${renderChapter(chapter, true)}
</section>`).join("\n");
const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${title}（离线版）</title>
<style>
:root { color-scheme: light dark; font-family: system-ui, sans-serif; line-height: 1.65; }
body { margin: 0 auto; max-width: 50rem; padding: 1.25rem; }
h1, h2, h3 { line-height: 1.35; }
nav ul { columns: 2 12rem; }
section { margin-top: 3rem; }
article { border-top: 1px solid GrayText; padding: .65rem 0 1.1rem; }
pre, details { border: 1px solid GrayText; border-radius: .4rem; padding: .75rem; }
pre { overflow: auto; }
summary { cursor: pointer; min-height: 1.75rem; }
.muted { color: GrayText; }
.options { list-style: none; padding: 0; }
.options li + li { margin-top: .55rem; }
</style>
</head>
<body>
<main>
<h1>${title}</h1>
<p>2026-11-22 归档 · ${bank.items.length} 道题 · ${gradable} 道有答案 · ${bank.items.length - gradable} 道待核对</p>
<p>供课程复习参考。题目有遗漏的可能，答案以实际课程为准。可用浏览器的页内查找搜索题号或关键词。</p>
<nav id="toc" aria-labelledby="toc-title">
<h2 id="toc-title">章节目录</h2>
<ul>${toc}</ul>
</nav>
${sections}
</main>
</body>
</html>
`;
await writeFile(new URL("index.html", root), html);
console.log(`Exported ${bank.items.length} questions (${gradable} with answers) into ${chapters.length} Markdown chapters and index.html.`);
