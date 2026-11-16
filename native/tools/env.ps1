# Dot-source from a PowerShell session before the native build commands.
# Session-only PATH. Does not write user or machine environment variables.
$tools = Join-Path (Split-Path -Parent $PSScriptRoot) ".tools"
$cmakeBin = Join-Path $tools "cmake\bin"
$ninjaDir = Join-Path $tools "ninja"
if (-not (Test-Path (Join-Path $cmakeBin "cmake.exe"))) {
	throw "Missing native/.tools. Run native/tools/bootstrap-windows.ps1 first."
}

$vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
$msvcRoot = ""
if (Test-Path $vswhere) {
	$msvcRoot = & $vswhere -latest -products * -property installationPath
}
$vcvars = Join-Path $msvcRoot "VC\Auxiliary\Build\vcvars64.bat"
if (Test-Path $vcvars) {
	$env:PATH = "$(Split-Path $vswhere);$env:PATH"
	$captured = [IO.Path]::GetTempFileName()
	try {
		& cmd.exe /c "`"$vcvars`" >nul && set > `"$captured`""
		if ($LASTEXITCODE -ne 0) { throw "vcvars64 failed: $vcvars" }
		Get-Content -LiteralPath $captured | ForEach-Object {
			$pair = $_.Split("=", 2)
			if ($pair.Length -eq 2 -and $pair[0]) {
				Set-Item -Path "Env:$($pair[0])" -Value $pair[1]
			}
		}
	} finally { Remove-Item -LiteralPath $captured -Force }
	$env:PATH = "$cmakeBin;$ninjaDir;$env:PATH"
	Write-Host "native tools on PATH; MSVC from $msvcRoot"
} elseif (Test-Path (Join-Path $tools "llvm-mingw\bin\clang++.exe")) {
	$env:WAFFLE_TOOLCHAIN = "llvm-mingw"
	$env:PATH = "$cmakeBin;$ninjaDir;$(Join-Path $tools 'llvm-mingw\bin');$env:PATH"
	$env:WAFFLE_NATIVE_TOOLS = (Resolve-Path $tools).Path
	Write-Host "native tools on PATH; llvm-mingw fallback"
} else {
	throw "No MSVC vcvars64.bat and no native/.tools/llvm-mingw. Re-run bootstrap on a machine without Visual Studio."
}
