#!/bin/sh
# 把 src/ 下的分片拼成单文件 glitter-path.html（内联 three.js，零外部请求）
# 用法：sh build.sh          （Git Bash / WSL）
set -e
D="$(dirname "$0")"
OUT="$D/glitter-path.html"
{
  cat "$D/src/01_shell.html"
  echo '<script>'
  cat "$D/src/vendor/three.min.js"
  echo ''
  echo '</script>'
  echo '<script>'
  cat "$D/src/02_core.js" "$D/src/03_glitter.js" "$D/src/04_micro_cones_ui.js" "$D/src/05_equations.js"
  echo '</script>'
} > "$OUT"
wc -c "$OUT"
