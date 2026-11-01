# deploy · 部署 soot-and-tears 到 GitHub Pages

**触发**：用户说「帮我部署 / 上线 / 发布 soot-and-tears」时使用本 skill。

## 背景

- 仓库：`zlToT/soot-and-tears`（public）
- 线上地址：https://zltot.github.io/soot-and-tears/
- 分支约定：`main` = 源码；`gh-pages` = 构建产物（dist/ 内容）
- Pages 通过 GitHub Actions（`.github/workflows/deploy.yml`）发布，build_type=workflow
- **网络约束**：本机 `github.com:443` 被墙（git push 不通），但 `api.github.com:443` 通。所有 git 操作必须走 GitHub REST API，禁止用 `git push`。

## 执行流程（按顺序，不许跳步）

### 1. 识别改动

```powershell
cd D:\Work\phaser_project\soot-and-tears
git status --short
```

如果没有改动，直接告诉用户「没东西要部署」并结束。

### 2. 取 token

优先从 git credential 拿（不要硬编码）：

```powershell
$input = "protocol=https`nhost=github.com`n`n"
$cred = $input | git credential fill
$token = ($cred | Select-String "^password=(.+)$").Matches.Groups[1].Value
```

把 `$token` 写进环境变量供后续使用：`$env:GITHUB_TOKEN = $token`。

### 3. 本地 build

esbuild 临时目录不能用 `%TEMP%`（权限报错），必须指到项目内：

```powershell
New-Item -ItemType Directory -Force -Path ".tmp\build-tmp" | Out-Null
$env:TEMP = (Resolve-Path ".tmp\build-tmp").Path
$env:TMP  = $env:TEMP
pnpm build
```

### 4. 把改动的源码文件同步到 main 分支

对 `git status` 列出的每个改动/新增文件，用 Contents API 上传（单文件，保留 sha 用于 update）：

```powershell
# 对每个改动文件：
$bytes = [IO.File]::ReadAllBytes($localPath)
$b64 = [Convert]::ToBase64String($bytes)
# 若文件已存在先 GET 拿 sha，不存在则不传 sha
$body = @{ message = "deploy: sync <filepath>"; content = $b64; branch = "main" } | ConvertTo-Json
Invoke-RestMethod -Uri "https://api.github.com/repos/zlToT/soot-and-tears/contents/<filepath>" -Method Put -Headers $h -Body $body -ContentType "application/json"
```

### 5. 同步 dist 到 gh-pages 分支

直接跑现成脚本（脚本会全量替换 gh-pages tree）：

```powershell
python tools\sync_ghpages.py
```

脚本逻辑：遍历 `dist/` → 逐文件建 blob → 重建 tree → 建 commit → force 更新 `gh-pages` ref。

### 6. 触发 Actions 部署

**重要**：通过 API 直接更新 ref **不会触发** workflow 的 `push` 事件。必须手动 dispatch：

```powershell
$body = @{ ref = "main" } | ConvertTo-Json
Invoke-WebRequest -Uri "https://api.github.com/repos/zlToT/soot-and-tears/actions/workflows/deploy.yml/dispatches" -Method Post -Headers $h -Body $body -ContentType "application/json"
```

（workflow_dispatch 必须从默认分支 main 触发，即使部署的是 gh-pages 内容。）

### 7. 验证上线

等 60–90 秒，然后对比 js hash：

```powershell
$live = (Invoke-WebRequest -Uri "https://zltot.github.io/soot-and-tears/?t=$([DateTimeOffset]::Now.ToUnixTimeSeconds())" -UseBasicParsing).Content
$liveJs = ([regex]::Match($live, "index-(\w+)\.js")).Value
$localJs = (Get-Content dist\index.html | Select-String "index-\w+\.js").Matches.Value
```

两者一致才算部署成功。如果不一致，查 Actions runs 列表看哪个 run 失败了：

```
GET /repos/zlToT/soot-and-tears/actions/runs?per_page=3
```

## 常见坑

| 现象 | 原因 | 处理 |
|---|---|---|
| `git push` connection reset | github.com:443 被墙 | 别用 git push，走 API |
| esbuild build 报 `Access is denied` 在 `%TEMP%` | 临时目录权限 | 重设 `$env:TEMP/$TMP` 到 `.tmp/build-tmp` |
| sync 完线上没变化 | API push ref 不触发 push 事件 | 手动 dispatch workflow（步骤 6） |
| Secret scanning 409 | 脚本里硬编码 token | token 从 credential 读，不入库 |
| Pages 首次构建 errored | legacy 构建器问题 | 已切到 Actions 模式，不要切回 legacy |

## 不要做的事

- 不要 `git push` 任何分支到 origin（网络不通）
- 不要把 token 写进任何会被提交的文件
- 不要改 `.github/workflows/deploy.yml`，除非用户明确要求
- 不要删 `tools/sync_ghpages.py`
- 不要 force push main（main 上的 commit 是 API 建的，和本地 sha 不一致，强推会出问题；本地 commit 仅作本地记录）
