$ErrorActionPreference = 'Stop'
$taskOld = 'C:/Users/User/.t3/worktrees/laughing-waffle-proto/perf-hillclimb-20261104'
$taskRoot = Join-Path $taskOld 'artifacts/perf-hillclimb/native-trial-lifetime-r1-20261115'
$taskOut = Join-Path $taskRoot 'checkpoint-r0.json'
if (Test-Path -LiteralPath $taskOut) { throw 'Checkpoint already exists; do not overwrite.' }
function Get-TaskHash([string]$path) {
    (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
}
function Test-TaskPins($pins, [string]$base) {
    $count = 0
    foreach ($item in $pins.PSObject.Properties) {
        $path = if ([IO.Path]::IsPathRooted($item.Name)) { $item.Name } else { Join-Path $base $item.Name }
        if ((Get-TaskHash $path) -cne $item.Value) { throw ('Frozen pin changed: ' + $path) }
        $count++
    }
    return $count
}
$taskAuthority = Get-Content -Raw -LiteralPath (Join-Path $taskOld 'artifacts/perf-hillclimb/j8-paired-wait-progress-r1-20261115/plan.json') | ConvertFrom-Json
$taskR4 = Get-Content -Raw -LiteralPath (Join-Path $taskOld 'artifacts/perf-hillclimb/native-capture-controller-r4-20261115/plan.json') | ConvertFrom-Json
$taskActual = Get-Content -Raw -LiteralPath (Join-Path $taskOld 'artifacts/perf-hillclimb/native-capture-controller-r4-result-20261115/summary.json') | ConvertFrom-Json
$taskBuild = Get-Content -Raw -LiteralPath (Join-Path $taskRoot 'build-policy-r0.json') | ConvertFrom-Json
$taskSources = Test-TaskPins $taskAuthority.sources $taskOld
$taskAssets = Test-TaskPins $taskAuthority.assets (Join-Path $taskOld 'dist')
$taskR4Pins = Test-TaskPins $taskR4.files $taskOld
$taskOriginals = Test-TaskPins $taskActual.originalFilePins $taskOld
$taskBuildPins = Test-TaskPins $taskBuild.files $taskOld
if ($taskSources -ne 683 -or $taskAssets -ne 5 -or $taskR4Pins -ne 45 -or $taskOriginals -ne 76) { throw 'Unexpected frozen inventory size.' }
if ($taskBuild.checks.Count -ne 38 -or $taskBuild.policyCompileExit -ne 0 -or $taskBuild.targetCompileExit -ne 0) { throw 'Unexpected source/pure proof receipt.' }
$taskProcesses = @(Get-CimInstance Win32_Process | Where-Object {
    $_.ProcessId -ne $PID -and
    ($_.Name -eq 'csc.exe' -or $_.Name -eq 'TrialTarget-r0.exe' -or
     ($_.CommandLine -match '(native-trial-lifetime-r1-20261115|control-[1-6]-|host-r4|supervise-r4)' -and $_.Name -match '^(powershell|pwsh|node|TrialTarget.*|NativeCaptureTarget.*)\.exe$'))
} | Select-Object ProcessId,ParentProcessId,Name)
if ($taskProcesses.Count -ne 0) { throw ('Matching source/native/compiler processes remain: ' + ($taskProcesses | ConvertTo-Json -Compress)) }
$taskFiles = [ordered]@{}
foreach ($item in Get-ChildItem -LiteralPath $taskRoot -File -Recurse | Sort-Object FullName) {
    $taskFiles[$item.FullName] = Get-TaskHash $item.FullName
}
$taskReceipt = [ordered]@{
    at = [DateTime]::UtcNow.ToString('o')
    phase = 'INCOMPLETE_SYNTHETIC_TRIAL_LIFETIME_SOURCE_AND_MANAGED_POLICY_ONLY'
    sourceCountUnchanged = $taskSources
    assetCountUnchanged = $taskAssets
    r4PlanPinsUnchanged = $taskR4Pins
    r4OriginalActualFilesUnchanged = $taskOriginals
    sourceBuildPinsUnchanged = $taskBuildPins
    sourceFiles = $taskFiles
    policyCompileExit = 0
    targetCompileExit = 0
    managedControlsPassed = 38
    targetMainInvoked = $false
    newNativeCalls = 0
    matchingProcessCount = $taskProcesses.Count
    nativeLease = 'NOT_ACQUIRED'
    sourceCompilerPureLease = 'CLOSED_AFTER_THIS_CHECKPOINT'
    next = 'Coordinator NATIVE_TRIAL_LIFETIME_SOURCE_RESUME_R1.md and local SOURCE_RESUME_R1.md; finish connected multi-PID native adapter/controller/oracle/config, then one independent COMPLETE source gate.'
    scope = 'State fixtures and synthetic target compiled; metadata only. No native helper constructor/API/Run/Main, target, stop, preview, performance sample or admission. Copied r4 wrappers unmodified and unconnected. Whole Phase A NOT SOUND. No cause/fix/neutrality/full-verify PASS/scoring/optimization/PR/merge/Pages.'
}
$taskReceipt | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $taskOut -Encoding UTF8
[ordered]@{ checkpoint = $taskOut; sha256 = Get-TaskHash $taskOut; pinnedFiles = $taskFiles.Count; sources = $taskSources; assets = $taskAssets; r4Pins = $taskR4Pins; r4Originals = $taskOriginals; managed = 38; matchingProcesses = $taskProcesses.Count } | ConvertTo-Json -Compress
