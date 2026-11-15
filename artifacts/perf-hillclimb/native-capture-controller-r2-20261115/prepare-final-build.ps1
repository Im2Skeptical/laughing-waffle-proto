$ErrorActionPreference='Stop'
$root=Join-Path (Get-Location) 'artifacts/perf-hillclimb/native-capture-controller-r2-20261115'
$saved=Join-Path $root 'preliminary-build'
if(Test-Path -LiteralPath $saved){throw 'Preliminary build already preserved'}
[IO.Directory]::CreateDirectory($saved)|Out-Null
foreach($file in @('CaptureController.dll','SyntheticCaptureTarget.exe','compile-observer.log','compile-observer-exit.txt','compile-target.log','compile-target-exit.txt','build-pure.json','build-only.ps1')){Copy-Item -LiteralPath (Join-Path $root $file) -Destination (Join-Path $saved $file)}
$text=Get-Content -LiteralPath (Join-Path $root 'build-only.ps1') -Raw
foreach($pair in @(@('CaptureController.dll','CaptureController-final.dll'),@('SyntheticCaptureTarget.exe','SyntheticCaptureTarget-final.exe'),@('build-pure.json','build-pure-final.json'),@('compile-observer.log','compile-observer-final.log'),@('compile-observer-exit.txt','compile-observer-final-exit.txt'),@('compile-target.log','compile-target-final.log'),@('compile-target-exit.txt','compile-target-final-exit.txt'))){$text=$text.Replace($pair[0],$pair[1])}
[IO.File]::WriteAllText((Join-Path $root 'build-final-only.ps1'),$text,[Text.UTF8Encoding]::new($false))
