param([string]$ToolsRoot = "")

# Project-local Android debug APK build. Does not change user or machine environment.
# Pins and the SDL 3.4.20 packaging path are recorded in THIRD_PARTY.md.
$ErrorActionPreference = "Stop"
$native = Split-Path -Parent $PSScriptRoot
$repo = Split-Path -Parent $native
$tools = if ($ToolsRoot) { [IO.Path]::GetFullPath($ToolsRoot) } else { Join-Path $native ".tools" }
if ([IO.Path]::GetFileName($tools) -ne ".tools" -or -not (Test-Path -LiteralPath (Join-Path (Split-Path -Parent $tools) "AGENTS.md"))) { throw "ToolsRoot must be a native workspace .tools directory" }
$cache = Join-Path $tools "cache"
$sdk = Join-Path $tools "android-sdk"
$logDir = Join-Path $repo "artifacts\grok-nov14-spend\android-bootstrap"
New-Item -ItemType Directory -Force -Path $logDir, $cache, $sdk | Out-Null
$log = Join-Path $logDir "bootstrap.log"

function Write-Phase([string]$Message) {
	$line = "{0} {1}" -f (Get-Date -Format o), $Message
	Add-Content -LiteralPath $log -Value $line
	Write-Host $line
}

function Assert-Hash([string]$Path, [string]$Algorithm, [string]$Expected) {
	$have = (Get-FileHash -Algorithm $Algorithm -LiteralPath $Path).Hash.ToLower()
	if ($have -ne $Expected.ToLower()) {
		throw "hash mismatch $Path $Algorithm got $have expected $Expected"
	}
	Write-Phase "hash ok $Algorithm $([IO.Path]::GetFileName($Path))"
}


