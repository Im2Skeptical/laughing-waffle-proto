param([Parameter(Mandatory=$true)][int]$Index,[Parameter(Mandatory=$true)][int]$ExpectedPid)
$ErrorActionPreference='Stop'
$root=Join-Path (Get-Location) 'artifacts/perf-hillclimb/native-capture-controller-r2-20261115'
$plan=Get-Content -LiteralPath (Join-Path $root 'plan.json') -Raw | ConvertFrom-Json
if($Index -lt 0 -or $Index -gt 5){throw 'Invalid fixed slot'}
if((Get-FileHash -LiteralPath $plan.observerDll -Algorithm SHA256).Hash.ToLowerInvariant() -ne $plan.files.($plan.observerDll)){throw 'Observer binary changed'}
$run=$plan.slots[$Index].config.RunRoot
$record=Get-Content -LiteralPath (Join-Path $run 'host-launch.json') -Raw | ConvertFrom-Json
if($record.hostPid -ne $ExpectedPid -or $record.slot -ne $Index){throw 'Host record ownership mismatch; no termination'}
$time=[DateTimeOffset]::Parse($record.hostCreatedUtc).UtcDateTime.ToFileTimeUtc()
[Reflection.Assembly]::LoadFile($plan.observerDll)|Out-Null
$stopped=[NativeCaptureController.SupervisorFailsafe]::StopExactHost([uint32]$ExpectedPid,[uint64]$time,$plan.powerShell)
[pscustomobject]@{hostPid=$ExpectedPid;identityMatched=$true;exitObserved=$stopped;scope='Only exact owned host; no image-wide/tree PID termination'}|ConvertTo-Json -Compress
if(-not $stopped){exit 1}
