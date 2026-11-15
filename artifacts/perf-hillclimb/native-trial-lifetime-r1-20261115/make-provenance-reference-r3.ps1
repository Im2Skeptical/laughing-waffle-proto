$ErrorActionPreference='Stop'
$taskRoot=Join-Path (Get-Location) 'artifacts/perf-hillclimb/native-trial-lifetime-r1-20261115'
$taskProof=Join-Path $taskRoot 'provenance-proof-r3'
if(Test-Path -LiteralPath $taskProof){throw 'Fresh proof identity required'}
[IO.Directory]::CreateDirectory($taskProof)|Out-Null
$taskLibrary=Join-Path $taskRoot 'TrialEntry-r2.dll'
if((Get-FileHash -LiteralPath $taskLibrary).Hash.ToLowerInvariant() -cne 'bcf7743bd3d82da8dfa7899f9ac8bf01dcd23ce0c1cb7df153e92aab90ea5759'){throw 'Frozen managed library changed'}
Add-Type -AssemblyName System.Web.Extensions
[Reflection.Assembly]::LoadFile($taskLibrary)|Out-Null
$taskMethod=[NativeTrialLifetime.PureHostLaunchChecks].GetMethod('Config',[Reflection.BindingFlags]'Static,NonPublic')
$taskFrozen=$taskMethod.Invoke($null,@())
$taskInput=[NativeTrialLifetime.FrozenTrial].GetField('c',[Reflection.BindingFlags]'Instance,NonPublic').GetValue($taskFrozen)
$taskJson=[System.Web.Script.Serialization.JavaScriptSerializer]::new()
$taskRows=@()
foreach($taskMode in @('reuse','fail-after-first')){
  $taskClone=$taskJson.Deserialize($taskJson.Serialize($taskInput),[NativeTrialLifetime.TrialConfig])
  if($taskMode -eq 'fail-after-first'){$taskClone.Id='lifetime-1-fail-after-first';$taskClone.Mode='fail-after-first';$taskClone.RunRoot=Join-Path (Join-Path $taskClone.ArtifactRoot 'controls') $taskClone.Id}
  $taskClone.Inputs=$taskFrozen.InputPins
  $taskValue=[NativeTrialLifetime.FrozenTrial]::new($taskClone)
  if(-not $taskClone -or $taskValue.ConfigSha256 -cnotmatch '^[0-9a-f]{64}$'){throw 'Invalid pure managed reference'}
  $taskRows+=@{mode=$taskMode;config=$taskClone;fingerprint=$taskValue.ConfigSha256}
}
[IO.File]::WriteAllText((Join-Path $taskProof 'managed-fingerprint-reference.json'),($taskRows|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
[ordered]@{referenceSlots=$taskRows.Count;nativeCalls=0;actualConfigOrSlotCreated=$false;artifact=$taskProof}|ConvertTo-Json -Compress
