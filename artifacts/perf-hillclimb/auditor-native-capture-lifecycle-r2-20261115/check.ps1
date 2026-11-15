$ErrorActionPreference='Stop'
$r=Join-Path (Get-Location) 'artifacts/perf-hillclimb/native-event-observer-lifecycle-r2-20261115'
$o=Join-Path (Get-Location) 'artifacts/perf-hillclimb/auditor-native-capture-lifecycle-r2-20261115'
if(Test-Path -LiteralPath (Join-Path $o 'receipt.json')){throw 'Never overwrite independent proof'}
$manifestFile=Join-Path $r 'build-manifest.json'
if((Get-FileHash -LiteralPath $manifestFile -Algorithm SHA256).Hash.ToLower() -ne '1f746c70a5dc78958f2fbe2b247d0750f7afe96d57c36d2fbedf756878fe7da3'){throw 'Wrong revision manifest'}
$m=Get-Content -LiteralPath $manifestFile -Raw|ConvertFrom-Json
foreach($p in $m.files.PSObject.Properties){if((Get-FileHash -LiteralPath (Join-Path $r $p.Name) -Algorithm SHA256).Hash.ToLower() -ne $p.Value){throw ('Input mismatch '+$p.Name)}}
$abi=Join-Path (Get-Location) 'artifacts/perf-hillclimb/native-event-observer-build-r1-20261115/NativeCaptureAbi.cs'
$support=Join-Path (Get-Location) 'artifacts/perf-hillclimb/native-event-observer-support-r1-20261115/NativeCaptureSupport.cs'
if((Get-FileHash -LiteralPath $abi -Algorithm SHA256).Hash.ToLower() -ne '8c7a7d5d70ba871e2341d40ce147cef5d80d664d475777b33366b670eefe4337' -or (Get-FileHash -LiteralPath $support -Algorithm SHA256).Hash.ToLower() -ne 'fc3d4881e8e40089063eddfb3868db5570021d410b786b087e5912318e5d8442'){throw 'Wrong frozen dependency'}
$sources=@($abi,$support,(Join-Path $r 'RepairContracts.cs'),(Join-Path $r 'RepairedResources.cs'),(Join-Path $r 'PureFixtures.cs'),(Join-Path $o 'IndependentManaged.cs'))
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$dll=Join-Path $o 'IndependentRepair.dll'
& $compiler /nologo /target:library /platform:x64 "/out:$dll" @sources *> (Join-Path $o 'compile.log')
$code=$LASTEXITCODE;[IO.File]::WriteAllText((Join-Path $o 'compile-exit.txt'),"$code`n");if($code -ne 0){throw 'Independent compile failed'}
[Reflection.Assembly]::LoadFile($dll)|Out-Null
$reproduced=[NativeCaptureRepairProof.PureChecks]::Run()
$independent=[IndependentLifecycleAudit.Checks]::Run()
$pins=[ordered]@{};foreach($f in @($sources)+@($compiler,$dll,$PSCommandPath)){$pins[$f]=(Get-FileHash -LiteralPath $f -Algorithm SHA256).Hash.ToLower()}
$receipt=[ordered]@{at=[DateTime]::UtcNow.ToString('o');verdict='MANAGED_REPAIR_MECHANISMS_PASS_WITH_RESIDUAL_SOURCE_FINDINGS';manifestSha256='1f746c70a5dc78958f2fbe2b247d0750f7afe96d57c36d2fbedf756878fe7da3';compileExit=$code;reproducedChecks=$reproduced;independentChecks=$independent;sourcePins=$pins;knownSourceFindings=@('Unstarted reader may be marked joined then started outside owner gate','ClaimFinalization is irreversible before pending physical close is confirmed','Drain failure is fail-closed but can leave pending debug event/cleanup unconfirmed; unexpected header not retained');scope='Compiler OS process and managed fixture threads/fake SafeHandle/clock/state/static policy only. No RepairedJob/RepairedPipe/CleanupDebugDrain constructor, Native/ExtraNative method, target/debug/preview/capture or complete admission.'}
[IO.File]::WriteAllText((Join-Path $o 'receipt.json'),($receipt|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
[pscustomobject]@{at=$receipt.at;compileExit=$code;reproduced=$reproduced.Count;independent=$independent.Count;dllSha256=$pins[$dll];receiptSha256=(Get-FileHash -LiteralPath (Join-Path $o 'receipt.json') -Algorithm SHA256).Hash.ToLower()}|ConvertTo-Json -Compress
