$ErrorActionPreference='Stop'
$supportRoot=Join-Path (Get-Location) 'artifacts/perf-hillclimb/native-event-observer-support-r1-20261115'
$abi=Join-Path (Get-Location) 'artifacts/perf-hillclimb/native-event-observer-build-r1-20261115/NativeCaptureAbi.cs'
$auditRoot=Join-Path (Get-Location) 'artifacts/perf-hillclimb/auditor-native-capture-support-r1-20261115'
$source=Join-Path $supportRoot 'NativeCaptureSupport.cs'
$manifest=Get-Content -LiteralPath (Join-Path $supportRoot 'build-manifest.json') -Raw | ConvertFrom-Json
if((Get-FileHash -LiteralPath (Join-Path $supportRoot 'build-manifest.json') -Algorithm SHA256).Hash.ToLower() -ne '7f59346d71e6160be8e663981c167be150e6a2aa80436e1d0ecb2f4a58b691c1'){throw 'Wrong support manifest'}
foreach($p in $manifest.files.PSObject.Properties){if((Get-FileHash -LiteralPath (Join-Path $supportRoot $p.Name) -Algorithm SHA256).Hash.ToLower() -ne $p.Value){throw ('Wrong pinned input '+$p.Name)}}
if((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLower() -ne 'fc3d4881e8e40089063eddfb3868db5570021d410b786b087e5912318e5d8442'){throw 'Wrong support source'}
if((Get-FileHash -LiteralPath $abi -Algorithm SHA256).Hash.ToLower() -ne '8c7a7d5d70ba871e2341d40ce147cef5d80d664d475777b33366b670eefe4337'){throw 'Wrong ABI source'}
if(Test-Path -LiteralPath (Join-Path $auditRoot 'receipt.json')){throw 'Never replace audit proof'}
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$dll=Join-Path $auditRoot 'IndependentSupport.dll'
& $compiler /nologo /target:library /platform:x64 "/out:$dll" $abi $source (Join-Path $auditRoot 'Reference.cs') *> (Join-Path $auditRoot 'compile.log')
$compileExit=$LASTEXITCODE;[IO.File]::WriteAllText((Join-Path $auditRoot 'compile-exit.txt'),"$compileExit`n")
if($compileExit -ne 0){throw 'Independent compile failed'}
[Reflection.Assembly]::LoadFile($dll)|Out-Null
$checks=@();$limits=@()
function Expect($name,$actual,$expected){if($actual -cne $expected){throw "$name expected $expected got $actual"};$script:checks+=@{name=$name;pass=$true}}
function Reject($name,[scriptblock]$action,$message){$caught=$null;try{&$action|Out-Null}catch{$caught=$_.Exception.GetBaseException().Message};if(-not $caught -or $caught -notmatch $message){throw "$name did not reject for $message, got $caught"};$script:checks+=@{name=$name;pass=$true;reason=$caught}}
foreach($p in @(@('StartupInfoEx64',112),@('SecurityAttributes',24),@('FileTimePair',8),@('JobBasicLimits',64),@('IoCounters',48),@('JobExtendedLimits',144),@('JobAccounting',48))){$t=[type]('NativeCapturePrototype.'+$p[0]);Expect ('layout-'+$p[0]) ([Runtime.InteropServices.Marshal]::SizeOf([Activator]::CreateInstance($t))) ([int]$p[1])}
Expect 'attributes-offset' ([Runtime.InteropServices.Marshal]::OffsetOf([NativeCapturePrototype.StartupInfoEx64],'attributes').ToInt32()) 104
Expect 'job-active-offset' ([Runtime.InteropServices.Marshal]::OffsetOf([NativeCapturePrototype.JobAccounting],'activeProcesses').ToInt32()) 40
$arguments=[string[]]@('', 'a b', 'x\', 'a"b', 'ends\\', '\\"q', '雪 and space', 'tab'+"`t"+'z', '& | < > ^ % !')
$command=[NativeCapturePrototype.Wire]::CommandLine('C:\Program Files\NeverExecuted.exe',$arguments)
$parsed=[IndependentSupportAudit.Reference]::Parse($command)
Expect 'quote-argc' $parsed.Length ($arguments.Length+1)
Expect 'quote-executable' $parsed[0] 'C:\Program Files\NeverExecuted.exe'
for($i=0;$i -lt $arguments.Length;$i++){Expect ('quote-roundtrip-'+$i) $parsed[$i+1] $arguments[$i]}
Expect 'quote-empty-exact' ([NativeCapturePrototype.Wire]::Quote('')) '""'
Expect 'quote-backslash-before-close-exact' ([NativeCapturePrototype.Wire]::Quote('a\')) '"a\\"'
Reject 'quote-nul' {[NativeCapturePrototype.Wire]::Quote("a`0z")} 'Null/NUL'
Reject 'commandline-cap' {[NativeCapturePrototype.Wire]::CommandLine('C:\x.exe',[string[]]@(('x'*32767)))} 'Native command line exceeded'
$known=[Collections.Generic.Dictionary[string,object]]::new();$known.Add('address',[uint64]::MaxValue);$known.Add('pid',[uint32]::MaxValue);$known.Add('parameters',[uint64[]]@([uint64]0,[uint64]9007199254740993,[uint64]::MaxValue))
$wire=[NativeCapturePrototype.Wire]::Lossless($known)
Expect 'wire-maximum' $wire['address'] '0xffffffffffffffff'
Expect 'wire-zero' $wire['parameters'][0] '0x0000000000000000'
Expect 'wire-above-js-safe' $wire['parameters'][1] '0x0020000000000001'
Expect 'wire-uint32-not-pointer' ($wire['pid'] -is [uint32]) $true
$roundtrip=($wire|ConvertTo-Json -Depth 8)|ConvertFrom-Json
Expect 'wire-json-lossless' $roundtrip.parameters[2] '0xffffffffffffffff'
$unsupported=[long]::MaxValue;$returned=[NativeCapturePrototype.Wire]::Lossless($unsupported)
Expect 'unsupported-int64-passes-through-not-generalized' ($returned -is [long]) $true
$limits+=@{name='wire-type-scope';finding='Int64/IntPtr/arbitrary objects are not converted/rejected by this U64 projector; future receipt schema must constrain supported types.'}
$unsupportedPointer=[IntPtr]::new(4294967297);Expect 'unsupported-intptr-passes-through' ([NativeCapturePrototype.Wire]::Lossless($unsupportedPointer) -is [IntPtr]) $true
$buffer=[NativeCapturePrototype.BoundedBytes]::new(4)
$inputBytes=[byte[]]@(1,2);$buffer.Append($inputBytes,2);$inputBytes[0]=99;$buffer.Append([byte[]]@(3,4),2)
Expect 'exact-cap-not-overflow' $buffer.Overflow $false
Expect 'buffer-does-not-alias-input' $buffer.Snapshot()[0] ([byte]1)
$snapshot=$buffer.Snapshot();$snapshot[0]=88;Expect 'snapshot-is-copy' $buffer.Snapshot()[0] ([byte]1)
$buffer.Append([byte[]]@(5,6),2);Expect 'buffer-prefix-kept' ([string]::Join(',',$buffer.Snapshot())) '1,2,3,4';Expect 'buffer-total' $buffer.Total ([long]6);Expect 'buffer-overflow-visible' $buffer.Overflow $true
Reject 'buffer-zero-cap' {[NativeCapturePrototype.BoundedBytes]::new(0)} 'Invalid retention bound'
Reject 'buffer-overlarge-cap' {[NativeCapturePrototype.BoundedBytes]::new(1048577)} 'Invalid retention bound'
Reject 'buffer-null-chunk' {$buffer.Append($null,0)} 'Invalid read chunk'
Reject 'buffer-negative-count' {$buffer.Append([byte[]]@(1),-1)} 'Invalid read chunk'
Reject 'buffer-excess-count' {$buffer.Append([byte[]]@(1),2)} 'Invalid read chunk'
Reject 'relative-path' {[NativeCapturePrototype.Guard]::Absolute('a/b')} 'Fully qualified'
Reject 'drive-relative-path' {[NativeCapturePrototype.Guard]::Absolute('C:relative')} 'Fully qualified'
Reject 'volume-root' {[NativeCapturePrototype.Guard]::Absolute('C:\')} 'Volume/share root'
Expect 'sibling-is-not-owned-child' ([NativeCapturePrototype.Guard]::Inside('C:\owned-other\x','C:\owned')) $false
Expect 'parent-escape-is-not-owned-child' ([NativeCapturePrototype.Guard]::Inside('C:\owned\x\..\..\elsewhere','C:\owned')) $false
$owned=Join-Path $auditRoot 'managed-fixture';$run=Join-Path $owned 'control-0-normal';[IO.Directory]::CreateDirectory($run)|Out-Null
$c=[NativeCapturePrototype.CaptureConfig]::new();$c.ArtifactRoot=$owned;$c.RunRoot=$run;$c.Cwd=$run;$c.Id='control-0-normal';$c.Mode='normal';$c.Executable=$compiler;$c.ExecutableSha256=[NativeCapturePrototype.Guard]::Sha256($compiler);$c.Arguments=[string[]]@('never-executed','a b');$c.WorkLimitMs=10000;$c.RawByteLimit=1048576;$c.EventLimit=2048;$c.ExceptionLimit=128;$c.ReceiptByteLimit=4194304
$allow=[string[]]@($compiler);$pin=[NativeCapturePrototype.Guard]::Fingerprint($c)
[NativeCapturePrototype.Guard]::Validate($c,$allow,$pin);Expect 'valid-guard-file-only-no-launch' $true $true
Reject 'wrong-config-pin' {[NativeCapturePrototype.Guard]::Validate($c,$allow,('0'*64))} 'Config differs'
Reject 'no-allowlist' {[NativeCapturePrototype.Guard]::Validate($c,[string[]]@(),$pin)} 'allowlist missing'
Reject 'wrong-allowlist' {[NativeCapturePrototype.Guard]::Validate($c,[string[]]@('C:\not-the-compiler.exe'),$pin)} 'not allowlisted'
$saved=$c.Id;$c.Id='control-1-normal';Reject 'wrong-control-order' {[NativeCapturePrototype.Guard]::Validate($c,$allow,[NativeCapturePrototype.Guard]::Fingerprint($c))} 'id/mode/order mismatch';$c.Id=$saved
$c.WorkLimitMs=10001;Reject 'wrong-cap' {[NativeCapturePrototype.Guard]::Validate($c,$allow,[NativeCapturePrototype.Guard]::Fingerprint($c))} 'Unadmitted control limits';$c.WorkLimitMs=10000
$c.Cwd=$owned;Reject 'wrong-cwd' {[NativeCapturePrototype.Guard]::Validate($c,$allow,[NativeCapturePrototype.Guard]::Fingerprint($c))} 'cwd must equal';$c.Cwd=$run
$c.ExecutableSha256='0'*64;Reject 'wrong-image-hash' {[NativeCapturePrototype.Guard]::Validate($c,$allow,[NativeCapturePrototype.Guard]::Fingerprint($c))} 'identity changed';$c.ExecutableSha256=[NativeCapturePrototype.Guard]::Sha256($compiler)
$c.Arguments=[string[]]@('a','bc');$pinA=[NativeCapturePrototype.Guard]::Fingerprint($c);$c.Arguments=[string[]]@('ab','c');Expect 'length-prefix-separates-argv' ([NativeCapturePrototype.Guard]::Fingerprint($c) -ne $pinA) $true
$c.Arguments=[string[]]@('never-executed','a b');$pin=[NativeCapturePrototype.Guard]::Fingerprint($c)
$c.Arguments=[string[]]@(1..17|ForEach-Object{'x'});Reject 'too-many-args' {[NativeCapturePrototype.Guard]::Validate($c,$allow,[NativeCapturePrototype.Guard]::Fingerprint($c))} 'Missing/excess arguments'
$c.Arguments=[string[]]@("a`0b");Reject 'nul-arg-config' {[NativeCapturePrototype.Guard]::Validate($c,$allow,[NativeCapturePrototype.Guard]::Fingerprint($c))} 'Null/NUL argument'
$c.Arguments=[string[]]@(('x'*16000));Reject 'args-length-cap' {[NativeCapturePrototype.Guard]::Validate($c,$allow,[NativeCapturePrototype.Guard]::Fingerprint($c))} 'Bounded command line exceeded'
$c.Arguments=[string[]]@('never-executed','a b')
[NativeCapturePrototype.Guard]::Reserve($run,'launch.json');Reject 'reservation-repeat' {[NativeCapturePrototype.Guard]::Reserve($run,'launch.json')} 'already exists';Reject 'validate-attempted-output' {[NativeCapturePrototype.Guard]::Validate($c,$allow,[NativeCapturePrototype.Guard]::Fingerprint($c))} 'Never repeat'
Reject 'reservation-traversal' {[NativeCapturePrototype.Guard]::Reserve($run,'../escape.json')} 'basename'
Expect 'support-source-still-frozen' ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLower()) 'fc3d4881e8e40089063eddfb3868db5570021d410b786b087e5912318e5d8442'
$pins=@{};foreach($f in @($source,$abi,$compiler,$dll,$PSCommandPath,(Join-Path $auditRoot 'Reference.cs'))){$pins[$f]=(Get-FileHash -LiteralPath $f -Algorithm SHA256).Hash.ToLower()}
$r=[ordered]@{at=[DateTime]::UtcNow.ToString('o');verdict='ACCEPT_PARTIAL_PURE_SUPPORT_ONLY';compileExit=$compileExit;checks=$checks;checkCount=$checks.Count;inputFiles=$pins;manifestSha256='7f59346d71e6160be8e663981c167be150e6a2aa80436e1d0ecb2f4a58b691c1';supportedWire=$wire;limits=$limits;scope='Compiler OS process and managed checks/file fixtures only; no Native extern called, target/processcontrol/browser/preview/observer loop/capture launched. No native ABI/generalized serializer/source-child/whole-SOUND admission.'}
[IO.File]::WriteAllText((Join-Path $auditRoot 'receipt.json'),($r|ConvertTo-Json -Depth 9),[Text.UTF8Encoding]::new($false))
[pscustomobject]@{at=$r.at;checks=$checks.Count;compileExit=$compileExit;dllSha256=$pins[$dll];receiptSha256=(Get-FileHash -LiteralPath (Join-Path $auditRoot 'receipt.json') -Algorithm SHA256).Hash.ToLower()}|ConvertTo-Json -Compress
