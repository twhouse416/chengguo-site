#!/usr/bin/env bash
#
# 澄果團隊｜工作流程共用的「提交並推送」步驟
# ------------------------------------------------
# 用法：bash scripts/git-push-retry.sh "提交訊息" 路徑1 路徑2 ...
#
# 為什麼要有這支腳本：
#   原本每個工作流程各自寫一段推送重試，裡面用的是
#       git pull --rebase --autostash || true
#   兩個工作流程同時跑的時候（例如「同步影片」跟「更新行情」都會重建全站），
#   後推的那一個會被 GitHub 擋下來，接著 pull --rebase 在產生出來的 HTML 上撞到衝突。
#   `|| true` 把錯誤吞掉，但 repo 已經停在 rebase 中途、留著未合併的檔案，
#   於是後面每一次重試都撞同一個錯，最後就是執行紀錄上看到的：
#       error: Pulling is not possible because you have unmerged files.
#       fatal: You are not currently on a branch.
#       Error: 推送失敗 5 次
#
# 這裡改成不做合併：被擋下來時，直接以遠端最新為底，
# 只把這次產生的那幾個路徑重新套上去，再提交一次。
#   - 不可能有衝突，也就不會卡在未合併狀態
#   - 這些路徑本來就是機器產生的（HTML、tailwind.css、資料 JSON），
#     以「這次跑出來的結果」為準是正確的
#   - 其他路徑完全採用遠端版本，不會蓋掉別的工作流程剛推上去的東西
#
# 另外 actions/checkout 取出來的是 detached HEAD，
# 先 checkout -B 回真正的分支，推送與重試才不會出現
# 「You are not currently on a branch」。

set -uo pipefail

if [ "$#" -lt 2 ]; then
  echo "::error::用法：git-push-retry.sh \"提交訊息\" 路徑..."
  exit 1
fi

MSG="$1"; shift
BRANCH="${GITHUB_REF_NAME:-main}"
RETRIES="${PUSH_RETRIES:-5}"

# 只保留真的存在的路徑。像 assets/videos、data/area-deals 這種目錄
# 在還沒跑過對應流程時可能不存在，git add 遇到就會整個失敗。
PATHS=()
for p in "$@"; do
  # 檔案被這次建置刪掉時，工作目錄裡雖然沒有，但 git 還記得，
  # 這種要留著讓 git add 記錄下刪除。
  if [ -e "$p" ] || git ls-files --error-unmatch -- "$p" >/dev/null 2>&1; then
    PATHS+=("$p")
  else
    echo "（略過不存在的路徑：$p）"
  fi
done
if [ "${#PATHS[@]}" -eq 0 ]; then
  echo "::error::指定的路徑都不存在，沒有東西可以提交"
  exit 1
fi

git config user.name "chengguo-bot"
git config user.email "actions@users.noreply.github.com"

# 保險：萬一進來時就卡在 rebase／merge 中途，先清乾淨，
# 否則 git add 會把含衝突標記的檔案加進去。
# 正常情況下 actions/checkout 取出來是乾淨的，這三行不會做任何事。
git rebase --abort >/dev/null 2>&1 || true
git merge  --abort >/dev/null 2>&1 || true
git am     --abort >/dev/null 2>&1 || true

# 落回真正的分支（checkout@v4 預設是 detached HEAD）
git checkout -B "$BRANCH" >/dev/null 2>&1 || true

if ! git add -- "${PATHS[@]}"; then
  echo "::error::git add 失敗"
  exit 1
fi

if git diff --cached --quiet; then
  echo "工作目錄沒有新變動"
else
  git commit -m "$MSG" || { echo "::error::git commit 失敗"; exit 1; }
fi

ahead="$(git rev-list --count "origin/$BRANCH..HEAD" 2>/dev/null || echo 1)"
if [ "$ahead" = "0" ]; then
  echo "沒有需要推送的內容"
  exit 0
fi

for i in $(seq 1 "$RETRIES"); do
  if git push origin "HEAD:$BRANCH"; then
    echo "推送成功"
    exit 0
  fi

  if [ "$i" -ge "$RETRIES" ]; then
    echo "::error::推送失敗 $RETRIES 次"
    exit 1
  fi

  WAIT=$((i * 15))
  echo "推送失敗，${WAIT} 秒後重試（第 $i 次）"
  sleep "$WAIT"

  # 清掉任何殘留狀態，否則接下來每一個 git 指令都會被未合併的檔案擋住
  git rebase --abort >/dev/null 2>&1 || true
  git merge  --abort >/dev/null 2>&1 || true
  git am     --abort >/dev/null 2>&1 || true

  MINE="$(git rev-parse HEAD)"

  if ! git fetch origin "$BRANCH"; then
    echo "  取回遠端失敗，直接重試推送"
    continue
  fi

  # 這次實際改到的檔案（只有這幾個要重新套上去；
  # 其餘一律採用遠端版本，才不會把別的工作流程剛推上去的結果洗掉）
  mapfile -t CHANGED < <(git diff --name-only "$MINE^" "$MINE")
  echo "  以遠端最新為底重做，套回 ${#CHANGED[@]} 個檔案"

  # 以遠端最新為底，只把這次改到的檔案套回來：不會有衝突
  git reset --hard FETCH_HEAD >/dev/null || { echo "::error::無法切到遠端最新"; exit 1; }
  for f in "${CHANGED[@]}"; do
    if git cat-file -e "$MINE:$f" 2>/dev/null; then
      git checkout "$MINE" -- "$f" 2>/dev/null || true
      git add -A -- "$f" 2>/dev/null || true
    else
      # 這次建置刪掉的檔案：在新的基底上也要刪掉
      git rm -q -f --ignore-unmatch -- "$f" 2>/dev/null || true
    fi
  done

  if git diff --cached --quiet; then
    echo "遠端已經是相同內容，不需要再推送"
    exit 0
  fi
  git commit -m "$MSG" || { echo "::error::重新提交失敗"; exit 1; }
done

echo "::error::推送失敗 $RETRIES 次"
exit 1
