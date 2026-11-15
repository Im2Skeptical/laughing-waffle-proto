param(
  [Parameter(Mandatory=$true)][string]$ConfigFile,
  [Parameter(Mandatory=$true)][string]$ConfigFileSha256,
  [Parameter(Mandatory=$true)][string]$ConfigFingerprint,
  [Parameter(Mandatory=$true)][string]$ObserverLibrary,
  [Parameter(Mandatory=$true)][string]$ObserverSha256,
  [Parameter(Mandatory=$true)][string]$AdmissionFile,
  [Parameter(Mandatory=$true)][string]$AdmissionSha256
)
# SOURCE ONLY until complete independent review. Never dot-source or invoke
# this entry from build/pure controls. Compile recipes parse syntax only.
$ErrorActionPreference='Stop'
$taskExit=2
try {
  if($ObserverSha256 -cnotmatch '^[0-9a-f]{64}$'){throw 'Observer SHA256 required'}
  $taskLibrary=[IO.Path]::GetFullPath($ObserverLibrary)
  if($taskLibrary -cne $ObserverLibrary -or $taskLibrary.Length -gt 1024){throw 'Canonical observer path required'}
  $taskParent=$taskLibrary
  while($taskParent){if(([IO.File]::GetAttributes($taskParent) -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Observer reparse path unsupported'};$taskParent=[IO.Path]::GetDirectoryName($taskParent)}
  $taskStream=[IO.File]::Open($taskLibrary,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
  try {
    if($taskStream.Length -le 0 -or $taskStream.Length -gt 268435456){throw 'Observer byte cap'}
    $taskHash=[Security.Cryptography.SHA256]::Create()
    try{$taskActual=[BitConverter]::ToString($taskHash.ComputeHash($taskStream)).Replace('-','').ToLowerInvariant()}finally{$taskHash.Dispose()}
    if($taskActual -cne $ObserverSha256){throw 'Observer bytes changed before load'}
    [Reflection.Assembly]::LoadFile($taskLibrary)|Out-Null
  }finally{$taskStream.Dispose()}
  [NativeTrialLifetime.TrialHostEntry]::ExecuteAndExit($ConfigFile,$ConfigFileSha256,$ConfigFingerprint,$ObserverLibrary,$ObserverSha256,$AdmissionFile,$AdmissionSha256)
}finally{[Environment]::Exit($taskExit)}
