param([Parameter(Mandatory=$true)][string]$FixtureRoot,[Parameter(Mandatory=$true)][string]$SinceIso,[Parameter(Mandatory=$true)][string]$OutputPath)
$ErrorActionPreference='Stop'
$resolved=(Resolve-Path -LiteralPath $FixtureRoot).ProviderPath
$tempRoot=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
if(-not [string]::Equals([IO.Path]::GetDirectoryName($resolved),$tempRoot,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolved) -notlike 'civilization-build-preview-*'){throw 'Unexpected fixture ownership root'}
$since=[DateTimeOffset]::Parse($SinceIso).UtcDateTime
function OwnedCandidates {
  @(Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'node.exe' -and $_.CreationDate.ToUniversalTime() -ge $since -and $_.CommandLine -and
    $_.CommandLine.Replace('/','\').IndexOf($resolved+'\',[StringComparison]::OrdinalIgnoreCase) -ge 0 -and
    $_.CommandLine -match 'local-preview\.mjs"?\s+--serve\s+\d+'
  })
}
$before=@(OwnedCandidates);$stopped=@();$errors=@()
foreach($candidate in $before){
  try{
    $now=Get-CimInstance Win32_Process -Filter "ProcessId=$($candidate.ProcessId)"
    if(-not $now){continue}
    if($now.CommandLine -ne $candidate.CommandLine -or $now.CreationDate -ne $candidate.CreationDate){throw 'PID identity changed; not stopped'}
    Stop-Process -Id $candidate.ProcessId -Force -ErrorAction Stop
    $stopped+=$candidate.ProcessId
  }catch{$errors+=@{pid=$candidate.ProcessId;error=$_.Exception.Message}}
}
Start-Sleep -Milliseconds 100
$after=@(OwnedCandidates)
$receipt=[pscustomobject]@{at=[DateTime]::UtcNow.ToString('o');fixtureRoot=$resolved;since=$SinceIso;before=@($before|ForEach-Object{[pscustomobject]@{pid=$_.ProcessId;parentPid=$_.ParentProcessId;createdUtc=$_.CreationDate.ToUniversalTime().ToString('o');commandLine=$_.CommandLine}});stopped=$stopped;remaining=@($after|ForEach-Object{$_.ProcessId});errors=$errors;fixturePreserved=$true;scope='Only exact registered fixture preview servers created during this attempt; no filesystem delete or other preview stopped'}
[IO.File]::WriteAllText($OutputPath,($receipt|ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false))
Write-Output "Owned cleanup: $($stopped.Count) stopped, $($after.Count) remaining, $($errors.Count) errors"
if($after.Count -gt 0 -or $errors.Count -gt 0){exit 1}
