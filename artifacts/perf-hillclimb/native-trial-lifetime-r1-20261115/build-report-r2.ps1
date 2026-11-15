$ErrorActionPreference='Stop'
$taskRoot=Join-Path (Get-Location) 'artifacts/perf-hillclimb/native-trial-lifetime-r1-20261115'
$taskReceipt=Join-Path $taskRoot 'build-report-r2.json';$taskLibrary=Join-Path $taskRoot 'TrialReport-r2.dll';$taskSnapshot=Join-Path $taskRoot 'report-r2-source'
foreach($taskPath in @($taskReceipt,$taskLibrary,$taskSnapshot)){if(Test-Path -LiteralPath $taskPath){throw 'Build identity used; no overwrite'}}
$taskCompiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$taskNames=@('NativeCaptureAbi.cs','NativeCaptureSupport.cs','RepairContracts.cs','RepairedResources.cs','ControllerPolicy.cs','ControllerNative.cs','ProcessLifetime.cs','LoaderProof.cs','TrialBook.cs','PureTrialChecks.cs','TrialBinding.cs','TrialNativeProcess.cs','TrialJobCalls.cs','PureBindingChecks.cs','TrialTreeEvents.cs','TrialNativeEvents.cs','PureTreeChecks.cs','TrialController.cs','TrialNativeOwner.cs','PureControllerChecks.cs','TrialOriginalFiles.cs','TrialTargetOutcome.cs','TrialReport.cs','PureReportChecks.cs')
$taskSources=@($taskNames|ForEach-Object{Join-Path $taskRoot $_});[IO.Directory]::CreateDirectory($taskSnapshot)|Out-Null
foreach($taskFile in @($taskSources)+@($PSCommandPath)){Copy-Item -LiteralPath $taskFile -Destination (Join-Path $taskSnapshot ([IO.Path]::GetFileName($taskFile)))}
$taskFiles=[ordered]@{};foreach($taskFile in @($taskSources)+@($PSCommandPath,$taskCompiler,(Join-Path $taskRoot 'TrialTarget-r0.exe'),(Join-Path $taskRoot 'TrialTarget.cs'))){$taskFiles[$taskFile]=(Get-FileHash -LiteralPath $taskFile -Algorithm SHA256).Hash.ToLowerInvariant()}
$taskResult=[ordered]@{at=[DateTime]::UtcNow.ToString('o');phase='INCOMPLETE_CLASSIFIER_REPORT_SOURCE_ONLY';compileExit=$null;policyChecks=@();bindingChecks=@();treeChecks=@();controllerChecks=@();reportChecks=@();error=$null;files=$taskFiles;nativeCalls=0;nativeConstructors=0;targetMainInvoked=$false;scope='SAME controller and raw tree/bindings exercised with fake owner/native calls/managed clock only. Native owner/event/process source compiled; constructors/API NEVER invoked. Classifier/report against virtual target files and bounded managed file IO only. Independent oracle/FrozenTrial config/plan/supervisor/manifest/admission/control roots absent. No target/Run/Main/stop/browser/benchmark.'}
try {
  & $taskCompiler '/nologo' '/target:library' '/platform:x64' '/reference:System.Web.Extensions.dll' ('/out:'+$taskLibrary) @taskSources *> (Join-Path $taskRoot 'compile-report-r2.log')
  $taskResult.compileExit=$LASTEXITCODE;[IO.File]::WriteAllText((Join-Path $taskRoot 'compile-report-r2-exit.txt'),[string]$LASTEXITCODE)
  if($taskResult.compileExit -ne 0){throw 'Compile failed; exact source/log retained'}
  $taskFiles[$taskLibrary]=(Get-FileHash -LiteralPath $taskLibrary -Algorithm SHA256).Hash.ToLowerInvariant();[Reflection.Assembly]::LoadFile($taskLibrary)|Out-Null
  $taskImage=(Get-Process -Id $PID).Path
  $taskResult.policyChecks=[NativeTrialLifetime.PureTrialChecks]::Run($taskImage)
  $taskResult.bindingChecks=[NativeTrialLifetime.PureBindingChecks]::Run($taskImage)
  $taskResult.treeChecks=[NativeTrialLifetime.PureTreeChecks]::Run($taskImage)
  $taskResult.controllerChecks=[NativeTrialLifetime.PureControllerChecks]::Run($taskImage)
  $taskIo=Join-Path $taskRoot 'managed-report-io-r1';if(Test-Path -LiteralPath $taskIo){throw 'IO fixture identity used'};[IO.Directory]::CreateDirectory($taskIo)|Out-Null
  $taskResult.reportChecks=[NativeTrialLifetime.PureReportChecks]::Run($taskImage,$taskIo)
}catch {$taskResult.error=$_.Exception.ToString()}
finally {[IO.File]::WriteAllText($taskReceipt,($taskResult|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))}
[ordered]@{compileExit=$taskResult.compileExit;policyChecks=$taskResult.policyChecks.Count;bindingChecks=$taskResult.bindingChecks.Count;treeChecks=$taskResult.treeChecks.Count;controllerChecks=$taskResult.controllerChecks.Count;reportChecks=$taskResult.reportChecks.Count;error=$taskResult.error;nativeCalls=0;artifact=$taskReceipt}|ConvertTo-Json -Compress
if($taskResult.error){exit 1}
