import { Hono } from "hono";
import { db, getSettings } from "../db.js";
import { render } from "../views.js";
import { updateScheduler } from "../scheduler.js";

export const settingsRoutes = new Hono();

// 设置页
settingsRoutes.get("/", (c) => {
  const settings = getSettings();
  return c.html(render("settings", { title: "设置", settings }));
});

// 更新 API 设置
settingsRoutes.post("/api", async (c) => {
  const body = await c.req.parseBody();
  const value = JSON.stringify({
    api_base_url: body.api_base_url || "",
    api_key: body.api_key || "",
    model: body.model || "gpt-4o-mini",
  });
  db.prepare(
    "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))",
  ).run("api", value);
  c.header("HX-Redirect", "/settings");
  return c.body(null);
});

// 更新定时任务设置
settingsRoutes.post("/schedule", async (c) => {
  const body = await c.req.parseBody();
  const value = JSON.stringify({
    enabled: body.enabled === "1",
    cron_hour: parseInt(body.cron_hour as string) || 8,
    cron_minute: parseInt(body.cron_minute as string) || 0,
    timezone: body.timezone || "Asia/Shanghai",
  });
  db.prepare(
    "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))",
  ).run("schedule", value);
  updateScheduler();
  c.header("HX-Redirect", "/settings");
  return c.body(null);
});

// 更新通用设置
settingsRoutes.post("/general", async (c) => {
  const body = await c.req.parseBody();
  const value = JSON.stringify({
    site_name: body.site_name || "每日资讯",
    max_articles_per_source:
      parseInt(body.max_articles_per_source as string) || 10,
    max_articles_per_category:
      parseInt(body.max_articles_per_category as string) || 30,
    article_max_age_hours: parseInt(body.article_max_age_hours as string) || 24,
  });
  db.prepare(
    "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))",
  ).run("general", value);
  c.header("HX-Redirect", "/settings");
  return c.body(null);
});
