$ErrorActionPreference='Stop'
$base=Join-Path (Get-Location) 'artifacts/perf-hillclimb/native-event-observer-lifecycle-r2-20261115'
$root=Join-Path (Get-Location) 'artifacts/perf-hillclimb/native-event-observer-lifecycle-r3-20261115'
$target=Join-Path $root 'build-pure.ps1'
if(Test-Path -LiteralPath $target){throw 'Never overwrite r3 build recipe'}
$text=(Get-Content -LiteralPath (Join-Path $base 'build-pure.ps1') -Raw).Replace('native-event-observer-lifecycle-r2-20261115','native-event-observer-lifecycle-r3-20261115').Replace('Never overwrite r2 proof','Never overwrite r3 proof')
[IO.File]::WriteAllText($target,$text,[Text.UTF8Encoding]::new($false))
