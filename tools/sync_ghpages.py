"""把 dist/ 全量同步到 gh-pages 分支（绕开被墙的 git 协议）。

用法：
    set GITHUB_TOKEN=gho_xxx   (PowerShell: $env:GITHUB_TOKEN="gho_xxx")
    python tools/sync_ghpages.py [repo] [dist_dir]

默认 repo=zlToT/soot-and-tears，dist_dir=<项目根>/dist。
"""
import base64, json, os, sys, time, urllib.request, urllib.error

API = "https://api.github.com"
TOKEN = os.environ.get("GITHUB_TOKEN", "").strip()
if not TOKEN:
    sys.exit("需要先设置环境变量 GITHUB_TOKEN")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
REPO = sys.argv[1] if len(sys.argv) > 1 else "zlToT/soot-and-tears"
ROOT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(PROJECT_ROOT, "dist")


def call(method, path, body=None):
    url = f"{API}{path}"
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Authorization": f"token {TOKEN}", "Accept": "application/vnd.github+json",
               "User-Agent": "sync-ghpages", "Content-Type": "application/json"}
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    for i in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            msg = e.read().decode("utf-8", "replace")
            if 200 <= e.code < 300:
                return json.loads(msg)
            if e.code in (502, 503, 429):
                time.sleep(2 ** i); continue
            raise SystemExit(f"HTTP {e.code} {path}: {msg}")


# 收集 dist 文件
items = []
for dirpath, _, files in os.walk(ROOT):
    for fn in files:
        full = os.path.join(dirpath, fn)
        rel = os.path.relpath(full, ROOT).replace(os.sep, "/")
        items.append((rel, full))
print(f"[dist] {len(items)} files from {ROOT}")

# 建 blob
tree = []
for i, (rel, full) in enumerate(items):
    with open(full, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    blob = call("POST", f"/repos/{REPO}/git/blobs", {"content": b64, "encoding": "base64"})
    tree.append({"path": rel, "mode": "100644", "type": "blob", "sha": blob["sha"]})
    if (i + 1) % 30 == 0:
        print(f"  blob {i+1}/{len(items)}")

# 拿父 commit，重建 tree，提交，更新 ref
ref = call("GET", f"/repos/{REPO}/git/refs/heads/gh-pages")
parent = ref["object"]["sha"]
new_tree = call("POST", f"/repos/{REPO}/git/trees", {"tree": tree})
commit = call("POST", f"/repos/{REPO}/git/commits",
              {"message": "deploy: rebuild dist", "tree": new_tree["sha"], "parents": [parent]})
call("PATCH", f"/repos/{REPO}/git/refs/heads/gh-pages",
     {"sha": commit["sha"], "force": True})
print(f"[gh-pages] -> {commit['sha'][:8]}")
print("[next] GitHub Actions 会自动跑 deploy workflow 并发布 Pages")
