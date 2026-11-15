$ErrorActionPreference='Stop'
$taskOld='C:/Users/User/.t3/worktrees/laughing-waffle-proto/perf-hillclimb-20261104'
$taskRoot=Join-Path $taskOld 'artifacts/perf-hillclimb/native-trial-lifetime-r1-20261115'
$taskOut=Join-Path $taskRoot 'checkpoint-host-r4.json'
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
if($taskSources -ne 683 -or $taskAssets -ne 5 -or $taskR4Pins -ne 45 -or $taskOriginals -ne 76){throw 'Frozen inventory changed'}
$taskPreserved=[ordered]@{}
foreach($taskBuildId in @('policy-r0','adapter-r1','adapter-r2','adapter-r3','tree-r1','tree-r2','controller-r1','controller-r2','report-r1','report-r2','report-r3','report-r4','protocol-r1','protocol-r2','host-r1','host-r2','host-r3','host-r4')){
  $taskBuild=Get-Content -Raw -LiteralPath (Join-Path $taskRoot ('build-'+$taskBuildId+'.json'))|ConvertFrom-Json
  $taskSnapshot=if($taskBuildId -eq 'policy-r0'){'pre-policy-r0-source'}else{$taskBuildId+'-source'}
  $taskCount=0
  foreach($taskPin in $taskBuild.files.PSObject.Properties){
    $taskPath=$taskPin.Name;$taskCopy=Join-Path (Join-Path $taskRoot $taskSnapshot) ([IO.Path]::GetFileName($taskPath))
    if(([IO.Path]::GetDirectoryName($taskPath) -eq $taskRoot.Replace('/','\')) -and (Test-Path -LiteralPath $taskCopy)){$taskPath=$taskCopy}
    if((Get-TaskHash $taskPath) -cne $taskPin.Value){throw ('Build/snapshot changed: '+$taskPath)};$taskCount++
  }
  $taskPreserved[$taskBuildId]=$taskCount
}
$taskRemapped=@();$taskPriorCounts=[ordered]@{}
foreach($taskPriorName in @('checkpoint-r0.json','checkpoint-adapter-r3.json','checkpoint-tree-r2.json','checkpoint-controller-r2.json','checkpoint-report-r4.json','checkpoint-checker-r3.json','checkpoint-owner-target-r2.json','checkpoint-protocol-r2.json','checkpoint-host-r1.json')){
  $taskPrior=Get-Content -Raw -LiteralPath (Join-Path $taskRoot $taskPriorName)|ConvertFrom-Json
  $taskPins=if($taskPriorName -eq 'checkpoint-r0.json'){$taskPrior.sourceFiles}else{$taskPrior.files}
  $taskCount=0
  foreach($taskPin in $taskPins.PSObject.Properties){
    $taskCount++;if((Get-TaskHash $taskPin.Name) -ceq $taskPin.Value){continue}
    if([IO.Path]::GetDirectoryName($taskPin.Name) -ne $taskRoot.Replace('/','\')){throw 'Nested frozen evidence changed'}
    $taskFound=$null
    foreach($taskFolder in @('pre-policy-r0-source','pre-adapter-r1-source','pre-tree-doc-source','tree-r2-source','pre-controller-doc-source','controller-r2-source','pre-report-doc-source','pre-checker-doc-source','pre-owner-checker-doc-source','pre-protocol-doc-source','protocol-r2-source','pre-host-doc-source','host-r1-source','pre-host-setup-doc-source')){
      $taskCopy=Join-Path (Join-Path $taskRoot $taskFolder) ([IO.Path]::GetFileName($taskPin.Name))
      if((Test-Path -LiteralPath $taskCopy) -and (Get-TaskHash $taskCopy) -ceq $taskPin.Value){$taskFound=$taskCopy;break}
    }
    if(-not $taskFound){throw ('Original evidence not preserved: '+$taskPin.Name)}
    $taskRemapped+=@{checkpoint=$taskPriorName;originalWorkingPath=$taskPin.Name;immutableCopy=$taskFound;sha256=$taskPin.Value}
  }
  $taskPriorCounts[$taskPriorName]=$taskCount
}
$taskBuild=Get-Content -Raw -LiteralPath (Join-Path $taskRoot 'build-host-r4.json')|ConvertFrom-Json
$taskSelectedPins=Test-TaskPins $taskBuild.files $taskOld
if($taskBuild.compileExit -ne 0 -or $taskBuild.policyChecks.Count -ne 38 -or $taskBuild.bindingChecks.Count -ne 81 -or $taskBuild.treeChecks.Count -ne 63 -or $taskBuild.controllerChecks.Count -ne 76 -or $taskBuild.reportChecks.Count -ne 59 -or $taskBuild.protocolChecks.Count -ne 62 -or $taskBuild.hostLaunchChecks.Count -ne 28 -or $taskBuild.hostSetupChecks.Count -ne 45 -or $taskBuild.admissionChecks.Count -ne 33 -or $taskBuild.error){throw 'Unexpected selected compile/control result'}
$taskProcesses=@(Get-CimInstance Win32_Process|Where-Object{$_.ProcessId -ne $PID -and ($_.Name -eq 'csc.exe' -or $_.Name -like 'TrialTarget*' -or ($_.Name -match '^(powershell|pwsh|node)\.exe$' -and $_.CommandLine -match '(native-trial-lifetime-r1-20261115|control-[1-6]-|host-r4|supervise-r4)'))}|Select-Object ProcessId,ParentProcessId,Name)
if($taskProcesses.Count -ne 0){throw 'Matching compiler/native/control process remains'}
$taskFiles=[ordered]@{}
foreach($taskFile in Get-ChildItem -LiteralPath $taskRoot -File -Recurse|Sort-Object FullName){$taskFiles[$taskFile.FullName]=Get-TaskHash $taskFile.FullName}
$taskReceipt=[ordered]@{
  at=[DateTime]::UtcNow.ToString('o');phase='HOST_SETUP_ROLLBACK_ADMISSION_SOURCE_NOT_COMPLETE_NOT_ADMITTED';selectedBuild='host-r4';selectedBuildSha256=Get-TaskHash (Join-Path $taskRoot 'build-host-r4.json');selectedBuildPins=$taskSelectedPins
  compileExit=0;managedLifecycleControls=38;connectedBindingJobPhaseControls=81;connectedRawTreeControls=63;connectedControllerControls=76;reportControls=59;protocolControls=62;hostLaunchControls=28;hostSetupControls=45;admissionControls=33;rawCheckerControls=52;rawCheckerAccepts=7;rawCheckerRejects=45;strictJsonControls=28;strictJsonAccepts=5;strictJsonRejects=23;ownerCleanupControls=70;ownerCleanupAccepts=3;ownerCleanupRejects=67;composedTargetControls=46;composedTargetAccepts=2;composedTargetRejects=44;completeCellAcceptance=$false;nativeAdapterCalls=0;nativeAdapterConstructors=0;targetMainInvoked=$false
  sourcesUnchanged=$taskSources;assetsUnchanged=$taskAssets;r4PlanPinsUnchanged=$taskR4Pins;r4OriginalActualFilesUnchanged=$taskOriginals;preservedBuildPins=$taskPreserved;preservedPriorCheckpointPins=$taskPriorCounts;originalWorkingPinsResolvedToPreEditCopies=$taskRemapped;files=$taskFiles
  matchingProcesses=$taskProcesses;sourceCompilerPureLease='CLOSED_AFTER_CHECKPOINT';nativeLease='NOT_ACQUIRED';next='Coordinator NATIVE_TRIAL_LIFETIME_SOURCE_RESUME_R10.md and local SOURCE_RESUME_R1.md: host entry/self identity/host-start+supervisor launch journals/runner/report provenance source, then full provenance/cell checker and complete source gate, FrozenTrial config/plan/host-supervisor/manifest, ONE complete independent source gate before native.'
  correction='Prior relocation-clarification-r1.json corrects historical two-directory prose: only own new empty child removed, older sibling directory preserved. Prior source/build evidence remains immutable.'
  scope='Report-r1 compile0/49PASS; r2 compile0 but report checks NOT RUN from IO fixture identity collision; r3 compile0 then parser control FAILED from unpaired surrogate normalization (narrow diagnosis retained); r4 raw-pair validation repair compile0/59PASS. All exact failed receipts/snapshots retained. SAME controller/raw tree/bindings/classifier/report exercised with fake owner/calls/clocks/virtual originals and bounded managed IO only; native constructors/API NEVER invoked. Retained native host source COMPILED ONLY; native owner root journal publication wired before Resume,28pure launch/order controls. Creation-owned setup rollback single5s including kill/global45s creation origin/strict admission semantics/exact reservation/raw identity+image hash source DONE COMPILED ONLY; fake tests only. Host entry/self identity/supervisor launch journals/runner/report provenance/full actual cell checker/plan/manifest/control roots remain missing. No physical native/daemon proof or original native cause/fix. Whole Phase A NOT SOUND; no cause/fix/neutrality/verifyPASS/gain/optimization/scoring/PR/merge/Pages.'
}
[IO.File]::WriteAllText($taskOut,($taskReceipt|ConvertTo-Json -Depth 9),[Text.UTF8Encoding]::new($false))
[ordered]@{checkpoint=$taskOut;sha256=Get-TaskHash $taskOut;files=$taskFiles.Count;selectedPins=$taskSelectedPins;sources=$taskSources;assets=$taskAssets;r4Pins=$taskR4Pins;originals=$taskOriginals;remappedPriorWorkingPins=$taskRemapped.Count;matchingProcesses=$taskProcesses.Count}|ConvertTo-Json -Compress
