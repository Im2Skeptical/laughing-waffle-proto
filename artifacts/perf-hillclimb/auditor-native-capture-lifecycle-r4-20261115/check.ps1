$ErrorActionPreference='Stop'
$r=Join-Path (Get-Location) 'artifacts/perf-hillclimb/native-event-observer-lifecycle-r4-20261115'
$o=Join-Path (Get-Location) 'artifacts/perf-hillclimb/auditor-native-capture-lifecycle-r4-20261115'
$manifest=Join-Path $r 'build-manifest.json';$expected='bb73744168f62c3e2bd66779f3557f433cdd14a01c40559fde59a967bc0a1ef1'
if((Get-FileHash -LiteralPath $manifest -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected){throw 'Wrong r4 manifest'}
$m=Get-Content -LiteralPath $manifest -Raw|ConvertFrom-Json
foreach($p in $m.files.PSObject.Properties){if((Get-FileHash -LiteralPath (Join-Path $r $p.Name) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $p.Value){throw ('Changed manifest input '+$p.Name)}}
$abi=Join-Path (Get-Location) 'artifacts/perf-hillclimb/native-event-observer-build-r1-20261115/NativeCaptureAbi.cs'
$support=Join-Path (Get-Location) 'artifacts/perf-hillclimb/native-event-observer-support-r1-20261115/NativeCaptureSupport.cs'
if((Get-FileHash -LiteralPath $abi -Algorithm SHA256).Hash.ToLowerInvariant() -ne '8c7a7d5d70ba871e2341d40ce147cef5d80d664d475777b33366b670eefe4337' -or (Get-FileHash -LiteralPath $support -Algorithm SHA256).Hash.ToLowerInvariant() -ne 'fc3d4881e8e40089063eddfb3868db5570021d410b786b087e5912318e5d8442'){throw 'Frozen dependency changed'}
$resources=Get-Content -LiteralPath (Join-Path $r 'RepairedResources.cs') -Raw
$contracts=Get-Content -LiteralPath (Join-Path $r 'RepairContracts.cs') -Raw
$checks=[ordered]@{}
$checks['readyNotPreallocated']=$resources.Contains('readonly ManualResetEvent ready;') -and -not $resources.Contains('ready=new ManualResetEvent(false);'+[Environment]::NewLine+'    OwnedResource')
$checks['readyAfterSuccessAndInheritance']=$resources.IndexOf('if(!made)throw') -lt $resources.IndexOf('ready=new ManualResetEvent(false)') -and $resources.IndexOf('if(!changed)throw') -lt $resources.IndexOf('ready=new ManualResetEvent(false)')
$checks['setupContainsAdoptionAndReady']=$resources.Contains("try {`r`n        read=new OwnedResource(r);write=new OwnedResource(w);") -and $resources.Contains('throw SetupRollback.Release(error,read,write,ready);')
$checks['rollbackBoundedReverseAll']=$contracts.Contains('resources.Length<=8') -and $contracts.Contains('for(int i=resources.Length-1;i>=0;i--)') -and $contracts.Contains('try { resources[i].Dispose(); }catch(Exception error) { failures.Add(error); }')
foreach($p in $checks.GetEnumerator()){if(-not $p.Value){throw ('Source guard failed '+$p.Key)}}
$sources=@($abi,$support,(Join-Path $r 'RepairContracts.cs'),(Join-Path $r 'RepairedResources.cs'),(Join-Path $o 'IndependentRollback.cs'))
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe';$dll=Join-Path $o 'IndependentRollback.dll'
if(Test-Path -LiteralPath $dll){throw 'Never overwrite compiled proof'}
& $compiler /nologo /target:library /platform:x64 ('/out:'+$dll) @sources *> (Join-Path $o 'compile.log')
$code=$LASTEXITCODE;[IO.File]::WriteAllText((Join-Path $o 'compile-exit.txt'),[string]$code);if($code -ne 0){throw 'Independent compile failed'}
[Reflection.Assembly]::LoadFile($dll)|Out-Null
$managed=[IndependentRollbackR4.Checks]::Run()
$pins=[ordered]@{};foreach($f in @($sources)+@($manifest,$compiler,$dll,$PSCommandPath)){$pins[$f]=(Get-FileHash -LiteralPath $f -Algorithm SHA256).Hash.ToLowerInvariant()}
$receipt=[ordered]@{at=[DateTime]::UtcNow.ToString('o');verdict='AFFECTED_READY_ALLOCATION_ROLLBACK_SOURCE_MANAGED_PASS';manifestSha256=$expected;compileExit=$code;checks=$managed;sourceChecks=$checks;pins=$pins;scope='Independent narrow managed SetupRollback with partial/null/1..8 resources, reverse order and multiple disposal failures, plus representative preserved policies. Compiler process ran. No native helper constructor, Native/ExtraNative method, target/debug/capture/preview or child admission. Native return-only close failures and catastrophic partial adoption remain unconfirmed creation/controller obligations.'}
$receiptPath=Join-Path $o 'receipt.json';if(Test-Path -LiteralPath $receiptPath){throw 'Never overwrite receipt'}
[IO.File]::WriteAllText($receiptPath,($receipt|ConvertTo-Json -Depth 7),[Text.UTF8Encoding]::new($false))
[pscustomobject]@{at=$receipt.at;compileExit=$code;managed=$managed.Count;source=$checks.Count;receiptSha256=(Get-FileHash -LiteralPath $receiptPath -Algorithm SHA256).Hash.ToLowerInvariant();dllSha256=$pins[$dll]}|ConvertTo-Json -Compress
