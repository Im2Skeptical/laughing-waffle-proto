$ErrorActionPreference='Stop'
$taskRoot=Join-Path (Get-Location) 'artifacts/perf-hillclimb/native-trial-lifetime-r1-20261115'
$taskReceipt=Join-Path $taskRoot 'build-adapter-r1.json'
$taskLibrary=Join-Path $taskRoot 'TrialAdapter-r1.dll'
$taskSnapshot=Join-Path $taskRoot 'adapter-r1-source'
foreach($taskPath in @($taskReceipt,$taskLibrary,$taskSnapshot)){if(Test-Path -LiteralPath $taskPath){throw 'Build identity already used; no overwrite'}}
$taskCompiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$taskNames=@('NativeCaptureAbi.cs','NativeCaptureSupport.cs','RepairContracts.cs','RepairedResources.cs','ControllerPolicy.cs','ControllerNative.cs','ProcessLifetime.cs','LoaderProof.cs','TrialBook.cs','PureTrialChecks.cs','TrialBinding.cs','TrialNativeProcess.cs','TrialJobCalls.cs','PureBindingChecks.cs')
$taskSources=@($taskNames|ForEach-Object{Join-Path $taskRoot $_})
[IO.Directory]::CreateDirectory($taskSnapshot)|Out-Null
foreach($taskFile in @($taskSources)+@($PSCommandPath)){Copy-Item -LiteralPath $taskFile -Destination (Join-Path $taskSnapshot ([IO.Path]::GetFileName($taskFile)))}
$taskFiles=[ordered]@{}
foreach($taskFile in @($taskSources)+@($PSCommandPath,$taskCompiler,(Join-Path $taskRoot 'TrialTarget-r0.exe'),(Join-Path $taskRoot 'TrialTarget.cs'))){$taskFiles[$taskFile]=(Get-FileHash -LiteralPath $taskFile -Algorithm SHA256).Hash.ToLowerInvariant()}
$taskResult=[ordered]@{at=[DateTime]::UtcNow.ToString('o');phase='INCOMPLETE_NATIVE_ADAPTER_SOURCE_ONLY';compileExit=$null;policyChecks=@();bindingChecks=@();error=$null;files=$taskFiles;nativeCalls=0;nativeConstructors=0;targetMainInvoked=$false;scope='Native declarations/wrapper source compiled only. Connected binding/job seam exercised with fake calls and managed clock; not a complete event-loop/controller/oracle/plan/source-admission candidate. No native API/helper constructor/Run/Main/target/stop/browser/benchmark.'}
try {
  & $taskCompiler '/nologo' '/target:library' '/platform:x64' '/reference:System.Web.Extensions.dll' ('/out:'+$taskLibrary) @taskSources *> (Join-Path $taskRoot 'compile-adapter-r1.log')
  $taskResult.compileExit=$LASTEXITCODE
  [IO.File]::WriteAllText((Join-Path $taskRoot 'compile-adapter-r1-exit.txt'),[string]$LASTEXITCODE)
  if($taskResult.compileExit -ne 0){throw 'Compile failed; exact source/log retained'}
  $taskFiles[$taskLibrary]=(Get-FileHash -LiteralPath $taskLibrary -Algorithm SHA256).Hash.ToLowerInvariant()
  [Reflection.Assembly]::LoadFile($taskLibrary)|Out-Null
  $taskImage=(Get-Process -Id $PID).Path
  $taskResult.policyChecks=[NativeTrialLifetime.PureTrialChecks]::Run($taskImage)
  $taskResult.bindingChecks=[NativeTrialLifetime.PureBindingChecks]::Run($taskImage)
}catch {
  $taskResult.error=$_.Exception.ToString()
}finally {
  [IO.File]::WriteAllText($taskReceipt,($taskResult|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
}
[ordered]@{compileExit=$taskResult.compileExit;policyChecks=$taskResult.policyChecks.Count;bindingChecks=$taskResult.bindingChecks.Count;error=$taskResult.error;nativeCalls=0;artifact=$taskReceipt}|ConvertTo-Json -Compress
if($taskResult.error){exit 1}
