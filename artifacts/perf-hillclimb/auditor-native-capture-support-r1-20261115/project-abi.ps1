$ErrorActionPreference='Stop'
$auditRoot=Join-Path (Get-Location) 'artifacts/perf-hillclimb/auditor-native-capture-support-r1-20261115'
if(Test-Path -LiteralPath (Join-Path $auditRoot 'projection.json')){throw 'Never overwrite projection proof'}
[Reflection.Assembly]::LoadFile((Join-Path $auditRoot 'IndependentSupport.dll'))|Out-Null
$b=[byte[]]::new(176)
function W32([int]$o,[uint32]$v){[Array]::Copy([BitConverter]::GetBytes($v),0,$script:b,$o,4)}
function W64([int]$o,[uint64]$v){[Array]::Copy([BitConverter]::GetBytes($v),0,$script:b,$o,8)}
W32 0 1;W32 4 1234;W32 8 5678;W32 16 3221226505;W32 20 1;W64 24 4294967297;W64 32 ([uint64]::MaxValue);W32 40 2;W64 48 9007199254740993;W64 56 ([uint64]::MaxValue);W32 168 1
$decoded=[NativeCapturePrototype.Abi]::Decode($b,1234)
$wire=[NativeCapturePrototype.Wire]::Lossless($decoded)
$json=$wire|ConvertTo-Json -Depth 8;$parsed=$json|ConvertFrom-Json
$checks=@()
function Check($n,$actual,$expected){if($actual -cne $expected){throw "$n failed"};$script:checks+=@{name=$n;pass=$true}}
Check 'actual-decoder-address-hex' $parsed.exceptionAddress '0xffffffffffffffff'
Check 'actual-decoder-nested-hex' $parsed.nestedRecord '0x0000000100000001'
Check 'actual-decoder-parameter-above-js-safe' $parsed.parameters[0] '0x0020000000000001'
Check 'actual-decoder-parameter-max' $parsed.parameters[1] '0xffffffffffffffff'
Check 'actual-decoder-first-chance' $parsed.firstChance 1
Check 'actual-decoder-code-unsigned' ([uint64]$parsed.exceptionCode) ([uint64]3221226505)
$r=[ordered]@{at=[DateTime]::UtcNow.ToString('o');checks=$checks;wire=$wire;scope='Actual managed Abi.Decode dictionary through Wire.Lossless and PowerShell JSON only; synthetic bytes, no OS debug event or Native invocation.'}
[IO.File]::WriteAllText((Join-Path $auditRoot 'projection.json'),($r|ConvertTo-Json -Depth 9),[Text.UTF8Encoding]::new($false))
[pscustomobject]@{at=$r.at;checks=$checks.Count;receiptSha256=(Get-FileHash -LiteralPath (Join-Path $auditRoot 'projection.json') -Algorithm SHA256).Hash.ToLower()}|ConvertTo-Json -Compress
