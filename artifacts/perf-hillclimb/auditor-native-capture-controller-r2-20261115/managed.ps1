$ErrorActionPreference='Stop'
$r=Join-Path (Get-Location) 'artifacts/perf-hillclimb/native-capture-controller-r2-20261115';$o=Join-Path (Get-Location) 'artifacts/perf-hillclimb/auditor-native-capture-controller-r2-20261115'
$names=@('NativeCaptureAbi.cs','NativeCaptureSupport.cs','RepairContracts.cs','RepairedResources.cs','ControllerPolicy.cs','ControllerNative.cs','EventSession.cs','DescendantWitness.cs','CaptureController.cs','PureControllerChecks.cs')
$sources=@($names|ForEach-Object{Join-Path $r $_})+@((Join-Path $o 'IndependentManaged.cs'));$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe';$dll=Join-Path $o 'IndependentController.dll'
if(Test-Path -LiteralPath $dll){throw 'Do not overwrite independent DLL'}
& $compiler /nologo /target:library /platform:x64 /reference:System.Web.Extensions.dll ('/out:'+$dll) @sources *> (Join-Path $o 'compile.log')
$exit=$LASTEXITCODE;[IO.File]::WriteAllText((Join-Path $o 'compile-exit.txt'),[string]$exit);if($exit -ne 0){throw 'Independent compile failed'}
[Reflection.Assembly]::LoadFile($dll)|Out-Null
$builder=[NativeCaptureControllerProof.PureControllerChecks]::Run($o,(Get-Process -Id $PID).Path)
$own=[IndependentControllerR2.Checks]::Run()
$pins=[ordered]@{};foreach($f in @($sources)+@($compiler,$dll,$PSCommandPath)){$pins[$f]=(Get-FileHash -LiteralPath $f -Algorithm SHA256).Hash.ToLowerInvariant()}
$result=[ordered]@{at=[DateTime]::UtcNow.ToString('o');compileExit=$exit;builderChecks=$builder;independentChecks=$own;pins=$pins;scope='Pure managed actual ResumeGate/SetupRollback/Policy fixtures; selected full observer sources independently compiled. Compiler process ran. No native helper constructor, Native/ExtraNative/Api/Run/Main/StopExactHost/control/capture invoked.'}
$file=Join-Path $o 'managed.json';if(Test-Path -LiteralPath $file){throw 'Preserve managed receipt'}
[IO.File]::WriteAllText($file,($result|ConvertTo-Json -Depth 7),[Text.UTF8Encoding]::new($false));[pscustomobject]@{at=$result.at;compile=$exit;builder=$builder.Count;independent=$own.Count;receiptSha256=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant();dllSha256=$pins[$dll]}|ConvertTo-Json -Compress
