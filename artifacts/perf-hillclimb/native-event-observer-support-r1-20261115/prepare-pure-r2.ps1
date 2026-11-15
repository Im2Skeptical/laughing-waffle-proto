$ErrorActionPreference='Stop'
$root=Join-Path (Get-Location) 'artifacts/perf-hillclimb/native-event-observer-support-r1-20261115'
$target=Join-Path $root 'build-pure-r2.ps1'
if(Test-Path -LiteralPath $target){throw 'Never overwrite fresh r2 fixture'}
$text=Get-Content -LiteralPath (Join-Path $root 'build-pure.ps1') -Raw
foreach($pair in @(@('pure-result.json','pure-result-r2.json'),@('NativeCaptureSupport.dll','NativeCaptureSupport-r2.dll'),@('compile.log','compile-r2.log'),@('compile-exit.txt','compile-exit-r2.txt'),@("'pure-fixture'","'pure-fixture-r2'"))){$text=$text.Replace($pair[0],$pair[1])}
$before='([Runtime.InteropServices.Marshal]::SizeOf($type))'
if($text.Split(@($before),[StringSplitOptions]::None).Count -ne 2){throw 'Unique adapter fix not found'}
$text=$text.Replace($before,'([Runtime.InteropServices.Marshal]::SizeOf([Activator]::CreateInstance($type)))')
[IO.File]::WriteAllText($target,$text,[Text.UTF8Encoding]::new($false))
