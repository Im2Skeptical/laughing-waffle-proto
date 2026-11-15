param([Parameter(Mandatory=$true)][int]$Index)
$ErrorActionPreference='Stop'
$root=Join-Path (Get-Location) 'artifacts/perf-hillclimb/native-capture-controller-r1-20261115'
$planFile=Join-Path $root 'plan.json';$admissionFile=Join-Path $root 'admission.json'
$plan=Get-Content -LiteralPath $planFile -Raw | ConvertFrom-Json
$admission=Get-Content -LiteralPath $admissionFile -Raw | ConvertFrom-Json
if($admission.verdict -ne 'ACCEPTED_SYNTHETIC_SOURCE_ONLY'){throw 'Independent complete-source admission missing'}
if((Get-FileHash -LiteralPath $planFile -Algorithm SHA256).Hash.ToLowerInvariant() -ne $admission.planSha256){throw 'Plan differs from admission'}
foreach($pin in $plan.files.PSObject.Properties){if((Get-FileHash -LiteralPath $pin.Name -Algorithm SHA256).Hash.ToLowerInvariant() -ne $pin.Value){throw ('Pinned file differs: '+$pin.Name)}}
if([DateTime]::UtcNow -ge [DateTimeOffset]::Parse('2026-11-16T01:45:00Z').UtcDateTime){throw 'No new native leaf after reserve cutoff'}
if($Index -lt 0 -or $Index -gt 5){throw 'Invalid fixed slot'}
$slot=$plan.slots[$Index]
if($slot.index -ne $Index){throw 'Wrong slot binding'}
[Reflection.Assembly]::LoadFile($plan.observerDll)|Out-Null
$cfg=[NativeCapturePrototype.CaptureConfig]::new()
foreach($key in @('ArtifactRoot','RunRoot','Id','Mode','Executable','ExecutableSha256','Cwd')){$cfg.$key=[string]$slot.config.$key}
foreach($key in @('WorkLimitMs','RawByteLimit','EventLimit','ExceptionLimit','ReceiptByteLimit')){$cfg.$key=[int]$slot.config.$key}
$cfg.Arguments=[string[]]$slot.config.Arguments
$hostRecord=[ordered]@{at=[DateTime]::UtcNow.ToString('o');hostPid=$PID;hostCreatedUtc=(Get-Process -Id $PID).StartTime.ToUniversalTime().ToString('o');slot=$Index;planSha256=$admission.planSha256}
$hostFile=Join-Path $cfg.RunRoot 'host-launch.json'
$stream=[IO.File]::Open($hostFile,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
try{$bytes=[Text.Encoding]::UTF8.GetBytes(($hostRecord|ConvertTo-Json -Depth 4));$stream.Write($bytes,0,$bytes.Length)}finally{$stream.Dispose()}
$result=[NativeCaptureController.CaptureController]::Run($cfg,[string[]]@($plan.targetExe),$slot.configSha256,$plan.ntdllSha256)
Write-Output $result
if($result -eq 'INCOMPLETE'){exit 2}
