[CmdletBinding()]
param(
    [string]$Adb,
    [string]$Serial = $env:ANDROID_SERIAL,
    [string]$OutDir,
    [string]$LateFixture
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
if (!$OutDir) { $OutDir = Join-Path $repo 'artifacts/n04b/android' }
$generateLateFixture = !$LateFixture
if ($generateLateFixture) {
    $LateFixture = Join-Path $repo 'artifacts/native-reference/traces/seed-2026-late/state-3200.json'
}
if (!$Adb) {
    $sdkAdb = Join-Path $repo 'native/.tools/android-sdk/platform-tools/adb.exe'
    if (Test-Path -LiteralPath $sdkAdb) { $Adb = $sdkAdb }
    else { $Adb = (Get-Command adb -ErrorAction Stop).Source }
}

function Invoke-Adb {
    & $Adb @deviceArgs @args
    if ($LASTEXITCODE -ne 0) { throw "adb failed ($LASTEXITCODE): $args" }
}

$deviceArgs = @()
$devices = @(Invoke-Adb devices -l)
$online = @($devices | ForEach-Object {
    if ($_ -match '^(\S+)\s+device(?:\s|$)') { $Matches[1] }
})
if (!$online.Count) {
    $devices | Write-Host
    Write-Host 'UNRUN: no online adb device.'
    return
}
if (!$Serial -and $online.Count -eq 1) { $Serial = $online[0] }
if (!$Serial -or $Serial -notin $online) {
    throw 'Select an online device with -Serial or ANDROID_SERIAL.'
}
$deviceArgs = @('-s', $Serial)
$abi = (Invoke-Adb shell getprop ro.product.cpu.abi).Trim()
$api = [int](Invoke-Adb shell getprop ro.build.version.sdk)
if ($abi -ne 'arm64-v8a' -or $api -lt 31) { throw "Expected an API 31+ arm64 device, got API $api / $abi." }

$binary = Join-Path $repo 'native/build/android/src/sim/waffle_parity'
if (!(Test-Path -LiteralPath $binary)) {
    throw 'Build waffle_parity using cmake --build --preset android --target waffle_parity in native first.'
}
if ($generateLateFixture -and !(Test-Path -LiteralPath $LateFixture)) {
    & node (Join-Path $repo 'native/reference/trace.mjs') seed-2026-late
    if ($LASTEXITCODE -ne 0) { throw 'Failed to capture seed-2026-late.' }
}
if (!(Test-Path -LiteralPath $LateFixture)) { throw "Missing seed-2026-late fixture: $LateFixture" }
New-Item -ItemType Directory -Force $OutDir | Out-Null
$remote = "/data/local/tmp/waffle-n04b-$([guid]::NewGuid().ToString('N'))"
$reference = Join-Path $repo 'native/reference'
$expected = Join-Path $repo 'native/src/tests/vectors/native-run-cross-compiler.tsv'

# Android taskset takes a hexadecimal mask. Probe usable cores because the
# adb shell may have a narrower cpuset than the hardware lists in sysfs.
$selectCore = @'
best_cpu=
best_mask=
best_score=0
for metric in cpu_capacity cpufreq/cpuinfo_max_freq; do
    for dir in /sys/devices/system/cpu/cpu[0-9]*; do
        cpu=${dir##*cpu}
        [ "$cpu" -lt 32 ] || continue
        score=$(cat "$dir/$metric" 2>/dev/null)
        [ "${score:-0}" -gt "$best_score" ] || continue
        mask=$(printf '0x%x' "$((1 << cpu))")
        taskset "$mask" true 2>/dev/null || continue
        best_score=$score
        best_cpu=$cpu
        best_mask=$mask
    done
    [ -z "$best_mask" ] || break
done
printf '%s %s\n' "$best_cpu" "$best_mask"
'@

Invoke-Adb shell "mkdir -p $remote/topology"
try {
    Invoke-Adb push $binary "$remote/waffle_parity"
    Invoke-Adb shell "chmod 755 $remote/waffle_parity"
    Get-ChildItem (Join-Path $reference 'topology/*.json') | ForEach-Object {
        Invoke-Adb push $_.FullName "$remote/topology/"
    }
    Invoke-Adb push (Join-Path $reference 'fixtures/seed-1/state-0.json') "$remote/seed-1.json"
    Invoke-Adb push $LateFixture "$remote/seed-2026-late.json"
    Invoke-Adb push $expected "$remote/expected.tsv"

    $probeFile = [IO.Path]::GetTempFileName()
    try {
        [IO.File]::WriteAllText($probeFile, ($selectCore -replace "`r", '') + "`n")
        Invoke-Adb push $probeFile "$remote/select-core.sh"
    }
    finally {
        Remove-Item -LiteralPath $probeFile
    }
    $selection = ("$(Invoke-Adb shell "sh $remote/select-core.sh")").Trim()
    $runner = './waffle_parity'
    $cpu = $null
    if ($selection -match '^(\d+) (0x[0-9a-f]+)$') {
        $cpu = [int]$Matches[1]
        $runner = "taskset $($Matches[2]) $runner"
    }
    $environment = [ordered]@{
        model = (Invoke-Adb shell getprop ro.product.model).Trim()
        abi = $abi
        api = $api
        affinityCpu = $cpu
        affinityCommand = $runner
    }
    $environment | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $OutDir 'device.json')
    Write-Host "Device $($environment.model), command: $runner"

    Invoke-Adb shell "cd $remote && $runner run --from seed-1.json --topology-dir topology --seconds 2048 --hashes cross-compiler.tsv --expect expected.tsv --report cross-compiler.json"
    foreach ($file in 'cross-compiler.tsv', 'cross-compiler.json') {
        Invoke-Adb pull "$remote/$file" (Join-Path $OutDir $file)
    }
    $windowsHashes = [IO.File]::ReadAllText($expected).Replace("`r`n", "`n")
    $androidHashes = Get-Content -Raw -LiteralPath (Join-Path $OutDir 'cross-compiler.tsv')
    if ($androidHashes -cne $windowsHashes) {
        throw 'The Android 2,048-second hash stream differs from the Windows reference.'
    }
    foreach ($fixture in 'seed-1', 'seed-2026-late') {
        foreach ($suffix in '', '-long') {
            $case = "$fixture$suffix"
            $variant = if ($suffix) { '--longevity' } else { '' }
            # Reports must not reuse an input fixture name: seed-1.json is also the input.
            Invoke-Adb shell "cd $remote && $runner timegraph --from $fixture.json --topology-dir topology --seconds 32000 --repeats 3 --samples 256 $variant --report report-$case.json"
            Invoke-Adb pull "$remote/report-$case.json" (Join-Path $OutDir "$case.json")
        }
    }
}
finally {
    Invoke-Adb shell "rm -r $remote"
}
