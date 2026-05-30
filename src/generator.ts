import OpenAI from "openai";
import { type RawArticle, type GeneratedArticle } from "./db.js";

const SYSTEM_PROMPT = `你是一位专业的{categoryName}资讯编辑。你的任务是将多条新闻整理成一篇高质量的中文日报文章。

要求:
1. 文章使用 Markdown 格式
2. 开头有一段简短的总结概述当日热点（2-3句话）
3. 按重要性/主题对新闻进行分类整理
4. 每条新闻用 2-3 句话概述核心内容，突出关键信息
5. 如果是英文新闻，翻译成流畅的中文
6. 保持客观中立的报道风格
7. 在文末标注信息来源列表
8. 正文内容必须详细完整，至少包含 5-10 条新闻的详细报道，总字数不少于 1500 字

输出格式:
你的回复必须分为两部分: YAML 元数据 和 Markdown 正文。
YAML 元数据用三个反引号和 yaml 标记包裹，正文直接使用 Markdown 格式。

输出示例:
\`\`\`yaml
title: "AI与科技日报: 2026年1月20日 | 今日热点"
excerpt: "这是一段50-100字的文章摘要，概述今日主要新闻。"
slug: ai-daily-2026-01-20
tags:
  - 标签1
  - 标签2
\`\`\`

## 今日概览

正文内容...

## 热点新闻

### 新闻标题1
新闻内容...

注意事项:
- 标题格式: "{categoryName}日报: YYYY年M月D日 | 主要热点关键词"
- slug 使用小写英文，格式为 {slugPrefix}-YYYY-MM-DD
- YAML 中 title 和 excerpt 的值必须用双引号包裹
- 确保文章完整，至少报道 5-10 条新闻`;

export class ArticleGenerator {
  private client: OpenAI;
  private model: string;

  constructor(apiBaseUrl: string, apiKey: string, model: string) {
    let baseURL = apiBaseUrl.replace(/\/+$/, "");
    if (!baseURL.endsWith("/v1")) baseURL += "/v1";
    this.client = new OpenAI({ baseURL, apiKey });
    this.model = model;
  }

  private formatArticles(articles: RawArticle[]): string {
    return articles
      .map(
        (a, i) =>
          `### ${i + 1}. ${a.title}\n来源: ${a.source} | 时间: ${a.published.toISOString().slice(0, 16).replace("T", " ")}\n链接: ${a.link}\n内容: ${a.summary}`,
      )
      .join("\n\n");
  }

  private parseResponse(
    content: string,
    categoryKey: string,
    categoryName: string,
  ): GeneratedArticle {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10);
    const slugPrefix = `${categoryKey}-daily`;
    const defaultSlug = `${slugPrefix}-${dateStr}`;
    const defaultTags = [`${categoryName}日报`, categoryName];

    let frontmatter: Record<string, any> = {};
    let body = content;

    // 格式1: ```yaml ... ```
    const yamlMatch = content.match(/```yaml\s*([\s\S]*?)```/);
    if (yamlMatch) {
      try {
        // 手动解析简单 YAML（避免额外依赖）
        const yamlStr = yamlMatch[1];
        frontmatter = parseSimpleYAML(yamlStr);
        body = content.slice(yamlMatch.index! + yamlMatch[0].length).trim();
      } catch {}
    }

    return {
      title: frontmatter.title || `${categoryName}日报 ${dateStr}`,
      slug: frontmatter.slug || defaultSlug,
      excerpt: frontmatter.excerpt || body.slice(0, 150) + "...",
      content: body,
      tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : defaultTags,
      category: categoryKey,
    };
  }

  async generate(
    articles: RawArticle[],
    categoryKey: string,
    categoryName: string,
  ): Promise<GeneratedArticle> {
    if (!articles.length) throw new Error("No articles to generate from");

    const today = new Date();
    const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
    const slugPrefix = `${categoryKey}-daily`;

    const systemPrompt = SYSTEM_PROMPT.replace(
      /\{categoryName\}/g,
      categoryName,
    ).replace(/\{slugPrefix\}/g, slugPrefix);

    const userPrompt = `今天是 ${dateStr}。\n\n请将以下 ${articles.length} 条${categoryName}新闻整理成一篇日报文章:\n\n${this.formatArticles(articles)}`;

    console.log(
      `[Generator] Generating ${categoryKey} article from ${articles.length} sources`,
    );

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 8192,
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content || "";
    const result = this.parseResponse(content, categoryKey, categoryName);
    console.log(`[Generator] Generated: ${result.title}`);
    return result;
  }
}

// 简易 YAML 解析器（只处理 title/excerpt/slug/tags 字段，避免引入 yaml 依赖）
function parseSimpleYAML(text: string): Record<string, any> {
  const result: Record<string, any> = {};

  // title: "..." 或 title: '...'
  let m = text.match(/title:\s*["'](.+?)["']/);
  if (m) result.title = m[1];

  // excerpt: "..." 或 excerpt: '...'
  m = text.match(/excerpt:\s*["'](.+?)["']/s);
  if (m) result.excerpt = m[1];

  // slug: xxx
  m = text.match(/slug:\s*(\S+)/);
  if (m) result.slug = m[1];

  // tags: 支持 YAML 列表和 JSON 数组两种格式
  // 格式1: YAML 列表  tags:\n  - xxx
  m = text.match(/tags:\s*\n((?:\s*-\s*.+\n?)+)/);
  if (m) {
    result.tags = m[1]
      .split("\n")
      .map((line) =>
        line
          .replace(/^\s*-\s*/, "")
          .replace(/^["']|["']$/g, "")
          .trim(),
      )
      .filter(Boolean);
  }
  // 格式2: JSON 数组  tags: ["xxx", "yyy"]
  else {
    const jsonMatch = text.match(/tags:\s*(\[[\s\S]*?\])/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (Array.isArray(parsed)) {
          result.tags = parsed
            .map((t: string) => String(t).trim())
            .filter(Boolean);
        }
      } catch {}
    }
  }

  return result;
}
