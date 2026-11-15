$ErrorActionPreference='Stop'
$root=Join-Path (Get-Location) 'artifacts/perf-hillclimb/native-event-observer-lifecycle-r3-20261115'
$target=Join-Path $root 'build-pure-pipe-r2.ps1'
if(Test-Path -LiteralPath $target){throw 'Fresh recipe exists'}
$text=Get-Content -LiteralPath (Join-Path $root 'build-pure.ps1') -Raw
foreach($pair in @(@('pure-result.json','pure-result-pipe-r2.json'),@('NativeCaptureRepair.dll','NativeCaptureRepair-pipe-r2.dll'),@('compile.log','compile-pipe-r2.log'),@('compile-exit.txt','compile-exit-pipe-r2.txt'))){$text=$text.Replace($pair[0],$pair[1])}
[IO.File]::WriteAllText($target,$text,[Text.UTF8Encoding]::new($false))
