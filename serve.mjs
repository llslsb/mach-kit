// serve.mjs —— mach-kit 零依赖静态服务器（Node 内置模块，无 npm install）
// 用法：node serve.mjs [端口]    默认端口 8787，只监听 127.0.0.1
// 为什么需要它：示例用 ES 模块（import），双击 file:// 打开会被浏览器拦截，必须经 HTTP 访问。
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url)); // 带尾分隔符
const port = Number(process.argv[2]) || 8787;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".gif": "image/gif",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".csv": "text/csv; charset=utf-8",
};

createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const file = normalize(join(root, path === "/" ? "index.html" : "." + path));
    if (!file.startsWith(root)) { res.writeHead(403); res.end("403"); return; } // 防目录穿越
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": MIME[extname(file).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("404：找不到 " + new URL(req.url, "http://localhost").pathname);
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`mach-kit 已开机： http://127.0.0.1:${port}/  （Ctrl+C 关机）`);
});
