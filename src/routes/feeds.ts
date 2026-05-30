import { Hono } from "hono";
import { db, CATEGORIES } from "../db.js";
import { render } from "../views.js";
import { v4 as uuid } from "uuid";

export const feedRoutes = new Hono();

// RSS 源管理页
feedRoutes.get("/", (c) => {
  const feeds = db.prepare("SELECT * FROM feeds ORDER BY category, name").all();
  return c.html(render("feeds", { title: "RSS 源管理", feeds, categories: CATEGORIES }));
});

// 添加 RSS 源
feedRoutes.post("/", (c) => {
  // 检查是 htmx 还是普通表单
  const contentType = c.req.header("content-type") || "";

  if (contentType.includes("json")) {
    return handleAddJSON(c);
  }

  // 表单提交
  return handleAddForm(c);
});

async function handleAddForm(c: any) {
  const body = await c.req.parseBody();
  const id = uuid();
  db.prepare(
    "INSERT INTO feeds (id, name, url, category, language) VALUES (?, ?, ?, ?, ?)"
  ).run(id, body.name, body.url, body.category, body.language || "zh");

  c.header("HX-Redirect", "/feeds");
  return c.body(null);
}

async function handleAddJSON(c: any) {
  const body = await c.req.json();
  const id = uuid();
  db.prepare(
    "INSERT INTO feeds (id, name, url, category, language) VALUES (?, ?, ?, ?, ?)"
  ).run(id, body.name, body.url, body.category, body.language || "zh");
  return c.json({ id, status: "ok" });
}

// 更新 RSS 源
feedRoutes.post("/:id/update", async (c) => {
  const { id } = c.req.param();
  const body = await c.req.parseBody();
  const fields: string[] = [];
  const values: any[] = [];

  if (body.name) { fields.push("name = ?"); values.push(body.name); }
  if (body.url) { fields.push("url = ?"); values.push(body.url); }
  if (body.category) { fields.push("category = ?"); values.push(body.category); }
  if (body.language) { fields.push("language = ?"); values.push(body.language); }
  if (body.enabled !== undefined) { fields.push("enabled = ?"); values.push(body.enabled === "1" || body.enabled === "true" ? 1 : 0); }

  if (fields.length > 0) {
    values.push(id);
    db.prepare(`UPDATE feeds SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  }

  c.header("HX-Redirect", "/feeds");
  return c.body(null);
});

// 删除 RSS 源
feedRoutes.post("/:id/delete", (c) => {
  const { id } = c.req.param();
  db.prepare("DELETE FROM feeds WHERE id = ?").run(id);
  c.header("HX-Redirect", "/feeds");
  return c.body(null);
});

// 批量启用/禁用
feedRoutes.post("/batch/toggle", async (c) => {
  const body = await c.req.parseBody();
  const enabled = body.action === "enable" ? 1 : 0;
  const category = body.category as string | undefined;

  if (category) {
    db.prepare("UPDATE feeds SET enabled = ? WHERE category = ?").run(enabled, category);
  } else {
    db.prepare("UPDATE feeds SET enabled = ?").run(enabled);
  }

  c.header("HX-Redirect", "/feeds");
  return c.body(null);
});
