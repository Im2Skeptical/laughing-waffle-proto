# Unpacks a project-local Windows toolchain into native/.tools.
# Does not change machine-wide PATH, installers, or environment variables.
$ErrorActionPreference = "Stop"
$native = Split-Path -Parent $PSScriptRoot
$cache = Join-Path $native ".tools\cache"
$tools = Join-Path $native ".tools"
New-Item -ItemType Directory -Force -Path $cache | Out-Null

function Assert-ToolsPath([string]$Path) {
	$root = [IO.Path]::GetFullPath($tools).TrimEnd('\') + '\'
	$resolved = [IO.Path]::GetFullPath($Path)
	if (-not $resolved.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) {
		throw "Tool path escaped native/.tools: $resolved"
	}
	return $resolved
}

function Save-Pinned([string]$Name, [string]$Url, [string]$Sha256) {
	$dest = Assert-ToolsPath (Join-Path $cache $Name)
	if (Test-Path $dest) {
		$have = (Get-FileHash -Algorithm SHA256 -Path $dest).Hash.ToLower()
		if ($have -eq $Sha256) {
			Write-Host "cached $Name"
			return
		}
		Write-Host "replacing $Name"
		Remove-Item -LiteralPath $dest -Force
	}
	Write-Host "download $Name"
	& curl.exe -L --fail --retry 3 --retry-delay 2 -o $dest $Url
	if ($LASTEXITCODE -ne 0) {
		throw "download failed: $Url"
	}
	$have = (Get-FileHash -Algorithm SHA256 -Path $dest).Hash.ToLower()
	if ($have -ne $Sha256) {
		throw "hash mismatch for ${Name}: $have"
	}
}

Save-Pinned "cmake-4.5.0-windows-x86_64.zip" `
	"https://github.com/Kitware/CMake/releases/download/v4.5.0/cmake-4.5.0-windows-x86_64.zip" `
	"301b1728317ccd84e984b02e366a8293735bc5ac618757d3d8f58b578f062411"
Save-Pinned "ninja-win.zip" `
	"https://github.com/ninja-build/ninja/releases/download/v1.13.2/ninja-win.zip" `
	"07fc8261b42b20e71d1720b39068c2e14ffcee6396b76fb7a795fb460b78dc65"
function Expand-Zip([string]$ZipName, [string]$Destination) {
	$Destination = Assert-ToolsPath $Destination
	if (Test-Path $Destination) {
		Remove-Item -LiteralPath $Destination -Recurse -Force
	}
	New-Item -ItemType Directory -Force -Path $Destination | Out-Null
	& tar.exe -xf (Join-Path $cache $ZipName) -C $Destination
	if ($LASTEXITCODE -ne 0) {
		throw "extract failed: $ZipName"
	}
}

$cmakeExe = Join-Path $tools "cmake\bin\cmake.exe"
if (-not (Test-Path $cmakeExe)) {
	$stage = Join-Path $tools "_stage_cmake"
	Expand-Zip "cmake-4.5.0-windows-x86_64.zip" $stage
	$unpacked = Get-ChildItem -Directory $stage | Select-Object -First 1
	Move-Item -LiteralPath (Assert-ToolsPath $unpacked.FullName) -Destination (Assert-ToolsPath (Join-Path $tools "cmake"))
	Remove-Item -LiteralPath (Assert-ToolsPath $stage) -Recurse -Force
}

$ninjaExe = Join-Path $tools "ninja\ninja.exe"
if (-not (Test-Path $ninjaExe)) {
	Expand-Zip "ninja-win.zip" (Join-Path $tools "ninja")
}

$vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
$msvcRoot = ""
if (Test-Path $vswhere) {
	$msvcRoot = & $vswhere -latest -products * -property installationPath
}
$vcvars = Join-Path $msvcRoot "VC\Auxiliary\Build\vcvars64.bat"
if (Test-Path $vcvars) {
	Write-Host "MSVC already installed at $msvcRoot"
	Write-Host "vcvars: $vcvars"
} else {
	Save-Pinned "llvm-mingw-20261104-ucrt-x86_64.zip" `
		"https://github.com/mstorsjo/llvm-mingw/releases/download/20261104/llvm-mingw-20261104-ucrt-x86_64.zip" `
		"552191b5754c49a5a20723276a6fc56541ea1922c4c50b7b669022333fc1b40f"
	$clangExe = Join-Path $tools "llvm-mingw\bin\clang++.exe"
	if (-not (Test-Path $clangExe)) {
		$stage = Join-Path $tools "_stage_llvm"
		Expand-Zip "llvm-mingw-20261104-ucrt-x86_64.zip" $stage
		$unpacked = Get-ChildItem -Directory $stage | Select-Object -First 1
		Move-Item -LiteralPath (Assert-ToolsPath $unpacked.FullName) -Destination (Assert-ToolsPath (Join-Path $tools "llvm-mingw"))
		Remove-Item -LiteralPath (Assert-ToolsPath $stage) -Recurse -Force
	}
	Write-Host "clang: $((& (Join-Path $tools 'llvm-mingw\bin\clang++.exe') --version | Select-Object -First 1))"
}

Write-Host "toolchain ready"
Write-Host "cmake: $((& (Join-Path $tools 'cmake\bin\cmake.exe') --version | Select-Object -First 1))"
Write-Host "ninja: $((& (Join-Path $tools 'ninja\ninja.exe') --version))"