function Assert-LocalPath([string]$Path) {
  $resolved = [IO.Path]::GetFullPath($Path)
  foreach ($base in @($tools, $logDir)) {
    $prefix = [IO.Path]::GetFullPath($base).TrimEnd('\') + '\'
    if ($resolved.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { return $resolved }
  }
  throw "Path escaped native tools/output: $resolved"
}
function Remove-LocalTree([string]$Path) {
  $Path = Assert-LocalPath $Path
  if (Test-Path -LiteralPath $Path) { Remove-Item -LiteralPath $Path -Recurse -Force }
}
function Move-LocalTree([string]$Source, [string]$Destination) {
  Move-Item -LiteralPath (Assert-LocalPath $Source) -Destination (Assert-LocalPath $Destination)
}
function Get-Pinned([string]$Name, [string]$Url, [string]$Algorithm, [string]$Digest) {
  $destination = Assert-LocalPath (Join-Path $cache $Name)
  if (Test-Path -LiteralPath $destination) {
    if ((Get-FileHash -LiteralPath $destination -Algorithm $Algorithm).Hash -ieq $Digest) { return }
    Remove-Item -LiteralPath $destination -Force
  }
  Write-Phase "download $Name"
  & curl.exe -L --fail --retry 3 --connect-timeout 20 --max-time 1800 -o $destination $Url
  if ($LASTEXITCODE -ne 0) { throw "download failed: $Name" }
  Assert-Hash $destination $Algorithm $Digest
}

function Expand-ArchiveTar([string]$Archive, [string]$Destination) {
	$Destination = Assert-LocalPath $Destination
	New-Item -ItemType Directory -Force -Path $Destination | Out-Null
	& tar.exe -xf $Archive -C $Destination
	if ($LASTEXITCODE -ne 0) {
		throw "extract failed: $Archive"
	}
}


Get-Pinned "android-ndk-r30-windows.zip" "https://dl.google.com/android/repository/android-ndk-r30-windows.zip" "SHA1" "9bf167a1985fa7d4a036186b78f702eab9179408"
Get-Pinned "commandlinetools-win-16111833_latest.zip" "https://dl.google.com/android/repository/commandlinetools-win-16111833_latest.zip" "SHA1" "57d04f2d75eb8e8fffc5000a987e5de4b5a63e9d"
Get-Pinned "OpenJDK17U-jdk_x64_windows_hotspot_17.0.21_9.zip" "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.21%2B9/OpenJDK17U-jdk_x64_windows_hotspot_17.0.21_9.zip" "SHA256" "98518ecf554465057ee5509462631deeee374bc368c12a411d225cd29381f84b"
Get-Pinned "SDL3-3.4.20.tar.gz" "https://github.com/libsdl-org/SDL/releases/download/release-3.4.20/SDL3-3.4.20.tar.gz" "SHA256" "f3bb06f55bed9557227a700af2ea62e49497ebdf58037732a731a5fb3ef8581f"
Get-Pinned "RmlUi-6.3.tar.gz" "https://github.com/mikke89/RmlUi/archive/refs/tags/6.3.tar.gz" "SHA256" "d977298bb6147610e5984d5db85ddf284020d655a8713913f6982074f1dbdede"
Get-Pinned "freetype-2.15.0.tar.gz" "https://download.savannah.gnu.org/releases/freetype/freetype-2.15.0.tar.gz" "SHA256" "9186627467a616d9a9e3e574748ac0c45fa77398e6364edef3041a8ba8d92f64"
if (-not (Test-Path -LiteralPath (Join-Path $tools "cmake/bin/cmake.exe"))) {
  Get-Pinned "cmake-4.5.0-windows-x86_64.zip" "https://github.com/Kitware/CMake/releases/download/v4.5.0/cmake-4.5.0-windows-x86_64.zip" "SHA256" "301b1728317ccd84e984b02e366a8293735bc5ac618757d3d8f58b578f062411"
  $stage = Join-Path $tools "_stage_android_cmake"
  Remove-LocalTree $stage
  Expand-ArchiveTar (Join-Path $cache "cmake-4.5.0-windows-x86_64.zip") $stage
  Move-LocalTree (Join-Path $stage "cmake-4.5.0-windows-x86_64") (Join-Path $tools "cmake")
  Remove-LocalTree $stage
}
if (-not (Test-Path -LiteralPath (Join-Path $tools "ninja/ninja.exe"))) {
  Get-Pinned "ninja-win.zip" "https://github.com/ninja-build/ninja/releases/download/v1.13.2/ninja-win.zip" "SHA256" "07fc8261b42b20e71d1720b39068c2e14ffcee6396b76fb7a795fb460b78dc65"
  Expand-ArchiveTar (Join-Path $cache "ninja-win.zip") (Join-Path $tools "ninja")
}

$ndkZip = Join-Path $cache "android-ndk-r30-windows.zip"
$cmdZip = Join-Path $cache "commandlinetools-win-16111833_latest.zip"
$jdkZip = Join-Path $cache "OpenJDK17U-jdk_x64_windows_hotspot_17.0.21_9.zip"
Assert-Hash $ndkZip "SHA1" "9bf167a1985fa7d4a036186b78f702eab9179408"
Assert-Hash $cmdZip "SHA1" "57d04f2d75eb8e8fffc5000a987e5de4b5a63e9d"

$ndkRoot = Join-Path $sdk "ndk\30.0.16248370"
$toolchain = Join-Path $ndkRoot "build\cmake\android.toolchain.cmake"
if (-not (Test-Path $toolchain)) {
	Write-Phase "extract ndk"
	$stage = Join-Path $tools "_stage_ndk"
	if (Test-Path $stage) { Remove-LocalTree $stage }
	Expand-ArchiveTar $ndkZip $stage
	$unpacked = Get-ChildItem -LiteralPath $stage -Directory | Select-Object -First 1
	$revision = "30.0.16248370"
	$props = Join-Path $unpacked.FullName "source.properties"
	$revLine = Select-String -LiteralPath $props -Pattern "Pkg\.Revision\s*=\s*(\S+)" | Select-Object -First 1
	if (-not $revLine) { throw "NDK source.properties has no Pkg.Revision" }
	$revision = $revLine.Matches[0].Groups[1].Value
	if ($revision -ne "30.0.16248370") {
		throw "NDK revision $revision does not match the r30 LTS pin 30.0.16248370"
	}
	$destParent = Split-Path -Parent $ndkRoot
	New-Item -ItemType Directory -Force -Path $destParent | Out-Null
	if (Test-Path $ndkRoot) { Remove-LocalTree $ndkRoot }
	Move-LocalTree $unpacked.FullName $ndkRoot
	Remove-LocalTree $stage
}
if (-not (Test-Path $toolchain)) { throw "missing NDK toolchain $toolchain" }

$sdkmanager = Join-Path $sdk "cmdline-tools\latest\bin\sdkmanager.bat"
if (-not (Test-Path $sdkmanager)) {
	Write-Phase "extract commandlinetools"
	$stage = Join-Path $tools "_stage_cmdline"
	if (Test-Path $stage) { Remove-LocalTree $stage }
	Expand-ArchiveTar $cmdZip $stage
	$latest = Join-Path $sdk "cmdline-tools\latest"
	New-Item -ItemType Directory -Force -Path (Split-Path -Parent $latest) | Out-Null
	if (Test-Path $latest) { Remove-LocalTree $latest }
	Move-LocalTree (Join-Path $stage "cmdline-tools") $latest
	Remove-LocalTree $stage
}

$jdkHome = Join-Path $tools "jdk-17.0.21+9"
if (-not (Test-Path (Join-Path $jdkHome "bin\java.exe"))) {
	Write-Phase "extract jdk"
	$stage = Join-Path $tools "_stage_jdk"
	if (Test-Path $stage) { Remove-LocalTree $stage }
	Expand-ArchiveTar $jdkZip $stage
	$unpacked = Get-ChildItem -LiteralPath $stage -Directory | Select-Object -First 1
	if (Test-Path $jdkHome) { Remove-LocalTree $jdkHome }
	Move-LocalTree $unpacked.FullName $jdkHome
	Remove-LocalTree $stage
}

$env:JAVA_HOME = $jdkHome
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:GRADLE_USER_HOME = Join-Path $tools "gradle-user"
$env:PATH = "$(Join-Path $jdkHome 'bin');$(Join-Path $tools 'cmake\bin');$(Join-Path $tools 'ninja');$env:PATH"
$previousPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$javaVersion = & (Join-Path $jdkHome "bin\java.exe") -version 2>&1 | Select-Object -First 1
$ErrorActionPreference = $previousPreference
Write-Phase "java $javaVersion"

$platform = Join-Path $sdk "platforms\android-35\android.jar"
$buildTools = Join-Path $sdk "build-tools\35.0.0\aapt.exe"
if (-not (Test-Path $platform) -or -not (Test-Path (Join-Path $sdk "build-tools\35.0.0"))) {
	Write-Phase "sdkmanager packages"
	$licenseLog = Join-Path $logDir "sdkmanager-licenses.log"
	$yesFile = Join-Path $logDir "sdkmanager-yes.txt"
	Set-Content -LiteralPath $yesFile -Value ((1..80 | ForEach-Object { "y" }) -join "`r`n") -Encoding Ascii
	cmd.exe /c "`"$sdkmanager`" --sdk_root=`"$sdk`" --licenses < `"$yesFile`" > `"$licenseLog`" 2>&1"
	$installLog = Join-Path $logDir "sdkmanager-install.log"
	cmd.exe /c "`"$sdkmanager`" --sdk_root=`"$sdk`" `"platforms;android-35`" `"build-tools;35.0.0`" > `"$installLog`" 2>&1"
	if ($LASTEXITCODE -ne 0) {
		Get-Content -LiteralPath $installLog -Tail 40
		throw "sdkmanager install failed: $LASTEXITCODE"
	}
}
if (-not (Test-Path $platform)) { throw "missing $platform" }

$sdlTar = Join-Path $cache "SDL3-3.4.20.tar.gz"
$rmlTar = Join-Path $cache "RmlUi-6.3.tar.gz"
$sdlRoot = Join-Path $tools "src\SDL3-3.4.20"
$sdlJava = Join-Path $sdlRoot "android-project\app\src\main\java\org\libsdl\app\SDLActivity.java"
if (-not (Test-Path $sdlJava)) {
	Write-Phase "extract SDL android-project"
	New-Item -ItemType Directory -Force -Path (Join-Path $tools "src") | Out-Null
	& tar.exe -xzf $sdlTar -C (Join-Path $tools "src") "SDL3-3.4.20/android-project"
	if ($LASTEXITCODE -ne 0) { throw "SDL android-project extract failed" }
}
$android = Join-Path $native "android"
$wrapper = Join-Path $android "gradle\wrapper"
New-Item -ItemType Directory -Force -Path $wrapper | Out-Null
if (-not (Test-Path -LiteralPath (Join-Path $android "gradlew.bat"))) { Copy-Item -LiteralPath (Join-Path $sdlRoot "android-project\gradlew.bat") -Destination (Join-Path $android "gradlew.bat") -Force }
if (-not (Test-Path -LiteralPath (Join-Path $wrapper "gradle-wrapper.jar"))) { Copy-Item -LiteralPath (Join-Path $sdlRoot "android-project\gradle\wrapper\gradle-wrapper.jar") -Destination (Join-Path $wrapper "gradle-wrapper.jar") -Force }
if (-not (Test-Path -LiteralPath (Join-Path $wrapper "gradle-wrapper.properties"))) { Copy-Item -LiteralPath (Join-Path $sdlRoot "android-project\gradle\wrapper\gradle-wrapper.properties") -Destination (Join-Path $wrapper "gradle-wrapper.properties") -Force }
Get-ChildItem -LiteralPath (Join-Path $sdlRoot "android-project\app\src\main\res") -Directory -Filter "mipmap-*" | ForEach-Object {
	$dest = Join-Path $android "app\src\main\res\$($_.Name)"
	New-Item -ItemType Directory -Force -Path $dest | Out-Null
	Copy-Item -Path (Join-Path $_.FullName "*") -Destination $dest -Force
}

$assetDir = Join-Path $android "app\src\main\assets\ui"
New-Item -ItemType Directory -Force -Path $assetDir | Out-Null
Copy-Item -LiteralPath (Join-Path $native "assets\ui\demo.rml") -Destination (Join-Path $assetDir "demo.rml") -Force
$fontStage = Join-Path $tools "_stage_font"
if (Test-Path $fontStage) { Remove-LocalTree $fontStage }
New-Item -ItemType Directory -Force -Path $fontStage | Out-Null
& tar.exe -xzf $rmlTar -C $fontStage "RmlUi-6.3/Samples/assets/LatoLatin-Regular.ttf" "RmlUi-6.3/Samples/assets/LICENSE.txt"
if ($LASTEXITCODE -ne 0) { throw "font extract failed" }
Copy-Item -LiteralPath (Join-Path $fontStage "RmlUi-6.3\Samples\assets\LatoLatin-Regular.ttf") -Destination (Join-Path $assetDir "LatoLatin-Regular.ttf") -Force
Copy-Item -LiteralPath (Join-Path $fontStage "RmlUi-6.3\Samples\assets\LICENSE.txt") -Destination (Join-Path $assetDir "FONT-LICENSE.txt") -Force
Remove-LocalTree $fontStage
foreach ($name in @("demo.rml", "LatoLatin-Regular.ttf", "FONT-LICENSE.txt")) {
	$item = Get-Item -LiteralPath (Join-Path $assetDir $name)
	if ($item.Length -lt 32) { throw "asset too small: $($item.FullName)" }
}

function ConvertTo-SdkProperty([string]$Path) {
	$value = ([IO.Path]::GetFullPath($Path)).Replace("\", "\\")
	return [regex]::Replace($value, '[^\x20-\x7e]', { param($match) '\u{0:x4}' -f [int][char]$match.Value })
}
$localProps = @(
	"sdk.dir=$(ConvertTo-SdkProperty $sdk)"
	"cmake.dir=$(ConvertTo-SdkProperty (Join-Path $tools 'cmake'))"
	"waffle.tools.dir=$(ConvertTo-SdkProperty $tools)"
) -join "`r`n"
Set-Content -LiteralPath (Join-Path $android "local.properties") -Value $localProps -Encoding Ascii

$keystore = Join-Path $tools "android-debug.keystore"
if (-not (Test-Path $keystore)) {
	Write-Phase "create project-local debug keystore"
	& (Join-Path $jdkHome "bin\keytool.exe") -genkeypair -keystore $keystore -storepass android -alias androiddebugkey -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=waffle native debug,O=project-local,C=US"
	if ($LASTEXITCODE -ne 0) { throw "keytool failed" }
}

Write-Phase "gradle assembleDebug"
$gradleLog = Join-Path $logDir "gradle-assembleDebug.log"
Push-Location $android
try {
	$previousPreference = $ErrorActionPreference
	$ErrorActionPreference = "Continue"
	& .\gradlew.bat :app:assembleDebug --no-daemon --console=plain > $gradleLog 2>&1
	$gradleExit = $LASTEXITCODE
	$ErrorActionPreference = $previousPreference
} finally {
	Pop-Location
}
if ($gradleExit -ne 0) {
	Write-Phase "FAILED gradle exit $gradleExit"
	Get-Content -LiteralPath $gradleLog -Tail 60
	throw "gradle assembleDebug failed: $gradleExit"
}
Write-Phase "gradle assembleDebug exit 0"

$apk = Join-Path $android "app\build\outputs\apk\debug\app-debug.apk"
if (-not (Test-Path $apk)) { throw "missing $apk" }
$apkHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $apk).Hash.ToLower()
Copy-Item -LiteralPath $apk -Destination (Join-Path $logDir "app-debug.apk") -Force
Write-Phase "apk $apk"
Write-Phase "apk sha256 $apkHash"

$inspectDir = Join-Path $logDir "apk-contents"
if (Test-Path $inspectDir) { Remove-LocalTree $inspectDir }
New-Item -ItemType Directory -Force -Path $inspectDir | Out-Null
& tar.exe -xf $apk -C $inspectDir
if ($LASTEXITCODE -ne 0) { throw "apk extract failed" }
$inspect = Join-Path $logDir "apk-inspect.txt"
$lines = New-Object System.Collections.Generic.List[string]
$lines.Add("apk=$apk")
$lines.Add("sha256=$apkHash")
$lines.Add("bytes=$((Get-Item -LiteralPath $apk).Length)")
$lines.Add("debug-signed=project-local native/.tools/android-debug.keystore alias androiddebugkey")
$lines.Add("device-run=not performed")
Get-ChildItem -LiteralPath $inspectDir -Recurse -File | ForEach-Object {
	$rel = $_.FullName.Substring($inspectDir.Length).TrimStart("\")
	if ($rel -match '^(lib\\|assets\\|AndroidManifest)' ) {
		$lines.Add(("file {0} {1}" -f $rel, $_.Length))
	}
}
$readelf = Join-Path $ndkRoot "toolchains\llvm\prebuilt\windows-x86_64\bin\llvm-readelf.exe"
$nm = Join-Path $ndkRoot "toolchains\llvm\prebuilt\windows-x86_64\bin\llvm-nm.exe"
foreach ($soName in @("libmain.so", "libSDL3.so")) {
	$so = Join-Path $inspectDir "lib\arm64-v8a\$soName"
	if (-not (Test-Path $so)) { throw "APK missing lib/arm64-v8a/$soName" }
	$lines.Add("---- $soName header ----")
	$lines.Add((& $readelf -h $so | Select-String -Pattern "Machine:|Class:|Type:" | ForEach-Object { $_.Line.Trim() }) -join "`n")
	$lines.Add("---- $soName needed ----")
	$lines.Add((& $readelf -d $so | Select-String -Pattern "NEEDED" | ForEach-Object { $_.Line.Trim() }) -join "`n")
}
$mainSo = Join-Path $inspectDir "lib\arm64-v8a\libmain.so"
$sdlMain = & $nm -D --defined-only $mainSo | Select-String -Pattern "SDL_main"
$lines.Add("---- libmain SDL_main ----")
if ($sdlMain) { $lines.Add(($sdlMain | ForEach-Object { $_.Line.Trim() }) -join "`n") } else { $lines.Add("MISSING SDL_main") }
$analyzer = Join-Path $sdk "cmdline-tools\latest\bin\apkanalyzer.bat"
if (Test-Path $analyzer) {
	$lines.Add("---- manifest ----")
	$lines.Add((& $analyzer manifest print $apk | Out-String))
}
$required = @(
	(Join-Path $inspectDir "lib\arm64-v8a\libmain.so"),
	(Join-Path $inspectDir "lib\arm64-v8a\libSDL3.so"),
	(Join-Path $inspectDir "assets\ui\demo.rml"),
	(Join-Path $inspectDir "assets\ui\LatoLatin-Regular.ttf"),
	(Join-Path $inspectDir "assets\ui\FONT-LICENSE.txt"),
	(Join-Path $inspectDir "AndroidManifest.xml")
)
foreach ($path in $required) {
	if (-not (Test-Path $path)) { throw "validation missing $path" }
}
if (-not $sdlMain) { throw "libmain.so does not export SDL_main" }
Set-Content -LiteralPath $inspect -Value ($lines -join "`r`n") -Encoding UTF8
Write-Phase "inspect $inspect"
Write-Phase "android bootstrap finished"
