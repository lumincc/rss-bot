import Parser from "rss-parser";
import { db, type Feed, type RawArticle } from "./db.js";

const parser = new Parser({ timeout: 30000 });

function cleanHTML(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1000);
}

export async function collectFeed(feed: Feed, maxAgeHours: number, maxItems: number): Promise<RawArticle[]> {
  const articles: RawArticle[] = [];
  const cutoff = new Date(Date.now() - maxAgeHours * 3600_000);

  try {
    const parsed = await parser.parseURL(feed.url);

    for (const item of (parsed.items || []).slice(0, maxItems)) {
      const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
      if (pubDate < cutoff) continue;

      articles.push({
        title: (item.title || "").trim(),
        link: item.link || "",
        summary: cleanHTML(item.contentSnippet || item.content || item.summary || ""),
        published: pubDate,
        source: feed.name,
        category: feed.category,
        language: feed.language,
      });
    }
    console.log(`[Collector] ${feed.name}: ${articles.length} articles`);
  } catch (e: any) {
    console.error(`[Collector] Error fetching ${feed.name}: ${e.message}`);
  }

  return articles;
}

export async function collectByCategory(categoryKey: string, maxAgeHours: number, maxItems: number): Promise<RawArticle[]> {
  const feeds = db.prepare(
    `SELECT * FROM feeds WHERE category = ? AND enabled = 1`
  ).all(categoryKey) as Feed[];

  const allArticles: RawArticle[] = [];
  await Promise.all(
    feeds.map(async (feed) => {
      const articles = await collectFeed(feed, maxAgeHours, maxItems);
      allArticles.push(...articles);
    })
  );

  // 去重 (基于链接)
  const seen = new Set<string>();
  const unique = allArticles.filter((a) => {
    if (seen.has(a.link)) return false;
    seen.add(a.link);
    return true;
  });

  console.log(`[Collector] ${categoryKey}: ${unique.length} unique articles from ${feeds.length} feeds`);
  return unique;
}
