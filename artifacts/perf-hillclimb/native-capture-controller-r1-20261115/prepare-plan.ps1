$ErrorActionPreference='Stop'
$root=Join-Path (Get-Location) 'artifacts/perf-hillclimb/native-capture-controller-r1-20261115'
$out=Join-Path $root 'plan.json';if(Test-Path -LiteralPath $out){throw 'Never overwrite fixed control plan'}
$observer=Join-Path $root 'CaptureController-final.dll';$target=Join-Path $root 'SyntheticCaptureTarget-final.exe'
[Reflection.Assembly]::LoadFile($observer)|Out-Null
$evidence=Join-Path $root 'controls';[IO.Directory]::CreateDirectory($evidence)|Out-Null
$modes=@('normal','nonzero','synthetic-native','timeout','descendant','observer-failure');$slots=@()
$targetHash=(Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
for($i=0;$i -lt 6;$i++){
  $mode=$modes[$i];$id="control-$i-$mode";$run=Join-Path $evidence $id
  if(Test-Path -LiteralPath $run){throw 'Fresh root already exists'};[IO.Directory]::CreateDirectory($run)|Out-Null
  $c=[NativeCapturePrototype.CaptureConfig]::new();$c.ArtifactRoot=$evidence;$c.RunRoot=$run;$c.Cwd=$run;$c.Id=$id;$c.Mode=$mode;$c.Executable=$target;$c.ExecutableSha256=$targetHash;$c.Arguments=[string[]]@($mode,$run)
  $c.WorkLimitMs=if($mode -eq 'timeout'){1000}else{10000};$c.RawByteLimit=1048576;$c.EventLimit=2048;$c.ExceptionLimit=128;$c.ReceiptByteLimit=4194304
  $hash=[NativeCapturePrototype.Guard]::Fingerprint($c);[NativeCapturePrototype.Guard]::Validate($c,[string[]]@($target),$hash)
  $slots+=@{index=$i;config=$c;configSha256=$hash}
}
$ps=(Get-Process -Id $PID).Path;$ntdll=Join-Path $env:WINDIR 'System32/ntdll.dll'
$files=@{};foreach($file in @((Get-ChildItem -LiteralPath $root -File | Where-Object {$_.Extension -in @('.cs','.ps1','.mjs') -and $_.Name -ne 'authenticate.mjs'}|ForEach-Object{$_.FullName}))+@($observer,$target,$ps,$ntdll)){$files[$file]=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()}
$plan=[ordered]@{created=[DateTime]::UtcNow.ToString('o');deadline='2026-11-16T02:40:00Z';observerDll=$observer;targetExe=$target;powerShell=$ps;ntdllSha256=$files[$ntdll];files=$files;slots=$slots;batchWallLimitMs=90000;perHostLimitMs=35000;retries=0;scope='Predeclared six synthetic slots only; requires independent source admission. No target launched during preparation; distinct diagnostic population, not preview/product timing/SOUND.'}
[IO.File]::WriteAllText($out,($plan|ConvertTo-Json -Depth 12),[Text.UTF8Encoding]::new($false))
[pscustomobject]@{slots=$slots.Count;planSha256=(Get-FileHash -LiteralPath $out -Algorithm SHA256).Hash.ToLowerInvariant();targetLaunched=$false}|ConvertTo-Json -Compress
