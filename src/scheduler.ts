import cron from "node-cron";
import { db, getSettings, CATEGORIES } from "./db.js";
import { collectByCategory } from "./collector.js";
import { ArticleGenerator } from "./generator.js";
import { v4 as uuid } from "uuid";

let scheduledTask: cron.ScheduledTask | null = null;

export function startScheduler() {
  updateScheduler();
  console.log("[Scheduler] Initialized");
}

export function updateScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }

  const settings = getSettings();
  if (!settings.schedule.enabled) {
    console.log("[Scheduler] Disabled");
    return;
  }

  const { cron_hour, cron_minute } = settings.schedule;
  const expression = `${cron_minute} ${cron_hour} * * *`;

  scheduledTask = cron.schedule(expression, async () => {
    console.log("[Scheduler] Running scheduled collection...");
    try {
      await runCollection();
      console.log("[Scheduler] Collection completed");
    } catch (e: any) {
      console.error(`[Scheduler] Error: ${e.message}`);
    }
  });

  console.log(
    `[Scheduler] Scheduled at ${String(cron_hour).padStart(2, "0")}:${String(cron_minute).padStart(2, "0")}`,
  );
}

export async function runCollection(
  categoryKey?: string,
  force = false,
): Promise<Record<string, any>> {
  const settings = getSettings();

  if (!settings.api.api_base_url || !settings.api.api_key) {
    throw new Error("请先在设置中配置 API");
  }

  // 白名单校验：只允许已注册的分类 key
  if (categoryKey && !CATEGORIES[categoryKey]) {
    throw new Error(`分类 "${categoryKey}" 不存在或未注册`);
  }

  const validKeys = categoryKey ? [categoryKey] : Object.keys(CATEGORIES);
  const categories = validKeys.map((key) => ({ key, ...CATEGORIES[key] }));

  const results: Record<string, any> = {};

  for (const cat of categories) {
    try {
      // 检查今天是否已有文章
      if (!force) {
        const today = new Date().toISOString().slice(0, 10);
        const existing = db
          .prepare(
            `SELECT COUNT(*) as count FROM articles WHERE category = ? AND date(created_at) = ?`,
          )
          .get(cat.key, today) as any;
        if (existing.count > 0) {
          results[cat.key] = { status: "skipped", reason: "今日已有文章" };
          continue;
        }
      }

      // 采集
      const rawArticles = await collectByCategory(
        cat.key,
        settings.general.article_max_age_hours,
        settings.general.max_articles_per_source,
      );

      if (rawArticles.length < 3) {
        results[cat.key] = {
          status: "skipped",
          reason: `仅 ${rawArticles.length} 篇文章`,
        };
        continue;
      }

      // 限制数量
      const limited = rawArticles.slice(
        0,
        settings.general.max_articles_per_category,
      );

      // 生成
      const generator = new ArticleGenerator(
        settings.api.api_base_url,
        settings.api.api_key,
        settings.api.model,
      );
      const generated = await generator.generate(limited, cat.key, cat.name);

      // 保存
      const articleId = uuid();
      let slug = generated.slug;
      let counter = 1;
      while (db.prepare("SELECT 1 FROM articles WHERE slug = ?").get(slug)) {
        slug = `${generated.slug}-${counter++}`;
      }

      db.prepare(
        `INSERT INTO articles (id, title, slug, content, excerpt, category, tags) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        articleId,
        generated.title,
        slug,
        generated.content,
        generated.excerpt,
        generated.category,
        JSON.stringify(generated.tags),
      );

      results[cat.key] = {
        status: "success",
        article_id: articleId,
        title: generated.title,
        source_count: limited.length,
      };
    } catch (e: any) {
      results[cat.key] = { status: "error", error: e.message };
    }
  }

  return results;
}
