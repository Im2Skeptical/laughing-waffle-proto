$ErrorActionPreference='Stop'
$root=Join-Path (Get-Location) 'artifacts/perf-hillclimb/native-capture-controller-r3-20261115'
$receipt=Join-Path $root 'build-pure-final.json'
if(Test-Path -LiteralPath $receipt){throw 'Never overwrite candidate build proof'}
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$observer=Join-Path $root 'CaptureController-final.dll';$target=Join-Path $root 'SyntheticCaptureTarget-final.exe'
if((Test-Path -LiteralPath $observer) -or (Test-Path -LiteralPath $target)){throw 'Compiled output already exists'}
$names=@('NativeCaptureAbi.cs','NativeCaptureSupport.cs','RepairContracts.cs','RepairedResources.cs','ControllerPolicy.cs','ControllerNative.cs','EventSession.cs','DescendantWitness.cs','CaptureController.cs','PureControllerChecks.cs')
$sources=@($names|ForEach-Object{Join-Path $root $_})
& $compiler '/nologo' '/target:library' '/platform:x64' '/reference:System.Web.Extensions.dll' ('/out:'+$observer) @sources *> (Join-Path $root 'compile-observer-final.log')
$observerExit=$LASTEXITCODE;[IO.File]::WriteAllText((Join-Path $root 'compile-observer-final-exit.txt'),[string]$observerExit)
if($observerExit -ne 0){throw 'Observer compile failed; retained original log'}
& $compiler '/nologo' '/target:exe' '/platform:x64' '/main:NativeCaptureSynthetic.Target' ('/out:'+$target) (Join-Path $root 'SyntheticCaptureTarget.cs') *> (Join-Path $root 'compile-target-final.log')
$targetExit=$LASTEXITCODE;[IO.File]::WriteAllText((Join-Path $root 'compile-target-final-exit.txt'),[string]$targetExit)
if($targetExit -ne 0){throw 'Target compile failed; retained log; no target run'}
[Reflection.Assembly]::LoadFile($observer)|Out-Null
$checks=[NativeCaptureControllerProof.PureControllerChecks]::Run($root,(Get-Process -Id $PID).Path)
$targetAssembly=[Reflection.Assembly]::LoadFile($target)
$record=$targetAssembly.GetType('NativeCaptureSynthetic.ExceptionRecord64',$true)
$recordBytes=[Runtime.InteropServices.Marshal]::SizeOf([Activator]::CreateInstance($record))
if($recordBytes -ne 152){throw 'Synthetic record layout mismatch'}
$files=@{};foreach($file in @($sources)+@((Join-Path $root 'SyntheticCaptureTarget.cs'),$compiler,$observer,$target,$PSCommandPath)){$files[$file]=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()}
$result=[ordered]@{at=[DateTime]::UtcNow.ToString('o');observerCompileExit=$observerExit;targetCompileExit=$targetExit;files=$files;checks=$checks;syntheticRecordBytes=$recordBytes;scope='Source batch compile and managed classifier/config/continuation policy only. Target metadata loaded but Main NOT invoked. No controller Run, Native/helper constructor/API or target process/capture/preview. Candidate not admitted.'}
[IO.File]::WriteAllText($receipt,($result|ConvertTo-Json -Depth 7),[Text.UTF8Encoding]::new($false))
[pscustomobject]@{checks=$checks.Count;targetMetadataBytes=$recordBytes;observerCompile=$observerExit;targetCompile=$targetExit;artifact=$receipt}|ConvertTo-Json -Compress
