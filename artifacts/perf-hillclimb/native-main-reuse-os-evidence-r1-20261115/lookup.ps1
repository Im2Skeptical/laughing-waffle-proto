$ErrorActionPreference='Stop'
$taskRoot=Join-Path (Get-Location) 'artifacts/perf-hillclimb/native-main-reuse-os-evidence-r1-20261115'
$outFile=Join-Path $taskRoot 'lookup.json'
if(Test-Path -LiteralPath $outFile){throw 'Never overwrite this lookup receipt'}
$start=[DateTimeOffset]::Parse('2026-11-15T03:39:30Z')
$end=[DateTimeOffset]::Parse('2026-11-15T03:41:30Z')
$application=[ordered]@{state='NOT_QUERIED';errors=@();events=@()}
try{
  $events=@(Get-WinEvent -FilterHashtable @{LogName='Application';Id=@(1000,1001);StartTime=$start.LocalDateTime;EndTime=$end.LocalDateTime} -ErrorAction Stop)
  $application.state='QUERY_COMPLETED'
  $application.events=@($events | Where-Object {$_.Message -match '(?i)node\.exe|35760|0x8bb0'} | ForEach-Object {
    [ordered]@{at=$_.TimeCreated.ToUniversalTime().ToString('o');id=$_.Id;recordId=$_.RecordId;provider=$_.ProviderName;message=$_.Message;xml=$_.ToXml()}
  })
}catch{
  $application.state=if($_.FullyQualifiedErrorId -match 'NoMatchingEventsFound'){'NO_MATCHING_EVENTS'}else{'QUERY_ERROR'}
  $application.errors+=@{id=$_.FullyQualifiedErrorId;message=$_.Exception.Message}
}
$wer=@()
foreach($base in @((Join-Path $env:ProgramData 'Microsoft/Windows/WER/ReportArchive'),(Join-Path $env:ProgramData 'Microsoft/Windows/WER/ReportQueue'),(Join-Path $env:LOCALAPPDATA 'Microsoft/Windows/WER/ReportArchive'),(Join-Path $env:LOCALAPPDATA 'Microsoft/Windows/WER/ReportQueue'))){
  $row=[ordered]@{root=$base;state='NOT_QUERIED';errors=@();candidates=@();cap=20}
  try{
    if(-not(Test-Path -LiteralPath $base)){$row.state='ROOT_UNAVAILABLE';$wer+=$row;continue}
    $dirs=@(Get-ChildItem -LiteralPath $base -Directory -Filter '*node.exe*' -ErrorAction Stop | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 20)
    $row.state='QUERY_COMPLETED'
    foreach($dir in $dirs){
      $file=Join-Path $dir.FullName 'Report.wer'
      $candidate=[ordered]@{directory=$dir.FullName;modifiedUtc=$dir.LastWriteTimeUtc.ToString('o');reportAvailable=$false;selectedLines=@();error=$null}
      if(Test-Path -LiteralPath $file){
        $item=Get-Item -LiteralPath $file -ErrorAction Stop
        $candidate.reportAvailable=$true
        if($item.Length -le 262144){$candidate.selectedLines=@(Get-Content -LiteralPath $file -TotalCount 180 | Where-Object {$_ -match '^(EventType|EventTime|AppName|AppPath|ApplicationIdentity|ReportIdentifier|ProcessId|Sig\[\d+\]\.(Name|Value))='})}
        else{$candidate.error='Report exceeded bounded 256KiB read; metadata only'}
      }
      $row.candidates+=$candidate
    }
  }catch{$row.state='QUERY_ERROR';$row.errors+=@{id=$_.FullyQualifiedErrorId;message=$_.Exception.Message}}
  $wer+=$row
}
$dumps=[ordered]@{root=(Join-Path $env:LOCALAPPDATA 'CrashDumps');state='NOT_QUERIED';files=@();errors=@()}
try{
  if(Test-Path -LiteralPath $dumps.root){$dumps.files=@(Get-ChildItem -LiteralPath $dumps.root -Filter 'node.exe.35760.dmp' -File -ErrorAction Stop | Select-Object FullName,Length,CreationTimeUtc,LastWriteTimeUtc);$dumps.state='QUERY_COMPLETED'}else{$dumps.state='ROOT_UNAVAILABLE'}
}catch{$dumps.state='QUERY_ERROR';$dumps.errors+=@{id=$_.FullyQualifiedErrorId;message=$_.Exception.Message}}
$receipt=[ordered]@{at=[DateTime]::UtcNow.ToString('o');targetPid=35760;targetExe='C:/Program Files/nodejs/node.exe';rangeStart=$start.ToString('o');rangeEnd=$end.ToString('o');application=$application;wer=$wer;dumpMetadata=$dumps;scope='Single bounded read-only OS record lookup after fixed batch. No rerun, settings change, dump creation or cleanup. Candidate metadata requires exact PID/time/exe linkage; missing records do not prove absence of a crash or a cause.'}
[IO.File]::WriteAllText($outFile,($receipt | ConvertTo-Json -Depth 12),[Text.UTF8Encoding]::new($false))
[ordered]@{applicationState=$application.state;nodeEvents=$application.events.Count;werStates=@($wer|ForEach-Object{$_.state});werCandidates=@($wer|ForEach-Object{$_.candidates}).Count;dumpState=$dumps.state;exactPidDumps=$dumps.files.Count;artifact=$outFile}|ConvertTo-Json -Compress
