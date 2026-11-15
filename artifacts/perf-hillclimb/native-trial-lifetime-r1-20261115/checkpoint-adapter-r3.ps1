$ErrorActionPreference='Stop'
$taskOld='C:/Users/User/.t3/worktrees/laughing-waffle-proto/perf-hillclimb-20261104'
$taskRoot=Join-Path $taskOld 'artifacts/perf-hillclimb/native-trial-lifetime-r1-20261115'
$taskOut=Join-Path $taskRoot 'checkpoint-adapter-r3.json'
if(Test-Path -LiteralPath $taskOut){throw 'Checkpoint identity used'}
function Get-TaskHash([string]$path){(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Test-TaskPins($pins,[string]$base){$count=0;foreach($item in $pins.PSObject.Properties){$path=if([IO.Path]::IsPathRooted($item.Name)){$item.Name}else{Join-Path $base $item.Name};if((Get-TaskHash $path) -cne $item.Value){throw ('Frozen pin changed: '+$path)};$count++};return $count}
$taskAuthority=Get-Content -Raw -LiteralPath (Join-Path $taskOld 'artifacts/perf-hillclimb/j8-paired-wait-progress-r1-20261115/plan.json')|ConvertFrom-Json
$taskR4=Get-Content -Raw -LiteralPath (Join-Path $taskOld 'artifacts/perf-hillclimb/native-capture-controller-r4-20261115/plan.json')|ConvertFrom-Json
$taskActual=Get-Content -Raw -LiteralPath (Join-Path $taskOld 'artifacts/perf-hillclimb/native-capture-controller-r4-result-20261115/summary.json')|ConvertFrom-Json
$taskSources=Test-TaskPins $taskAuthority.sources $taskOld
$taskAssets=Test-TaskPins $taskAuthority.assets (Join-Path $taskOld 'dist')
$taskR4Pins=Test-TaskPins $taskR4.files $taskOld
$taskOriginals=Test-TaskPins $taskActual.originalFilePins $taskOld
if($taskSources -ne 683 -or $taskAssets -ne 5 -or $taskR4Pins -ne 45 -or $taskOriginals -ne 76){throw 'Frozen inventory count changed'}
$taskPreserved=[ordered]@{}
foreach($taskBuildId in @('policy-r0','adapter-r1','adapter-r2','adapter-r3')){
  $taskBuild=Get-Content -Raw -LiteralPath (Join-Path $taskRoot ('build-'+$taskBuildId+'.json'))|ConvertFrom-Json
  $taskSnapshot=if($taskBuildId -eq 'policy-r0'){'pre-policy-r0-source'}else{$taskBuildId+'-source'}
  $taskCount=0
  foreach($taskPin in $taskBuild.files.PSObject.Properties){
    $taskPath=$taskPin.Name;$taskCopy=Join-Path (Join-Path $taskRoot $taskSnapshot) ([IO.Path]::GetFileName($taskPath))
    if(([IO.Path]::GetDirectoryName($taskPath) -eq $taskRoot.Replace('/','\')) -and (Test-Path -LiteralPath $taskCopy)){$taskPath=$taskCopy}
    if((Get-TaskHash $taskPath) -cne $taskPin.Value){throw ('Build/snapshot pin changed: '+$taskPath)};$taskCount++
  }
  $taskPreserved[$taskBuildId]=$taskCount
}
# Authenticate original checkpoint pins. Changed direct working source/docs now
# resolve ONLY to the pre-existing snapshots saved before those edits.
$taskOriginalCheckpoint=Get-Content -Raw -LiteralPath (Join-Path $taskRoot 'checkpoint-r0.json')|ConvertFrom-Json
$taskRemapped=@()
foreach($taskPin in $taskOriginalCheckpoint.sourceFiles.PSObject.Properties){
  if((Get-TaskHash $taskPin.Name) -ceq $taskPin.Value){continue}
  if([IO.Path]::GetDirectoryName($taskPin.Name) -ne $taskRoot.Replace('/','\')){throw 'Nested frozen evidence changed'}
  $taskFound=$null
  foreach($taskFolder in @('pre-policy-r0-source','pre-adapter-r1-source')){
    $taskCopy=Join-Path (Join-Path $taskRoot $taskFolder) ([IO.Path]::GetFileName($taskPin.Name))
    if((Test-Path -LiteralPath $taskCopy) -and (Get-TaskHash $taskCopy) -ceq $taskPin.Value){$taskFound=$taskCopy;break}
  }
  if(-not $taskFound){throw ('Original evidence not preserved: '+$taskPin.Name)}
  $taskRemapped+=@{originalWorkingPath=$taskPin.Name;immutableCopy=$taskFound;sha256=$taskPin.Value}
}
$taskBuild=Get-Content -Raw -LiteralPath (Join-Path $taskRoot 'build-adapter-r3.json')|ConvertFrom-Json
$taskSelectedPins=Test-TaskPins $taskBuild.files $taskOld
if($taskBuild.compileExit -ne 0 -or $taskBuild.policyChecks.Count -ne 38 -or $taskBuild.bindingChecks.Count -ne 81 -or $taskBuild.error){throw 'Unexpected selected compile/control result'}
$taskProcesses=@(Get-CimInstance Win32_Process|Where-Object{$_.ProcessId -ne $PID -and ($_.Name -eq 'csc.exe' -or $_.Name -like 'TrialTarget*' -or ($_.Name -match '^(powershell|pwsh|node)\.exe$' -and $_.CommandLine -match '(native-trial-lifetime-r1-20261115|control-[1-6]-|host-r4|supervise-r4)'))}|Select-Object ProcessId,ParentProcessId,Name)
if($taskProcesses.Count -ne 0){throw 'Matching source/native/compiler process remains'}
$taskFiles=[ordered]@{}
foreach($taskFile in Get-ChildItem -LiteralPath $taskRoot -File -Recurse|Sort-Object FullName){$taskFiles[$taskFile.FullName]=Get-TaskHash $taskFile.FullName}
$taskReceipt=[ordered]@{
  at=[DateTime]::UtcNow.ToString('o');phase='PARTIAL_NATIVE_BINDING_JOB_ADAPTER_SOURCE_NOT_ADMITTED';selectedBuild='adapter-r3';selectedBuildSha256=Get-TaskHash (Join-Path $taskRoot 'build-adapter-r3.json');selectedBuildPins=$taskSelectedPins
  compileExit=0;managedLifecycleControls=38;connectedBindingJobPhaseControls=81;nativeAdapterCalls=0;nativeAdapterConstructors=0;targetMainInvoked=$false
  sourcesUnchanged=$taskSources;assetsUnchanged=$taskAssets;r4PlanPinsUnchanged=$taskR4Pins;r4OriginalActualFilesUnchanged=$taskOriginals;originalBuildPinsThroughSnapshots=$taskPreserved;originalCheckpointPinsRemappedToPreEditCopies=$taskRemapped;files=$taskFiles
  matchingProcesses=$taskProcesses;sourceCompilerPureLease='CLOSED_AFTER_CHECKPOINT';nativeLease='NOT_ACQUIRED';next='Coordinator NATIVE_TRIAL_LIFETIME_SOURCE_RESUME_R2.md and local SOURCE_RESUME_R1.md: actual multi-PID event loop/module/phase/cleanup/controller/oracle/config candidate; ONE complete independent source gate before native.'
  scope='No complete tree event adapter/controller/oracle/config/plan/admission. Managed same-seam fake call controls only; no actual debug/helper/API/Run/Main/stop/browser/benchmark. Four immutable build/snapshot receipts retained. Whole Phase A NOT SOUND; no cause/fix/neutrality/verifyPASS/gain/optimization/scoring/PR/merge/Pages.'
}
[IO.File]::WriteAllText($taskOut,($taskReceipt|ConvertTo-Json -Depth 9),[Text.UTF8Encoding]::new($false))
[ordered]@{checkpoint=$taskOut;sha256=Get-TaskHash $taskOut;files=$taskFiles.Count;selectedPins=$taskSelectedPins;sources=$taskSources;assets=$taskAssets;r4Pins=$taskR4Pins;originals=$taskOriginals;remappedOriginalWorkingFiles=$taskRemapped.Count;matchingProcesses=$taskProcesses.Count}|ConvertTo-Json -Compress
