$ErrorActionPreference='Stop'
$root=Join-Path (Get-Location) 'artifacts/perf-hillclimb/native-trial-lifetime-r1-20261115'
$receipt=Join-Path $root 'build-policy-r0.json';if(Test-Path -LiteralPath $receipt){throw 'Never overwrite build evidence'}
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$library=Join-Path $root 'TrialPolicy-r0.dll';$target=Join-Path $root 'TrialTarget-r0.exe'
if((Test-Path -LiteralPath $library) -or (Test-Path -LiteralPath $target)){throw 'Build output exists'}
$names=@('NativeCaptureAbi.cs','NativeCaptureSupport.cs','RepairContracts.cs','RepairedResources.cs','ControllerPolicy.cs','ControllerNative.cs','ProcessLifetime.cs','LoaderProof.cs','TrialBook.cs','PureTrialChecks.cs')
$sources=@($names|ForEach-Object{Join-Path $root $_})
$snapshot=Join-Path $root 'pre-policy-r0-source';if(Test-Path -LiteralPath $snapshot){throw 'Snapshot exists'};[IO.Directory]::CreateDirectory($snapshot)|Out-Null
foreach($file in @($sources)+@((Join-Path $root 'TrialTarget.cs'),$PSCommandPath)){Copy-Item -LiteralPath $file -Destination (Join-Path $snapshot ([IO.Path]::GetFileName($file)))}
& $compiler '/nologo' '/target:library' '/platform:x64' '/reference:System.Web.Extensions.dll' ('/out:'+$library) @sources *> (Join-Path $root 'compile-policy-r0.log')
$policyExit=$LASTEXITCODE;[IO.File]::WriteAllText((Join-Path $root 'compile-policy-r0-exit.txt'),[string]$policyExit);if($policyExit -ne 0){throw 'Policy compile failed; exact source/log retained'}
& $compiler '/nologo' '/target:exe' '/platform:x64' '/reference:System.Web.Extensions.dll' '/main:NativeTrialSynthetic.Target' ('/out:'+$target) (Join-Path $root 'TrialTarget.cs') *> (Join-Path $root 'compile-target-r0.log')
$targetExit=$LASTEXITCODE;[IO.File]::WriteAllText((Join-Path $root 'compile-target-r0-exit.txt'),[string]$targetExit);if($targetExit -ne 0){throw 'Target compile failed; source/log retained'}
[Reflection.Assembly]::LoadFile($library)|Out-Null
$checks=[NativeTrialLifetime.PureTrialChecks]::Run((Get-Process -Id $PID).Path)
$targetMetadata=[Reflection.Assembly]::LoadFile($target);if($targetMetadata.EntryPoint.DeclaringType.FullName -ne 'NativeTrialSynthetic.Target'){throw 'Unexpected metadata entry point'}
$files=@{};foreach($file in @($sources)+@((Join-Path $root 'TrialTarget.cs'),$compiler,$library,$target,$PSCommandPath)){$files[$file]=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()}
$r=[ordered]@{at=[DateTime]::UtcNow.ToString('o');policyCompileExit=$policyExit;targetCompileExit=$targetExit;checks=$checks;files=$files;scope='INCOMPLETE source cut. Policy/state fixtures only; target metadata inspected but Main never invoked. No tree observer/controller/oracle/plan/admission yet. Copied r4 native wrappers remain unmodified/unconnected. No native helper constructor/API/Run/target/preview.'}
[IO.File]::WriteAllText($receipt,($r|ConvertTo-Json -Depth 7),[Text.UTF8Encoding]::new($false));[pscustomobject]@{managedChecks=$checks.Count;policyCompile=$policyExit;targetCompile=$targetExit;targetMainInvoked=$false;artifact=$receipt}|ConvertTo-Json -Compress
