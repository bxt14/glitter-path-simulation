# 把 src/ 下的分片拼成单文件 glitter-path.html（内联 three.js，零外部请求）
# 用法：powershell -File build.ps1
$D = $PSScriptRoot
$out = Join-Path $D 'glitter-path.html'
$parts = @(
  (Get-Content (Join-Path $D 'src\01_shell.html') -Raw -Encoding utf8)
  '<script>'
  (Get-Content (Join-Path $D 'src\vendor\three.min.js') -Raw -Encoding utf8)
  ''
  '</script>'
  '<script>'
  (Get-Content (Join-Path $D 'src\02_core.js') -Raw -Encoding utf8)
  (Get-Content (Join-Path $D 'src\03_glitter.js') -Raw -Encoding utf8)
  (Get-Content (Join-Path $D 'src\04_micro_cones_ui.js') -Raw -Encoding utf8)
  (Get-Content (Join-Path $D 'src\05_equations.js') -Raw -Encoding utf8)
  '</script>'
)
# 不带 BOM 写出，否则页面开头会多出一个不可见字符
[IO.File]::WriteAllText($out, ($parts -join "`n") + "`n", (New-Object Text.UTF8Encoding $false))
"{0} bytes -> {1}" -f (Get-Item $out).Length, $out
