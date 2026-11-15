param([Parameter(Mandatory=$true)][string]$RunId)
$ErrorActionPreference = 'Stop'
if ($RunId -notmatch '^[a-zA-Z0-9_-]+$') { throw 'Simple unique run ID required' }
$taskControlDirectory = Join-Path 'artifacts/perf-hillclimb' $RunId
New-Item -ItemType Directory -Path $taskControlDirectory | Out-Null
Copy-Item -LiteralPath $PSCommandPath -Destination (Join-Path $taskControlDirectory 'launch-failure-controls.ps1')
$taskControls = @(
  @{name='first';jobs='entry';target='entry';launches=1;prior=$false},
  @{name='previous-closed-page';jobs='entry,performance-continue';target='performance-continue';launches=2;prior=$true}
)
$taskAssessments = @()
foreach ($taskControl in $taskControls) {
  $taskChildId = $RunId + '-' + $taskControl.name
  $taskArguments = @('scripts/perf-hillclimb/run.mjs',
    '--fixture-manifest=artifacts/perf-hillclimb/frozen-baseline-a9df52c-sourceproof-20261104/manifest.json',
    '--fixture-manifest-id=406f042f7e4a3142620b8d05023167d98893185d24347f4745740a3a3feac000',
    '--seed=123','--artwork=off','--population=desktop','--cache=cold','--samples=1',
    '--control=pre-page-failure',('--control-job=' + $taskControl.target),('--jobs=' + $taskControl.jobs),('--id=' + $taskChildId))
  Write-Output ('[launch-failure-controls] ' + $taskControl.name)
  & node @taskArguments
  $taskExit = $LASTEXITCODE
  $taskChildDirectory = Join-Path 'artifacts/perf-hillclimb' $taskChildId
  $taskManifest = Get-Content (Join-Path $taskChildDirectory 'manifest.json') -Raw | ConvertFrom-Json
  $taskFailure = Get-Content (Join-Path $taskChildDirectory ($taskControl.target + '-job-failure.json')) -Raw | ConvertFrom-Json
  $taskOriginal = Get-Content (Join-Path $taskChildDirectory 'failure.txt') -Raw
  if ($taskExit -ne 1 -or -not $taskManifest.failed -or $taskManifest.launches.Count -ne $taskControl.launches -or
      $taskFailure.originalError.message -ne 'deliberate pre-page harness control' -or $taskOriginal -notmatch 'deliberate pre-page harness control' -or
      $taskFailure.document.available -or $taskFailure.document.reason -ne 'no page was created for this launch' -or $taskFailure.observationCount -ne 0) {
    throw ('Original pre-page error or launch scope lost: ' + $taskControl.name)
  }
  $taskFailedLaunch = $taskManifest.launches[-1]
  if ($taskFailure.launchId -ne $taskFailedLaunch.launchId -or $taskFailedLaunch.job -ne $taskControl.target) { throw 'Failure attributed to a different launch' }
  $taskRows = @()
  $taskRowsFile = Join-Path $taskChildDirectory 'observations.jsonl'
  if (Test-Path -LiteralPath $taskRowsFile) { $taskRows = @(Get-Content $taskRowsFile | ForEach-Object { $_ | ConvertFrom-Json }) }
  if (@($taskRows | Where-Object { $_.launchId -eq $taskFailedLaunch.launchId }).Count -ne 0) { throw 'Setup failure invented operation timings' }
  if ($taskControl.prior) {
    if ($taskRows.Count -lt 4 -or @($taskRows | Where-Object { -not $_.ok -or $_.launchId -ne $taskManifest.launches[0].launchId }).Count -ne 0) {
      throw 'Previous actual game launch did not complete before the pre-page failure control'
    }
  } elseif ($taskRows.Count -ne 0) { throw 'First-launch setup failure produced observation rows' }
  $taskAssessment = [ordered]@{name=$taskControl.name;id=$taskChildId;argv=$taskArguments;exitCode=$taskExit;
    expectedNegativeControlPassed=$true;productCasePassed=$false;originalErrorPreserved=$true;currentLaunchPageUnavailable=$true;
    failedLaunchHasNoTiming=$true;priorObservations=$taskRows.Count;launches=$taskManifest.launches.Count;
    scope='setup-error identity control only; no product latency or whole-harness acceptance'}
  $taskAssessments += $taskAssessment
  $taskAssessments | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $taskControlDirectory 'assessments.json') -Encoding utf8
  Write-Output ('[launch-failure-controls] PASS original error/no borrowed page/no invented timing: ' + $taskControl.name)
}
Write-Output ('[launch-failure-controls] PASS ' + $taskAssessments.Count + ' controls; ' + $taskControlDirectory)
