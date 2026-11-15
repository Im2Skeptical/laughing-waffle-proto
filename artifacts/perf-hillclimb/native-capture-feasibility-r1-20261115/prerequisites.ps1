$ErrorActionPreference='Stop'
$taskRoot=Join-Path (Get-Location) 'artifacts/perf-hillclimb/native-capture-feasibility-r1-20261115'
$outFile=Join-Path $taskRoot 'prerequisites.json'
if(Test-Path -LiteralPath $outFile){throw 'Never replace this prerequisite receipt'}
$files=@()
foreach($file in @((Get-Process -Id $PID).Path,'C:/Program Files/nodejs/node.exe',(Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),(Join-Path $env:WINDIR 'System32/kernel32.dll'),(Join-Path $env:WINDIR 'System32/dbghelp.dll'),(Join-Path $env:WINDIR 'System32/dbgcore.dll'))){
  $row=[ordered]@{path=$file;state='NOT_INSPECTED';bytes=$null;version=$null;sha256=$null;error=$null}
  try{
    if(Test-Path -LiteralPath $file -PathType Leaf){$item=Get-Item -LiteralPath $file;$row.bytes=$item.Length;$row.version=$item.VersionInfo.FileVersion;$row.sha256=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant();$row.state='PRESENT_METADATA_ONLY'}else{$row.state='MISSING'}
  }catch{$row.state='QUERY_ERROR';$row.error=$_.Exception.Message}
  $files+=$row
}
$receipt=[ordered]@{at=[DateTime]::UtcNow.ToString('o');hostPid=$PID;host64Bit=[Environment]::Is64BitProcess;os64Bit=[Environment]::Is64BitOperatingSystem;powerShell=$PSVersionTable.PSVersion.ToString();files=$files;scope='Six explicit prerequisite files read/hash only. No compiler/native export invocation, prototype, child launch, capture, install or settings change. Presence does not prove compile/API/capture capability.'}
[IO.File]::WriteAllText($outFile,($receipt|ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false))
[pscustomobject]@{host64Bit=$receipt.host64Bit;powerShell=$receipt.powerShell;present=@($files|Where-Object{$_.state -eq 'PRESENT_METADATA_ONLY'}).Count;other=@($files|Where-Object{$_.state -ne 'PRESENT_METADATA_ONLY'});artifact=$outFile}|ConvertTo-Json -Depth 4 -Compress
