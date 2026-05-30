import { Hono } from "hono";
import { db, parseArticleRow, CATEGORIES } from "../db.js";
import { render } from "../views.js";

export const articleRoutes = new Hono();

// 文章详情页
articleRoutes.get("/:slug", (c) => {
  const { slug } = c.req.param();
  const row = db.prepare("SELECT * FROM articles WHERE slug = ?").get(slug);
  if (!row) {
    return c.html(
      render("error", { title: "文章不存在", message: "找不到该文章" }),
      404,
    );
  }
  const article = parseArticleRow(row);
  const cat = CATEGORIES[article.category] || {
    name: article.category,
    icon: "📰",
  };

  return c.html(
    render("article", {
      title: article.title,
      article,
      categoryName: cat.name,
      categoryIcon: cat.icon,
    }),
  );
});

// 删除文章
articleRoutes.post("/:slug/delete", (c) => {
  const { slug } = c.req.param();
  db.prepare("DELETE FROM articles WHERE slug = ?").run(slug);
  c.header("HX-Redirect", "/");
  return c.body(null);
});
