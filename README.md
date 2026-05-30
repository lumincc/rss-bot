# rss-bot

轻量级 AI 驱动每日资讯自动推送系统 — 从 [news-agent](https://github.com/zt6453928/news-agent) 重构而来。

## 特点

- **单进程**：前后端一体化，Hono + EJS + htmx，无需 React/Next.js
- **零前端构建**：htmx 14KB 从 CDN 加载，无 node_modules 前端依赖
- **SQLite 内嵌**：better-sqlite3，零配置，数据文件在 `data/rss-bot.db`
- **完整功能**：RSS 采集 → LLM 生成日报 → Web 展示 → 定时任务

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式（热重载）
npm run dev

# 生产模式
npx tsx src/app.ts
```

访问 http://localhost:8000

## 配置

复制 `.env` 文件并填入 API 配置：

```
API_BASE_URL=https://api.openai.com
API_KEY=sk-your-key-here
MODEL=gpt-4o-mini
PORT=8000
```

或在 Web 界面的「设置」页面配置。

## Docker 部署

```bash
docker build -t rss-bot .
docker run -d -p 8000:8000 -v ./data:/app/data rss-bot
```

## 文件结构

```
rss-bot/
├── src/
│   ├── app.ts              # 入口
│   ├── db.ts               # 数据库 + 类型定义
│   ├── collector.ts        # RSS 采集器
│   ├── generator.ts        # LLM 文章生成器
│   ├── scheduler.ts        # 定时任务 + 采集编排
│   ├── views.ts            # EJS 模板渲染
│   └── routes/
│       ├── index.ts        # 首页 + 采集触发
│       ├── article.ts      # 文章详情
│       ├── feeds.ts        # RSS 源管理
│       └── settings.ts     # 设置页
├── views/                   # EJS 模板
│   ├── layout.ejs
│   ├── index.ejs
│   ├── article.ejs
│   ├── settings.ejs
│   ├── feeds.ejs
│   └── error.ejs
├── public/
│   └── style.css
├── data/                    # SQLite 数据库 (自动创建)
├── package.json
└── Dockerfile
```

## 对比原版 news-agent

| 指标 | 原 news-agent | rss-bot |
|------|--------------|---------|
| 源文件 | 50+ | 15 |
| 进程 | 2 (前端+后端) | 1 |
| 依赖 | 22 个 | 7 个 |
| 前端 JS | ~50MB | 14KB (htmx CDN) |
| 部署 | docker-compose 双容器 | 单进程 / 单 Docker |

## License

MIT
