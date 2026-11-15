$ErrorActionPreference='Stop'
$root=Join-Path (Get-Location) 'artifacts/perf-hillclimb/native-event-observer-lifecycle-r2-20261115'
$receipt=Join-Path $root 'pure-result.json'
if(Test-Path -LiteralPath $receipt){throw 'Never overwrite r2 proof'}
$abi=Join-Path (Get-Location) 'artifacts/perf-hillclimb/native-event-observer-build-r1-20261115/NativeCaptureAbi.cs'
$support=Join-Path (Get-Location) 'artifacts/perf-hillclimb/native-event-observer-support-r1-20261115/NativeCaptureSupport.cs'
if((Get-FileHash -LiteralPath $abi -Algorithm SHA256).Hash.ToLowerInvariant() -ne '8c7a7d5d70ba871e2341d40ce147cef5d80d664d475777b33366b670eefe4337'){throw 'ABI changed'}
if((Get-FileHash -LiteralPath $support -Algorithm SHA256).Hash.ToLowerInvariant() -ne 'fc3d4881e8e40089063eddfb3868db5570021d410b786b087e5912318e5d8442'){throw 'Support changed'}
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$dll=Join-Path $root 'NativeCaptureRepair.dll';if(Test-Path -LiteralPath $dll){throw 'Compiled output already exists'}
$sources=@($abi,$support,(Join-Path $root 'RepairContracts.cs'),(Join-Path $root 'RepairedResources.cs'),(Join-Path $root 'PureFixtures.cs'))
& $compiler '/nologo' '/target:library' '/platform:x64' ('/out:'+$dll) @sources *> (Join-Path $root 'compile.log')
$code=$LASTEXITCODE;[IO.File]::WriteAllText((Join-Path $root 'compile-exit.txt'),[string]$code)
if($code -ne 0){throw 'Compile failed; original source/logs retained'}
[Reflection.Assembly]::LoadFile($dll)|Out-Null
$checks=[NativeCaptureRepairProof.PureChecks]::Run()
$files=@{};foreach($file in @($sources)+@($compiler,$dll,$PSCommandPath)){$files[$file]=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()}
$result=[ordered]@{at=[DateTime]::UtcNow.ToString('o');compileExit=$code;files=$files;checks=$checks;scope='Builder pure managed fake-handle lease/concurrency, fake monotonic budget, reader-state and continuation-policy checks only. Compiler and managed fixture threads ran. No actual OwnedJob/Pipe/Drain construction, Native/ExtraNative call, target/preview launch or debug capture. Not native lifecycle/OS deadline/cancellation proof or child admission.'}
[IO.File]::WriteAllText($receipt,($result|ConvertTo-Json -Depth 7),[Text.UTF8Encoding]::new($false))
[pscustomobject]@{checks=$checks.Count;pass=$true;artifact=$receipt}|ConvertTo-Json -Compress
