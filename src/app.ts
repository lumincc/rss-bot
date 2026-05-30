import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { initDB } from "./db.js";
import { startScheduler } from "./scheduler.js";
import { indexRoutes } from "./routes/index.js";
import { articleRoutes } from "./routes/article.js";
import { feedRoutes } from "./routes/feeds.js";
import { settingsRoutes } from "./routes/settings.js";

const app = new Hono();

// 静态文件
app.use("/public/*", serveStatic({ root: "./" }));

// 路由——注意顺序：先注册具体路由，再注册通配
app.route("/article", articleRoutes);
app.route("/feeds", feedRoutes);
app.route("/settings", settingsRoutes);
app.route("/", indexRoutes);

// 初始化
initDB();
startScheduler();

const port = parseInt(process.env.PORT || "8000");

console.log(`[App] Starting on http://localhost:${port}`);
serve({ fetch: app.fetch, port });
