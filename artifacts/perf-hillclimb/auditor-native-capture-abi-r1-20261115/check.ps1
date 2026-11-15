$ErrorActionPreference='Stop'
$foundation=Join-Path (Get-Location) 'artifacts/perf-hillclimb/native-event-observer-build-r1-20261115'
$auditRoot=Join-Path (Get-Location) 'artifacts/perf-hillclimb/auditor-native-capture-abi-r1-20261115'
$source=Join-Path $foundation 'NativeCaptureAbi.cs'
$sourceHash=(Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLower()
if($sourceHash -ne '8c7a7d5d70ba871e2341d40ce147cef5d80d664d475777b33366b670eefe4337'){throw 'Unexpected foundation source'}
if((Get-FileHash -LiteralPath (Join-Path $foundation 'build-manifest.json') -Algorithm SHA256).Hash.ToLower() -ne 'd1aa623eb08f2711802f45563379e77a5fba63075ee1f36fba78801dbb6631f8'){throw 'Unexpected manifest'}
if(Test-Path -LiteralPath (Join-Path $auditRoot 'receipt.json')){throw 'Never overwrite audit fixture'}
$sourceText=[IO.File]::ReadAllText($source)
if($sourceText -match 'DllImport|LibraryImport|extern\s|Process\.Start|CreateProcess|WaitForDebug|ContinueDebug|MiniDumpWriteDump|RaiseFailFastException'){throw 'Unexpected native/launch surface'}
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$assembly=Join-Path $auditRoot 'NativeCaptureAbi.dll'
$compilerHash=(Get-FileHash -LiteralPath $compiler -Algorithm SHA256).Hash.ToLower()
$compileStarted=[DateTime]::UtcNow.ToString('o')
& $compiler /nologo /target:library /platform:x64 "/out:$assembly" $source *> (Join-Path $auditRoot 'compile.log')
$compileExit=$LASTEXITCODE
[IO.File]::WriteAllText((Join-Path $auditRoot 'compile-exit.txt'),"$compileExit`n")
if($compileExit -ne 0){throw 'Independent compilation failed'}
Add-Type -Path $assembly
$checks=@()
function Expect($name,$actual,$expected){if($actual -cne $expected){throw "$name expected $expected got $actual"};$script:checks+=@{name=$name;pass=$true}}
function Fails($name,[scriptblock]$action){$failed=$false;try{&$action|Out-Null}catch{$failed=$true};Expect $name $failed $true}
function Write32([byte[]]$b,[int]$at,[uint32]$n){$w=[IO.BinaryWriter]::new([IO.MemoryStream]::new($b,$true));try{$w.BaseStream.Position=$at;$w.Write($n)}finally{$w.Dispose()}}
function Write64([byte[]]$b,[int]$at,[uint64]$n){$w=[IO.BinaryWriter]::new([IO.MemoryStream]::new($b,$true));try{$w.BaseStream.Position=$at;$w.Write($n)}finally{$w.Dispose()}}
function Event([uint32]$kind){$b=[byte[]]::new(176);Write32 $b 0 $kind;Write32 $b 4 1234;Write32 $b 8 5678;return ,$b}
$l=[NativeCapturePrototype.Abi]::Layout()
foreach($p in @(@('startupInfoBytes',104),@('processInformationBytes',24),@('exceptionRecordBytes',152),@('exceptionDebugInfoBytes',160),@('debugEventBytes',176),@('unionOffset',16),@('exceptionParameterOffset',32),@('firstChanceOffset',152))){Expect ('layout-'+$p[0]) ([int]$l[$p[0]]) ([int]$p[1])}
$b=Event 1;Write32 $b 16 ([uint32]::MaxValue);Write32 $b 20 1;Write64 $b 24 ([uint64]::MaxValue);Write64 $b 32 ([uint64]::MaxValue);Write32 $b 40 15;Write32 $b 168 1
for($i=0;$i -lt 15;$i++){Write64 $b (48+8*$i) ([uint64]::MaxValue-[uint64]$i)}
$x=[NativeCapturePrototype.Abi]::Decode($b,1234)
Expect 'unsigned-code-max' ([uint64]$x['exceptionCode']) ([uint64][uint32]::MaxValue)
Expect 'nested-pointer-max' ([uint64]$x['nestedRecord']) ([uint64]::MaxValue)
Expect 'address-max' ([uint64]$x['exceptionAddress']) ([uint64]::MaxValue)
Expect 'fifteen-parameters' $x['parameters'].Count 15
for($i=0;$i -lt 15;$i++){Expect ('parameter-max-minus-'+$i) ([uint64]$x['parameters'][$i]) ([uint64]::MaxValue-[uint64]$i)}
Expect 'first-chance-one-preserved' ([uint32]$x['firstChance']) ([uint32]1)
Write32 $b 168 0;Expect 'second-chance-zero-preserved' ([uint32]([NativeCapturePrototype.Abi]::Decode($b,1234))['firstChance']) ([uint32]0)
Fails 'wrong-owner' {[NativeCapturePrototype.Abi]::Decode($b,2)}
Fails 'zero-owner' {[NativeCapturePrototype.Abi]::Decode($b,0)}
Fails 'null-buffer' {[NativeCapturePrototype.Abi]::Decode($null,1234)}
Fails 'short-buffer' {[NativeCapturePrototype.Abi]::Decode([byte[]]::new(175),1234)}
Fails 'long-buffer' {[NativeCapturePrototype.Abi]::Decode([byte[]]::new(177),1234)}
Write32 $b 40 16;Fails 'sixteen-parameters-rejected' {[NativeCapturePrototype.Abi]::Decode($b,1234)};Write32 $b 40 0
Write32 $b 168 2;Fails 'noncanonical-chance-two-rejected' {[NativeCapturePrototype.Abi]::Decode($b,1234)};Write32 $b 168 0
Write32 $b 8 0;Fails 'zero-tid' {[NativeCapturePrototype.Abi]::Decode($b,1234)};Write32 $b 8 5678
Write32 $b 0 0;Fails 'event-zero' {[NativeCapturePrototype.Abi]::Decode($b,1234)}
Write32 $b 0 10;Fails 'event-ten' {[NativeCapturePrototype.Abi]::Decode($b,1234)}
$b=Event 3;Write64 $b 16 ([uint64]::MaxValue);Write64 $b 24 4294967297;Write64 $b 32 4294967298;Write64 $b 40 4294967299;$x=[NativeCapturePrototype.Abi]::Decode($b,1234)
Expect 'create-file-handle-max' ([uint64]$x['fileHandle']) ([uint64]::MaxValue)
Expect 'create-process-handle-64' ([uint64]$x['processHandle']) ([uint64]4294967297)
Expect 'create-thread-handle-64' ([uint64]$x['threadHandle']) ([uint64]4294967298)
Expect 'create-image-base-64' ([uint64]$x['imageBase']) ([uint64]4294967299)
$b=Event 2;Write64 $b 16 4294967300;Expect 'thread-handle-64' ([uint64]([NativeCapturePrototype.Abi]::Decode($b,1234))['threadHandle']) ([uint64]4294967300)
$b=Event 6;Write64 $b 16 4294967301;Write64 $b 24 4294967302;$x=[NativeCapturePrototype.Abi]::Decode($b,1234);Expect 'dll-file-handle-64' ([uint64]$x['fileHandle']) ([uint64]4294967301);Expect 'dll-base-64' ([uint64]$x['imageBase']) ([uint64]4294967302)
$b=Event 7;Write64 $b 16 4294967303;Expect 'unload-base-64' ([uint64]([NativeCapturePrototype.Abi]::Decode($b,1234))['imageBase']) ([uint64]4294967303)
$b=Event 5;Write32 $b 16 23;$x=[NativeCapturePrototype.Abi]::Decode($b,1234);Expect 'ordinary-exit23' ([uint32]$x['exitCode']) ([uint32]23);Expect 'exit-not-exception' $x.ContainsKey('exceptionCode') $false
$b=Event 9;Write32 $b 16 17;Write32 $b 20 18;$x=[NativeCapturePrototype.Abi]::Decode($b,1234);Expect 'rip-error' ([uint32]$x['error']) ([uint32]17);Expect 'rip-type' ([uint32]$x['type']) ([uint32]18)
foreach($kind in @(4,8)){$b=Event $kind;$x=[NativeCapturePrototype.Abi]::Decode($b,1234);Expect ('header-only-event-'+$kind) ([uint32]$x['eventCode']) ([uint32]$kind);Expect ('no-fabricated-exception-'+$kind) $x.ContainsKey('exceptionCode') $false}
Expect 'source-still-frozen' ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLower()) $sourceHash
$r=[ordered]@{at=[DateTime]::UtcNow.ToString('o');verdict='ACCEPT_MANAGED_LAYOUT_DECODER_FOUNDATION_ONLY';sourceSha256=$sourceHash;manifestSha256='d1aa623eb08f2711802f45563379e77a5fba63075ee1f36fba78801dbb6631f8';compiler=$compiler;compilerSha256=$compilerHash;compileStarted=$compileStarted;compileExit=$compileExit;assemblySha256=(Get-FileHash -LiteralPath $assembly -Algorithm SHA256).Hash.ToLower();fixtureSha256=(Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLower();checks=$checks;checkCount=$checks.Count;layout=$l;scope='Compiler OS process and managed DLL loading/checks only. No debugger API/PInvoke, debug target, product/preview, observer loop, capture or complete-observer admission. Managed layout/byte fixtures are not actual Windows ABI/debug-event proof.'}
[IO.File]::WriteAllText((Join-Path $auditRoot 'receipt.json'),($r|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
[pscustomobject]@{at=$r.at;checks=$checks.Count;compileExit=$compileExit;assemblySha256=$r.assemblySha256;receiptSha256=(Get-FileHash -LiteralPath (Join-Path $auditRoot 'receipt.json') -Algorithm SHA256).Hash.ToLower()}|ConvertTo-Json -Compress
