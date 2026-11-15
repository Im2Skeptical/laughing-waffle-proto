$ErrorActionPreference='Stop'
$taskRoot=Join-Path (Get-Location) 'artifacts/perf-hillclimb/native-event-observer-support-r1-20261115'
$manifestFile=Join-Path $taskRoot 'pure-result-r2.json'
if(Test-Path -LiteralPath $manifestFile){throw 'Never replace build/pure evidence'}
$abi=Join-Path (Get-Location) 'artifacts/perf-hillclimb/native-event-observer-build-r1-20261115/NativeCaptureAbi.cs'
if((Get-FileHash -LiteralPath $abi -Algorithm SHA256).Hash.ToLowerInvariant() -ne '8c7a7d5d70ba871e2341d40ce147cef5d80d664d475777b33366b670eefe4337'){throw 'Frozen ABI source changed'}
$source=Join-Path $taskRoot 'NativeCaptureSupport.cs'
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$dll=Join-Path $taskRoot 'NativeCaptureSupport-r2.dll'
if(Test-Path -LiteralPath $dll){throw 'Never overwrite compiled proof'}
& $compiler '/nologo' '/target:library' '/platform:x64' ('/out:'+$dll) $abi $source *> (Join-Path $taskRoot 'compile-r2.log')
$compileExit=$LASTEXITCODE
[IO.File]::WriteAllText((Join-Path $taskRoot 'compile-exit-r2.txt'),[string]$compileExit)
if($compileExit -ne 0){throw "Compile failed; retained compile-r2.log code$compileExit"}
[Reflection.Assembly]::LoadFile($dll)|Out-Null
$checks=@()
function Expect($name,$actual,$expected){if($actual -cne $expected){throw "$name expected $expected got $actual"};$script:checks+=@{name=$name;pass=$true}}
function Fails($name,[scriptblock]$action){$failed=$false;try{&$action|Out-Null}catch{$failed=$true};Expect $name $failed $true}
foreach($pair in @(@('StartupInfoEx64',112),@('SecurityAttributes',24),@('FileTimePair',8),@('JobBasicLimits',64),@('IoCounters',48),@('JobExtendedLimits',144),@('JobAccounting',48))){
  $type=([type]('NativeCapturePrototype.'+$pair[0]));Expect ('layout-'+$pair[0]) ([Runtime.InteropServices.Marshal]::SizeOf([Activator]::CreateInstance($type))) ([int]$pair[1])
}
Expect 'job-limit-flags-offset' ([Runtime.InteropServices.Marshal]::OffsetOf([NativeCapturePrototype.JobBasicLimits],'flags').ToInt32()) 16
Expect 'job-active-count-offset' ([Runtime.InteropServices.Marshal]::OffsetOf([NativeCapturePrototype.JobAccounting],'activeProcesses').ToInt32()) 40
Expect 'extended-attributes-offset' ([Runtime.InteropServices.Marshal]::OffsetOf([NativeCapturePrototype.StartupInfoEx64],'attributes').ToInt32()) 104
Expect 'hex64-maximum' ([NativeCapturePrototype.Wire]::Hex64([uint64]::MaxValue)) '0xffffffffffffffff'
$large=[Collections.Generic.Dictionary[string,object]]::new();$large.Add('address',[uint64]::MaxValue);$large.Add('pid',[uint32]1234);$large.Add('parameters',[uint64[]]@([uint64]::MaxValue,[uint64]7))
$wire=[NativeCapturePrototype.Wire]::Lossless($large)
Expect 'wire-address-is-string' $wire['address'] '0xffffffffffffffff'
Expect 'wire-parameter-is-string' $wire['parameters'][1] '0x0000000000000007'
Expect 'wire-pid-stays-uint32' ($wire['pid'] -is [uint32]) $true
$wireJson=$wire|ConvertTo-Json -Depth 6
$wireParsed=$wireJson|ConvertFrom-Json
Expect 'wire-json-maximum-roundtrip' $wireParsed.address '0xffffffffffffffff'
Expect 'wire-json-parameter-roundtrip' $wireParsed.parameters[0] '0xffffffffffffffff'
Expect 'quote-empty' ([NativeCapturePrototype.Wire]::Quote('')) '""'
Expect 'quote-simple' ([NativeCapturePrototype.Wire]::Quote('abc')) '"abc"'
Expect 'quote-space' ([NativeCapturePrototype.Wire]::Quote('a b')) '"a b"'
Expect 'quote-final-slash' ([NativeCapturePrototype.Wire]::Quote('a\')) '"a\\"'
Expect 'quote-embedded-quote' ([NativeCapturePrototype.Wire]::Quote('a"b')) '"a\"b"'
Fails 'quote-nul' {[NativeCapturePrototype.Wire]::Quote("a`0b")}
Fails 'relative-path' {[NativeCapturePrototype.Guard]::Absolute('relative/file')}
Fails 'drive-relative-path' {[NativeCapturePrototype.Guard]::Absolute('C:relative')}
Fails 'root-relative-path' {[NativeCapturePrototype.Guard]::Absolute('\relative')}
Fails 'volume-root' {[NativeCapturePrototype.Guard]::Absolute('C:\')}
Expect 'sibling-not-inside' ([NativeCapturePrototype.Guard]::Inside('C:\owned-other\run','C:\owned')) $false
Expect 'normalized-escape-not-inside' ([NativeCapturePrototype.Guard]::Inside('C:\owned\..\other','C:\owned')) $false
$buffer=[NativeCapturePrototype.BoundedBytes]::new(4);$buffer.Append([byte[]]@(1,2,3),3);$buffer.Append([byte[]]@(4,5,6),3)
Expect 'bounded-retained-count' $buffer.Snapshot().Length 4
Expect 'bounded-total-count' $buffer.Total ([long]6)
Expect 'bounded-overflow-visible' $buffer.Overflow $true
Expect 'bounded-prefix-kept' ([string]::Join(',',$buffer.Snapshot())) '1,2,3,4'
Fails 'invalid-retention-limit' {[NativeCapturePrototype.BoundedBytes]::new(0)}
Fails 'invalid-chunk-length' {$buffer.Append([byte[]]@(1),2)}
$owned=Join-Path $taskRoot 'pure-fixture-r2';$run=Join-Path $owned 'control-0-normal'
[IO.Directory]::CreateDirectory($run)|Out-Null
$config=[NativeCapturePrototype.CaptureConfig]::new()
$config.ArtifactRoot=$owned;$config.RunRoot=$run;$config.Cwd=$run;$config.Id='control-0-normal';$config.Mode='normal'
$config.Executable=(Get-Process -Id $PID).Path;$config.ExecutableSha256=[NativeCapturePrototype.Guard]::Sha256($config.Executable)
$config.Arguments=[string[]]@('fixture-only-never-executed','a b','q"z');$config.WorkLimitMs=10000;$config.RawByteLimit=1048576;$config.EventLimit=2048;$config.ExceptionLimit=128;$config.ReceiptByteLimit=4194304
$allow=[string[]]@($config.Executable);$fingerprint=[NativeCapturePrototype.Guard]::Fingerprint($config)
[NativeCapturePrototype.Guard]::Validate($config,$allow,$fingerprint);Expect 'valid-guard-does-not-launch' $true $true
Fails 'wrong-config-pin' {[NativeCapturePrototype.Guard]::Validate($config,$allow,('0'*64))}
Fails 'missing-allowlist' {[NativeCapturePrototype.Guard]::Validate($config,[string[]]@(),$fingerprint)}
$config.Arguments[1]='changed';Fails 'changed-argument-pin' {[NativeCapturePrototype.Guard]::Validate($config,$allow,$fingerprint)};$config.Arguments[1]='a b'
$config.Id='control-1-normal';Fails 'wrong-control-order' {[NativeCapturePrototype.Guard]::Validate($config,$allow,[NativeCapturePrototype.Guard]::Fingerprint($config))};$config.Id='control-0-normal'
$config.WorkLimitMs=10001;Fails 'changed-control-limit' {[NativeCapturePrototype.Guard]::Validate($config,$allow,[NativeCapturePrototype.Guard]::Fingerprint($config))};$config.WorkLimitMs=10000
$config.ExecutableSha256='0'*64;Fails 'wrong-executable-hash' {[NativeCapturePrototype.Guard]::Validate($config,$allow,[NativeCapturePrototype.Guard]::Fingerprint($config))};$config.ExecutableSha256=[NativeCapturePrototype.Guard]::Sha256($config.Executable)
[NativeCapturePrototype.Guard]::Reserve($run,'launch.json')
Fails 'exclusive-marker-repeat' {[NativeCapturePrototype.Guard]::Reserve($run,'launch.json')}
Fails 'guard-rejects-attempted-root' {[NativeCapturePrototype.Guard]::Validate($config,$allow,[NativeCapturePrototype.Guard]::Fingerprint($config))}
Fails 'marker-outside-root' {[NativeCapturePrototype.Guard]::Reserve($run,'../escape.json')}
$files=@{};foreach($file in @($abi,$source,$compiler,$dll,$PSCommandPath)){ $files[$file]=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() }
$receipt=[ordered]@{at=[DateTime]::UtcNow.ToString('o');compileExit=$compileExit;files=$files;checks=$checks;wireFixture=$wire;scope='Builder compile and pure layout/guard/quoting/buffer/wire checks only. Compiler process ran. Fixture launch.json is a managed exclusive-file test, not a target dispatch. No Native method, debug/control/preview target or observer loop invoked. Declarations/support only, no native ABI/capture proof or source admission.'}
[IO.File]::WriteAllText($manifestFile,($receipt|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
[pscustomobject]@{checks=$checks.Count;pass=$true;artifact=$manifestFile}|ConvertTo-Json -Compress
