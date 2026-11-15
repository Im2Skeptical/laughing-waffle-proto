$ErrorActionPreference='Stop'
$taskRoot=Join-Path (Get-Location) 'artifacts/perf-hillclimb/native-event-observer-build-r1-20261115'
$receipt=Join-Path $taskRoot 'pure-abi.json'
if(Test-Path -LiteralPath $receipt){throw 'Never overwrite pure build proof'}
$source=Join-Path $taskRoot 'NativeCaptureAbi.cs'
Add-Type -Path $source
$checks=@()
function Expect($name,$actual,$expected){if($actual -cne $expected){throw "$name expected $expected got $actual"};$script:checks+=@{name=$name;pass=$true}}
$layout=[NativeCapturePrototype.Abi]::Layout()
foreach($pair in @(@('startupInfoBytes',104),@('processInformationBytes',24),@('exceptionRecordBytes',152),@('exceptionDebugInfoBytes',160),@('debugEventBytes',176),@('unionOffset',16),@('exceptionParameterOffset',32),@('firstChanceOffset',152))){Expect $pair[0] ([int]$layout[$pair[0]]) ([int]$pair[1])}
function Put32($bytes,$offset,[uint32]$value){[Array]::Copy([BitConverter]::GetBytes($value),0,$bytes,$offset,4)}
function Put64($bytes,$offset,[uint64]$value){[Array]::Copy([BitConverter]::GetBytes($value),0,$bytes,$offset,8)}
function Fails($name,[scriptblock]$action){$failed=$false;try{&$action|Out-Null}catch{$failed=$true};Expect $name $failed $true}
$event=[byte[]]::new(176);Put32 $event 0 1;Put32 $event 4 1234;Put32 $event 8 5678
Put32 $event 16 3221226505;Put32 $event 20 1;Put64 $event 32 12345678;Put32 $event 40 2;Put64 $event 48 7;Put64 $event 56 1346720326
$decoded=[NativeCapturePrototype.Abi]::Decode($event,1234)
Expect 'native-code-is-unsigned' ([uint64]$decoded['exceptionCode']) ([uint64]3221226505)
Expect 'native-first-chance-is-zero' ([uint32]$decoded['firstChance']) ([uint32]0)
Expect 'native-address' ([uint64]$decoded['exceptionAddress']) ([uint64]12345678)
Expect 'native-parameter-count' ([int]$decoded['parameters'].Count) 2
Expect 'native-parameter0' ([uint64]$decoded['parameters'][0]) ([uint64]7)
Expect 'native-parameter1' ([uint64]$decoded['parameters'][1]) ([uint64]1346720326)
Fails 'wrong-owner' {[NativeCapturePrototype.Abi]::Decode($event,1235)}
Fails 'missing-owner' {[NativeCapturePrototype.Abi]::Decode($event,0)}
Fails 'truncated-buffer' {[NativeCapturePrototype.Abi]::Decode([byte[]]::new(175),1234)}
Fails 'oversized-buffer' {[NativeCapturePrototype.Abi]::Decode([byte[]]::new(177),1234)}
Put32 $event 40 16;Fails 'excess-parameters' {[NativeCapturePrototype.Abi]::Decode($event,1234)};Put32 $event 40 2
Put32 $event 168 2;Fails 'invalid-first-chance' {[NativeCapturePrototype.Abi]::Decode($event,1234)};Put32 $event 168 0
Put32 $event 8 0;Fails 'missing-thread' {[NativeCapturePrototype.Abi]::Decode($event,1234)};Put32 $event 8 5678
Put32 $event 0 10;Fails 'unknown-event' {[NativeCapturePrototype.Abi]::Decode($event,1234)}
Put32 $event 0 5;Put32 $event 16 23;$exit=[NativeCapturePrototype.Abi]::Decode($event,1234)
Expect 'ordinary-nonzero-exit' ([int]$exit['exitCode']) 23
Expect 'exit-not-fabricated-exception' $exit.ContainsKey('exceptionCode') $false
$result=[ordered]@{at=[DateTime]::UtcNow.ToString('o');sourceSha256=(Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant();host64Bit=[Environment]::Is64BitProcess;layout=$layout;checks=$checks;scope='Builder pure managed compilation/layout/synthetic-byte decoder only. No debug API import/invocation, child launch, preview, exception capture or complete observer. Not independent acceptance or OS ABI/capture proof.'}
[IO.File]::WriteAllText($receipt,($result|ConvertTo-Json -Depth 7),[Text.UTF8Encoding]::new($false))
[pscustomobject]@{checks=$checks.Count;pass=$true;artifact=$receipt;scope=$result.scope}|ConvertTo-Json -Compress
