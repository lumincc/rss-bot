import ejs from "ejs";
import path from "path";
import { fileURLToPath } from "url";
import DOMPurify from "isomorphic-dompurify";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const viewsDir = path.join(__dirname, "..", "views");

const layoutPath = path.join(viewsDir, "layout.ejs");

export async function render(
  template: string,
  data: Record<string, any> = {},
): Promise<string> {
  const templatePath = path.join(viewsDir, `${template}.ejs`);

  // article 模板：对 LLM 生成的内容进行 XSS 过滤
  if (template === "article" && data.article?.content) {
    data.article.content = DOMPurify.sanitize(data.article.content, {
      ALLOWED_TAGS: [
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "p",
        "br",
        "hr",
        "ul",
        "ol",
        "li",
        "strong",
        "em",
        "b",
        "i",
        "u",
        "s",
        "code",
        "pre",
        "blockquote",
        "a",
        "img",
        "table",
        "thead",
        "tbody",
        "tr",
        "th",
        "td",
        "div",
        "span",
      ],
      ALLOWED_ATTR: ["href", "src", "alt", "title", "class", "target"],
    });
  }

  // 先渲染子模板内容
  const body = await ejs.renderFile(templatePath, data);

  // 再用 layout 包裹
  const layoutData = {
    ...data,
    body,
    activeNav: data.activeNav || guessNav(template),
  };
  const html = await ejs.renderFile(layoutPath, layoutData);

  return html;
}

function guessNav(template: string): string {
  if (template === "index") return "home";
  if (template === "feeds") return "feeds";
  if (template === "settings") return "settings";
  return "";
}
