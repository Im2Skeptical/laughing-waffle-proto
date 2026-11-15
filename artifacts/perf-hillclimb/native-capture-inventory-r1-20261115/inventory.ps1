$ErrorActionPreference='Stop'
$taskRoot=Join-Path (Get-Location) 'artifacts/perf-hillclimb/native-capture-inventory-r1-20261115'
$outFile=Join-Path $taskRoot 'inventory.json'
if(Test-Path -LiteralPath $outFile){throw 'Never replace this inventory receipt'}
$names=@('procdump.exe','procdump64.exe','procdump64a.exe','cdb.exe','ntsd.exe','windbg.exe','windbgx.exe')
$candidates=@();$pathQueries=@()
foreach($name in $names){
  $query=[ordered]@{name=$name;state='NOT_QUERIED';paths=@();error=$null}
  try{
    $found=@(Get-Command -Name $name -CommandType Application -All -ErrorAction Stop)
    $query.state='FOUND';$query.paths=@($found|ForEach-Object{$_.Source})
    foreach($item in $found){$candidates+=@{path=$item.Source;origin='PATH:'+ $name}}
  }catch{
    $query.state=if($_.FullyQualifiedErrorId -match 'CommandNotFoundException'){'NOT_FOUND'}else{'QUERY_ERROR'}
    $query.error=@{id=$_.FullyQualifiedErrorId;message=$_.Exception.Message}
  }
  $pathQueries+=$query
}
$sdkBases=@((Join-Path $env:ProgramFiles 'Windows Kits/10/Debuggers'),(Join-Path ${env:ProgramFiles(x86)} 'Windows Kits/10/Debuggers'))
foreach($base in $sdkBases){foreach($arch in @('x64','x86','arm64')){foreach($exe in @('cdb.exe','ntsd.exe','windbg.exe')){
  $candidates+=@{path=(Join-Path (Join-Path $base $arch) $exe);origin='EXPLICIT_SDK'}
}}}
foreach($base in @((Join-Path $env:ProgramFiles 'Sysinternals'),(Join-Path ${env:ProgramFiles(x86)} 'Sysinternals'),'C:/Tools/Sysinternals','C:/Sysinternals')){foreach($exe in @('procdump.exe','procdump64.exe','procdump64a.exe')){
  $candidates+=@{path=(Join-Path $base $exe);origin='EXPLICIT_SYSINTERNALS'}
}}
$unique=@{};$selected=@()
foreach($item in $candidates){$full=[IO.Path]::GetFullPath($item.path);$key=$full.ToLowerInvariant();if(-not $unique.ContainsKey($key)){$unique[$key]=$true;$selected+=@{path=$full;origin=$item.origin}}}
$overflow=$selected.Count -gt 64;$rows=@()
foreach($item in @($selected|Select-Object -First 64)){
  $row=[ordered]@{path=$item.path;origin=$item.origin;state='NOT_INSPECTED';bytes=$null;version=$null;architecture=$null;machine=$null;sha256=$null;attributes=$null;error=$null}
  try{
    if(-not(Test-Path -LiteralPath $item.path -PathType Leaf)){$row.state='MISSING';$rows+=$row;continue}
    $file=Get-Item -LiteralPath $item.path -Force -ErrorAction Stop
    $row.bytes=$file.Length;$row.attributes=$file.Attributes.ToString();$row.version=$file.VersionInfo.FileVersion
    if(($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){$row.state='REPARSE_OR_ALIAS_NOT_FOLLOWED';$rows+=$row;continue}
    if($file.Length -lt 64){$row.state='NON_PE_OR_ZERO_LENGTH';$rows+=$row;continue}
    $stream=[IO.File]::Open($file.FullName,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::ReadWrite)
    try{
      $reader=[IO.BinaryReader]::new($stream)
      if($reader.ReadUInt16() -ne 0x5a4d){throw 'Missing MZ signature'}
      $stream.Position=0x3c;$pe=$reader.ReadInt32()
      if($pe -lt 64 -or $pe -gt 1048576 -or $pe+6 -gt $file.Length){throw 'PE offset outside bounded header'}
      $stream.Position=$pe;if($reader.ReadUInt32() -ne 0x4550){throw 'Missing PE signature'}
      $machine=$reader.ReadUInt16();$row.machine=('0x{0:x4}' -f $machine)
      $row.architecture=switch($machine){0x8664{'x64'}0x14c{'x86'}0xaa64{'arm64'}default{'OTHER'}}
    }finally{$stream.Dispose()}
    if($file.Length -gt 104857600){$row.state='PE_METADATA_ONLY_HASH_CAP';$rows+=$row;continue}
    $row.sha256=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256 -ErrorAction Stop).Hash.ToLowerInvariant()
    $row.state='PE_FILE_PRESENT_NOT_EXECUTED'
  }catch{$row.state='INSPECTION_ERROR';$row.error=@{id=$_.FullyQualifiedErrorId;message=$_.Exception.Message}}
  $rows+=$row
}
$receipt=[ordered]@{at=[DateTime]::UtcNow.ToString('o');runtimeVersion=$PSVersionTable.PSVersion.ToString();pathQueries=$pathQueries;candidateCap=64;candidatesBeforeCap=$selected.Count;overflow=$overflow;candidates=$rows;scope='Read-only PATH and explicit SDK/Sysinternals file metadata only. No executable invocation, install, EULA acceptance, attachment, global setting, registry modification, Node startup or recursive search. Presence/metadata does not establish capture capability. Unqueried locations remain outside coverage.'}
[IO.File]::WriteAllText($outFile,($receipt|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
[ordered]@{candidates=$rows.Count;overflow=$overflow;present=@($rows|Where-Object{$_.state -eq 'PE_FILE_PRESENT_NOT_EXECUTED'}|ForEach-Object{@{path=$_.path;version=$_.version;architecture=$_.architecture;sha256=$_.sha256}});otherStates=@($rows|Group-Object state|ForEach-Object{@{state=$_.Name;count=$_.Count}});artifact=$outFile}|ConvertTo-Json -Depth 5 -Compress
