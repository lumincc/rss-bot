import { Hono } from "hono";
import { db, parseArticleRow, CATEGORIES } from "../db.js";
import { runCollection } from "../scheduler.js";
import { render } from "../views.js";

export const indexRoutes = new Hono();

// 首页 - 文章列表
indexRoutes.get("/", (c) => {
  const category = c.req.query("category") || "";
  const settings = db
    .prepare("SELECT value FROM settings WHERE key = 'general'")
    .get() as any;
  const siteName = settings ? JSON.parse(settings.value).site_name : "每日资讯";

  const articles = category
    ? db
        .prepare(
          "SELECT * FROM articles WHERE category = ? ORDER BY created_at DESC LIMIT 50",
        )
        .all(category)
        .map(parseArticleRow)
    : db
        .prepare("SELECT * FROM articles ORDER BY created_at DESC LIMIT 50")
        .all()
        .map(parseArticleRow);

  return c.html(
    render("index", {
      title: "",
      articles,
      siteName,
      currentCategory: category,
      categories: CATEGORIES,
    }),
  );
});

// 手动触发采集
indexRoutes.post("/collect", async (c) => {
  try {
    const body = await c.req.parseBody();
    const category =
      typeof body.category === "string" && body.category !== ""
        ? body.category
        : undefined;
    const force = body.force === "true";
    const results = await runCollection(category, force);
    return c.json({ status: "completed", results });
  } catch (e: any) {
    return c.json({ status: "error", error: e.message }, 400);
  }
});
