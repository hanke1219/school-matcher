# Cloudflare Pages 部署说明

本项目新增了一套适合 Cloudflare Pages 的静态网站架构。

## 技术栈

- Astro
- React Islands
- JSON 数据文件
- Cloudflare Pages 静态部署

旧的 Python / Docker / NAS 原型暂时保留，不影响新静态站。

## 本地开发

第一次运行需要安装 Node.js 依赖：

```powershell
npm install
npm run dev
```

本地预览地址通常是：

```text
http://localhost:4321
```

## Cloudflare Pages 设置

在 Cloudflare Pages 连接 GitHub 仓库后，使用以下设置：

```text
Framework preset: Astro
Build command: npm run build
Build output directory: dist
Production branch: main
```

之后每次用 GitHub Desktop 推送到 `main` 分支，Cloudflare Pages 会自动重新部署。

## 数据文件

核心数据在：

```text
src/data/schools.json
src/data/weights.json
src/data/reports/kaichi-nihonbashi.json
```

浏览器端公开访问的数据副本在：

```text
public/data/schools.json
public/data/weights.json
public/data/reports/kaichi-nihonbashi.json
```

如果继续从旧 Python 数据迁移，可运行：

```powershell
python scripts/export_static_data.py
```

注意：该脚本会重新生成 `public/data/schools.json` 和 `public/data/weights.json`。

## 隐私提醒

家长备注、孩子反馈、参观记录第一版保存在浏览器 `localStorage`。

不要把真实隐私备注直接写进公开 JSON 文件，因为 Cloudflare Pages 部署后，JSON 文件可以被访问。
