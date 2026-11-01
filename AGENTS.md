# SOOT & TEARS · 项目规则

- 项目：SOOT & TEARS（Phaser 4 + TypeScript + Vite，640×360，横屏手机优先）
- 已定事项：docs/PROJECT.md（项目状态）、docs/MECHANICS.md（机制规格）

## 会话启动（读完才准改代码）

1. logs/ 最新摘要（格式规则见全局配置）
2. docs/PROJECT.md
3. 涉及具体机制时再读 docs/MECHANICS.md

## 文档规则

- 上下文（决策、接口、状态、待办）一律写成 Markdown 放 docs/，不留对话里。
- 跨会话保留的结论必须先落 docs，再按 docs 执行。

## 项目约定

- （补：目录结构，如 src/ 的分工、美术资源放哪）
- （补：禁令，如 不动 node_modules / raw 原图 / 已发布构建）

## 禁止

- 不动 art/raw/ 原图，只能引用
- 不升级 Phaser 版本 / 不改 vite 配置，除非先问
- 截图/调试图统一放 docs/shots/，禁止写 %TEMP% 或项目外路径。

## 部署

- 当用户说「帮我部署 / 上线 / 发布」时，先读 `skills/deploy/SKILL.md`，按里面的流程走。
- 简记：build（TEMP 指项目内）→ API 同步改动文件到 main → `python tools/sync_ghpages.py` 同步 dist 到 gh-pages → 手动 dispatch workflow → 对比线上 js hash 验证。
- 禁止用 `git push`（github.com:443 被墙，走 api.github.com）。
