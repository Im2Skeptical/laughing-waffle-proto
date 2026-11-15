param([Parameter(Mandatory=$true)][string]$RunId)
$ErrorActionPreference = 'Stop'
if ($RunId -notmatch '^[a-zA-Z0-9_-]+$') { throw 'Simple unique run ID required' }
$taskControlDirectory = Join-Path 'artifacts/perf-hillclimb' $RunId
New-Item -ItemType Directory -Path $taskControlDirectory | Out-Null
Copy-Item -LiteralPath $PSCommandPath -Destination (Join-Path $taskControlDirectory 'artwork-failure-controls.ps1')
$taskControls = @(
  @{name='throw';options=@('--control-diagnostic=throw');expected='deliberate artwork diagnostic stall-and-throw';completedRaw=$false},
  @{name='never';options=@('--control-diagnostic=never');expected='deliberate never diagnostic control timeout after 1000ms';completedRaw=$false},
  @{name='post-collection';options=@('--control-diagnostic=post-collection');expected='deliberate post-collection artwork assertion';completedRaw=$true},
  @{name='final-read';options=@('--control-final-read=never');expected='final artwork operation marker timeout after 5000ms';completedRaw=$false},
  @{name='case-hang';options=@('--control-case-hang=1','--case-timeout=30000');expected='artwork reference lifetime timeout after 30000ms';completedRaw=$false}
)
$taskAssessments = @()
foreach ($taskControl in $taskControls) {
  $taskChildId = $RunId + '-' + $taskControl.name
  $taskArguments = @('scripts/perf-hillclimb/artwork-controls.mjs','--cases=reference','--cycles=1',('--id=' + $taskChildId)) + $taskControl.options
  $taskStarted = [DateTime]::UtcNow
  Write-Output ('[artwork-failure-controls] ' + $taskControl.name)
  & node @taskArguments
  $taskExit = $LASTEXITCODE
  $taskChildDirectory = Join-Path 'artifacts/perf-hillclimb' $taskChildId
  $taskSummary = Get-Content (Join-Path $taskChildDirectory 'summary.json') -Raw | ConvertFrom-Json
  $taskRaw = Get-Content (Join-Path $taskChildDirectory 'reference-failure-observation.json') -Raw | ConvertFrom-Json
  $taskCleanup = Get-Content (Join-Path $taskChildDirectory 'reference-cleanup.json') -Raw | ConvertFrom-Json
  if ($taskExit -ne 1 -or $taskSummary.ok -or $taskSummary.completedCases -ne 0 -or $taskSummary.observations -lt 2 -or
      $taskSummary.caseFailures[0].error -notmatch [regex]::Escape($taskControl.expected)) { throw ('Wrong negative-control outcome: ' + $taskControl.name) }
  if (-not $taskRaw.availability.continuous -or -not $taskRaw.availability.witness -or
      -not $taskCleanup.contextClosed -or -not $taskCleanup.browserClosed -or $taskCleanup.browserConnected -or $taskCleanup.errors.Count -ne 0) {
    throw ('Lost raw evidence or incomplete owned cleanup: ' + $taskControl.name)
  }
  $taskCompletedRawFile = Join-Path $taskChildDirectory 'reference-completed-observation.json'
  if ($taskControl.completedRaw -and -not (Test-Path -LiteralPath $taskCompletedRawFile)) { throw 'Post-collection failure discarded completed raw data' }
  $taskCrossingStalls = @()
  if ($taskControl.name -in @('throw','never')) {
    $taskWindow = $taskRaw.diagnosticWindows | Where-Object { $_.label -like ('deliberate ' + $taskControl.name + '*') } | Select-Object -First 1
    if (-not $taskWindow -or $taskWindow.status -ne 'failed' -or $null -ne $taskWindow.endMs) { throw 'Failed diagnostic completion was fabricated' }
    if ($taskControl.name -eq 'throw') {
      $taskCrossingStalls = @($taskRaw.continuous.session.frames | Where-Object { $_.dt -ge 180 -and $_.time -gt $taskWindow.startMs -and ($_.time-$_.dt) -lt $taskRaw.continuous.session.endMs })
      if ($taskCrossingStalls.Count -eq 0) { throw 'Known diagnostic renderer stall disappeared from raw telemetry' }
    }
  }
  if ($taskControl.name -ne 'case-hang' -and $taskCleanup.lifetime.unconfirmedWork.Count -ne 0) { throw 'Unexpected unconfirmed work after owned browser closed' }
  $taskAssessment = [ordered]@{name=$taskControl.name;id=$taskChildId;argv=$taskArguments;exitCode=$taskExit;
    expectedNegativeControlPassed=$true;productCasePassed=$false;rawFrames=$taskRaw.continuous.session.frames.Count;
    priorObservations=$taskSummary.observations;knownCrossingStalls=$taskCrossingStalls.Count;completedRawRetained=(Test-Path -LiteralPath $taskCompletedRawFile);
    contextClosed=$taskCleanup.contextClosed;browserClosed=$taskCleanup.browserClosed;unconfirmedWork=$taskCleanup.lifetime.unconfirmedWork;
    started=$taskStarted.ToString('o');finished=[DateTime]::UtcNow.ToString('o');scope='expected failures and liveness controls, comparison-ineligible; no product latency pass'}
  $taskAssessments += $taskAssessment
  $taskAssessments | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath (Join-Path $taskControlDirectory 'assessments.json') -Encoding utf8
  Write-Output ('[artwork-failure-controls] PASS expected failure/retention/cleanup: ' + $taskControl.name)
}
Write-Output ('[artwork-failure-controls] PASS ' + $taskAssessments.Count + ' controls; ' + $taskControlDirectory)
