$ErrorActionPreference='Stop'
$root=Join-Path (Get-Location) 'artifacts/perf-hillclimb/native-event-observer-lifecycle-r1-20261115'
$receipt=Join-Path $root 'compile-build.json'
if(Test-Path -LiteralPath $receipt){throw 'Never overwrite build receipt'}
$abi=Join-Path (Get-Location) 'artifacts/perf-hillclimb/native-event-observer-build-r1-20261115/NativeCaptureAbi.cs'
$support=Join-Path (Get-Location) 'artifacts/perf-hillclimb/native-event-observer-support-r1-20261115/NativeCaptureSupport.cs'
$source=Join-Path $root 'NativeCaptureLifecycle.cs'
if((Get-FileHash -LiteralPath $abi -Algorithm SHA256).Hash.ToLowerInvariant() -ne '8c7a7d5d70ba871e2341d40ce147cef5d80d664d475777b33366b670eefe4337'){throw 'ABI source drift'}
if((Get-FileHash -LiteralPath $support -Algorithm SHA256).Hash.ToLowerInvariant() -ne 'fc3d4881e8e40089063eddfb3868db5570021d410b786b087e5912318e5d8442'){throw 'Support source drift'}
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$dll=Join-Path $root 'NativeCaptureLifecycle.dll'
if(Test-Path -LiteralPath $dll){throw 'Never overwrite compiled output'}
& $compiler '/nologo' '/target:library' '/platform:x64' ('/out:'+$dll) $abi $support $source *> (Join-Path $root 'compile.log')
$code=$LASTEXITCODE;[IO.File]::WriteAllText((Join-Path $root 'compile-exit.txt'),[string]$code)
if($code -ne 0){throw 'Compile failed; retain log/output; no source API called'}
$assembly=[Reflection.Assembly]::LoadFile($dll)
$types=@($assembly.GetExportedTypes()|ForEach-Object{$_.FullName})
$files=@{};foreach($file in @($abi,$support,$source,$compiler,$dll,$PSCommandPath)){$files[$file]=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()}
$result=[ordered]@{at=[DateTime]::UtcNow.ToString('o');compileExit=$code;files=$files;exportedTypes=$types;scope='Compilation plus reflection metadata only. Compiler process ran. No OwnedJob/BoundedPipe construction, Native/LifecycleNative method, debug/control/preview target or event loop called. Partial source NOT admitted or native/cleanup/capture proved.'}
[IO.File]::WriteAllText($receipt,($result|ConvertTo-Json -Depth 7),[Text.UTF8Encoding]::new($false))
[pscustomobject]@{compileExit=$code;types=$types.Count;artifact=$receipt;targetLaunched=$false}|ConvertTo-Json -Compress
