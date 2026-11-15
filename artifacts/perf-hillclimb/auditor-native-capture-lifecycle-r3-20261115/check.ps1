$ErrorActionPreference='Stop'
$r=Join-Path (Get-Location) 'artifacts/perf-hillclimb/native-event-observer-lifecycle-r3-20261115'
$o=Join-Path (Get-Location) 'artifacts/perf-hillclimb/auditor-native-capture-lifecycle-r3-20261115'
if(Test-Path -LiteralPath (Join-Path $o 'receipt.json')){throw 'Never overwrite independent receipt'}
$mf=Join-Path $r 'build-manifest.json';$mh='6f18c91fbfe9ad0dbb7abb639ff45aa4509ebb323939439c78653da515226adb'
if((Get-FileHash -LiteralPath $mf -Algorithm SHA256).Hash.ToLowerInvariant() -ne $mh){throw 'Wrong revision manifest'}
$m=Get-Content -LiteralPath $mf -Raw | ConvertFrom-Json
foreach($p in $m.files.PSObject.Properties){if((Get-FileHash -LiteralPath (Join-Path $r $p.Name) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $p.Value){throw ('Manifest mismatch '+$p.Name)}}
$abi=Join-Path (Get-Location) 'artifacts/perf-hillclimb/native-event-observer-build-r1-20261115/NativeCaptureAbi.cs'
$support=Join-Path (Get-Location) 'artifacts/perf-hillclimb/native-event-observer-support-r1-20261115/NativeCaptureSupport.cs'
if((Get-FileHash -LiteralPath $abi -Algorithm SHA256).Hash.ToLowerInvariant() -ne '8c7a7d5d70ba871e2341d40ce147cef5d80d664d475777b33366b670eefe4337' -or (Get-FileHash -LiteralPath $support -Algorithm SHA256).Hash.ToLowerInvariant() -ne 'fc3d4881e8e40089063eddfb3868db5570021d410b786b087e5912318e5d8442'){throw 'Frozen dependency changed'}
$sourceChecks=[ordered]@{}
$contracts=Get-Content -LiteralPath (Join-Path $r 'RepairContracts.cs') -Raw
$resources=Get-Content -LiteralPath (Join-Path $r 'RepairedResources.cs') -Raw
$sourceChecks['actualPipeUsesOwnedWorker']=$resources.Contains('worker=new OwnedWorker(ReadLoop)') -and $resources.Contains('life.Start();worker.Start();')
$sourceChecks['noUnstartedThreadStateJoin']=$resources -notmatch 'ThreadState\.Unstarted|!reader\.IsAlive'
$sourceChecks['retryUntilResourceConfirmation']=$contracts.Contains('if(resourcesReleased||!closeRequested') -and $contracts.Contains('released=true;return true;')
$sourceChecks['rejectedHeaderRawBytesRetained']=$contracts.Contains('"rawHex",BitConverter.ToString(bytes)') -and $contracts.Contains('"untrustedHeader",true') -and $contracts.Contains('"continued",false')
$sourceChecks['eventLedgerCap2048']=$contracts.Contains('if(events>=2048)')
$sourceChecks['safeContinuedErrorsKeepDraining']=$resources.Contains('if(!step.MayKeepDraining)') -and $resources -notmatch 'if\(!step.Ok\)\s*break'
$sourceChecks['readHandleOwnedAndLeased']=$resources.Contains('read=new OwnedResource(r)') -and $resources.Contains('using(var lease=new HandleLease(read))') -and $resources.Contains('if(read.CloseSucceeded!=true)')
$sourceChecks['pendingLeaseNotFailure']=$resources.Contains('if(write.CloseSucceeded==false)life.RecordError')
foreach($p in $sourceChecks.GetEnumerator()){if(-not $p.Value){throw ('Source check failed '+$p.Key)}}
$sources=@($abi,$support,(Join-Path $r 'RepairContracts.cs'),(Join-Path $r 'RepairedResources.cs'),(Join-Path $r 'PureFixtures.cs'),(Join-Path $o 'IndependentManaged.cs'))
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe';$dll=Join-Path $o 'IndependentRepair.dll'
& $compiler /nologo /target:library /platform:x64 ('/out:'+$dll) @sources *> (Join-Path $o 'compile.log')
$code=$LASTEXITCODE;[IO.File]::WriteAllText((Join-Path $o 'compile-exit.txt'),[string]$code)
if($code -ne 0){throw 'Independent compile failed; output retained'}
[Reflection.Assembly]::LoadFile($dll)|Out-Null
$builder=[NativeCaptureRepairProof.PureChecks]::Run();$independent=[IndependentLifecycleR3.Checks]::Run()
$pins=[ordered]@{};foreach($f in @($sources)+@($mf,$compiler,$dll,$PSCommandPath)){$pins[$f]=(Get-FileHash -LiteralPath $f -Algorithm SHA256).Hash.ToLowerInvariant()}
$receipt=[ordered]@{at=[DateTime]::UtcNow.ToString('o');verdict='SCOPED_MANAGED_REPAIRS_PASS_NATIVE_INTEGRATION_OPEN';manifestSha256=$mh;compileExit=$code;builderChecks=$builder;independentChecks=$independent;sourceChecks=$sourceChecks;pins=$pins;limits=@('Source checks do not execute native drain or prove OS ABI/cleanup','No RepairedJob/RepairedPipe/CleanupDebugDrain constructor or Native/ExtraNative method invoked','Compiler OS process and joined managed fixture threads ran; no native target/debug/preview/capture','Controller, normal loader/EXIT-state handoff, outer failsafe, whole-session wire/classifier absent; no child admission')}
[IO.File]::WriteAllText((Join-Path $o 'receipt.json'),($receipt|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
[pscustomobject]@{at=$receipt.at;compileExit=$code;builder=$builder.Count;independent=$independent.Count;sourceChecks=$sourceChecks.Count;dllSha256=$pins[$dll];receiptSha256=(Get-FileHash -LiteralPath (Join-Path $o 'receipt.json') -Algorithm SHA256).Hash.ToLowerInvariant()}|ConvertTo-Json -Compress
