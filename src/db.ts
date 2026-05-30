import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
const DB_PATH = process.env.DB_PATH || path.join(dataDir, "rss-bot.db");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const db = new Database(DB_PATH);

export function initDB() {
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS feeds (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      category TEXT NOT NULL,
      language TEXT DEFAULT 'zh',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      content TEXT NOT NULL,
      excerpt TEXT,
      category TEXT NOT NULL,
      tags TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // 初始化默认设置
  const insertSetting = db.prepare(
    `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`,
  );
  insertSetting.run(
    "api",
    JSON.stringify({ api_base_url: "", api_key: "", model: "gpt-4o-mini" }),
  );
  insertSetting.run(
    "schedule",
    JSON.stringify({
      enabled: false,
      cron_hour: 8,
      cron_minute: 0,
      timezone: "Asia/Shanghai",
    }),
  );
  insertSetting.run(
    "general",
    JSON.stringify({
      site_name: "每日资讯",
      max_articles_per_source: 10,
      max_articles_per_category: 30,
      article_max_age_hours: 24,
    }),
  );

  // 初始化默认 RSS 源
  const feedCount = (
    db.prepare("SELECT COUNT(*) as count FROM feeds").get() as any
  ).count;
  if (feedCount === 0) {
    seedFeeds();
  }

  console.log("[DB] Initialized");
}

function seedFeeds() {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO feeds (id, name, url, category, language) VALUES (?, ?, ?, ?, ?)`,
  );
  const feeds = [
    ["36kr", "36氪", "https://36kr.com/feed", "ai", "zh"],
    ["jiqizhixin", "机器之心", "https://www.jiqizhixin.com/rss", "ai", "zh"],
    ["qbitai", "量子位", "https://www.qbitai.com/feed", "ai", "zh"],
    [
      "techcrunch-ai",
      "TechCrunch AI",
      "https://techcrunch.com/category/artificial-intelligence/feed/",
      "ai",
      "en",
    ],
    [
      "theverge",
      "The Verge",
      "https://www.theverge.com/rss/index.xml",
      "ai",
      "en",
    ],
    ["hn-best", "Hacker News Best", "https://hnrss.org/best", "ai", "en"],
    [
      "openai-blog",
      "OpenAI Blog",
      "https://openai.com/blog/rss.xml",
      "ai",
      "en",
    ],
    [
      "coindesk",
      "CoinDesk",
      "https://www.coindesk.com/arc/outboundfeeds/rss/",
      "crypto",
      "en",
    ],
    [
      "cointelegraph",
      "Cointelegraph",
      "https://cointelegraph.com/rss",
      "crypto",
      "en",
    ],
    ["decrypt", "Decrypt", "https://decrypt.co/feed", "crypto", "en"],
    [
      "wallstreetcn",
      "华尔街见闻",
      "https://wallstreetcn.com/rss",
      "finance",
      "zh",
    ],
    [
      "cnbc",
      "CNBC",
      "https://www.cnbc.com/id/100003114/device/rss/rss.html",
      "finance",
      "en",
    ],
  ];
  const insertMany = db.transaction(() => {
    for (const [id, name, url, category, language] of feeds) {
      stmt.run(id, name, url, category, language);
    }
  });
  insertMany();
  console.log(`[DB] Seeded ${feeds.length} default feeds`);
}

// ===== Types =====

export interface Feed {
  id: string;
  name: string;
  url: string;
  category: string;
  language: string;
  enabled: boolean;
  created_at: string;
}

export interface Article {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  category: string;
  tags: string;
  created_at: string;
  tagList: string[];
}

export interface Settings {
  api: APISettings;
  schedule: ScheduleSettings;
  general: GeneralSettings;
}

export interface APISettings {
  api_base_url: string;
  api_key: string;
  model: string;
}

export interface ScheduleSettings {
  enabled: boolean;
  cron_hour: number;
  cron_minute: number;
  timezone: string;
}

export interface GeneralSettings {
  site_name: string;
  max_articles_per_source: number;
  max_articles_per_category: number;
  article_max_age_hours: number;
}

export interface RawArticle {
  title: string;
  link: string;
  summary: string;
  published: Date;
  source: string;
  category: string;
  language: string;
}

export interface GeneratedArticle {
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  tags: string[];
  category: string;
}

// ===== Helpers =====

export function getSettings(): Settings {
  const rows = db.prepare("SELECT key, value FROM settings").all() as {
    key: string;
    value: string;
  }[];
  const map: Record<string, any> = {};
  for (const row of rows) map[row.key] = JSON.parse(row.value);
  return {
    api: map.api || { api_base_url: "", api_key: "", model: "gpt-4o-mini" },
    schedule: map.schedule || {
      enabled: false,
      cron_hour: 8,
      cron_minute: 0,
      timezone: "Asia/Shanghai",
    },
    general: map.general || {
      site_name: "每日资讯",
      max_articles_per_source: 10,
      max_articles_per_category: 30,
      article_max_age_hours: 24,
    },
  };
}

export function parseArticleRow(row: any): Article {
  let tagList: string[] = [];
  try {
    tagList = JSON.parse(row.tags || "[]");
  } catch {}
  return { ...row, tagList };
}

export const CATEGORIES: Record<string, { name: string; icon: string }> = {
  ai: { name: "AI/科技", icon: "🤖" },
  crypto: { name: "加密货币", icon: "₿" },
  finance: { name: "财经", icon: "📈" },
};
