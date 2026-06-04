[CmdletBinding()]
param(
  [string]$Model = $(if ($env:TENLIST_OLLAMA_MODEL) { $env:TENLIST_OLLAMA_MODEL } elseif ($env:OLLAMA_MODEL) { $env:OLLAMA_MODEL } else { "gemma4" }),
  [string]$Origins = $(if ($env:TENLIST_OLLAMA_ORIGINS) { $env:TENLIST_OLLAMA_ORIGINS } elseif ($env:OLLAMA_ORIGINS) { $env:OLLAMA_ORIGINS } else { "https://tenlistbible.com,https://www.tenlistbible.com" }),
  [string]$DownloadUrl = $(if ($env:OLLAMA_DOWNLOAD_URL) { $env:OLLAMA_DOWNLOAD_URL } else { "https://ollama.com/download/OllamaSetup.exe" }),
  [string]$ApiUrl = $(if ($env:OLLAMA_API_URL) { $env:OLLAMA_API_URL } else { "http://localhost:11434" }),
  [int]$MinimumFreeGB = $(if ($env:OLLAMA_MINIMUM_FREE_GB) { [int]$env:OLLAMA_MINIMUM_FREE_GB } else { 20 }),
  [switch]$SkipModelPull,
  # Default to non-interactive (auto-confirm all prompts). Pass -Yes:$false
  # to restore the original interactive behavior.
  [switch]$Yes = $true,
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:OllamaCommand = $null
$script:OllamaApp = $null

function Write-Section {
  param([string]$Message)
  Write-Host ""
  Write-Host ">>> $Message"
}

function Write-Note {
  param([string]$Message)
  Write-Host $Message
}

function Write-WarningLine {
  param([string]$Message)
  Write-Warning $Message
}

function Confirm-Step {
  param([string]$Message)

  if ($Yes -or $DryRun) {
    return
  }

  $answer = Read-Host "$Message [y/N]"
  if ($answer -notin @("y", "Y", "yes", "YES", "Yes")) {
    throw "Canceled"
  }
}

function Invoke-Step {
  param(
    [string]$Description,
    [scriptblock]$Action
  )

  if ($DryRun) {
    Write-Host "+ $Description"
    return
  }

  & $Action
}

function Test-WindowsVersion {
  $isWindowsPlatform = [Environment]::OSVersion.Platform -eq "Win32NT"
  if ($PSVersionTable.PSEdition -eq "Core") {
    $isWindowsPlatform = $IsWindows
  }

  if (-not $isWindowsPlatform) {
    throw "This installer only supports Windows."
  }

  $version = [Environment]::OSVersion.Version
  if ($version.Major -lt 10) {
    throw "Ollama requires Windows 10 22H2 or newer. Current version: $version"
  }

  if ($version.Major -eq 10 -and $version.Build -lt 19045) {
    throw "Ollama requires Windows 10 22H2 or newer. Current build: $($version.Build)"
  }
}

function Find-Ollama {
  $command = Get-Command ollama -ErrorAction SilentlyContinue
  if ($command) {
    $script:OllamaCommand = $command.Source
  }

  $localPrograms = Join-Path $env:LOCALAPPDATA "Programs\Ollama"
  $candidateCommand = Join-Path $localPrograms "ollama.exe"
  $candidateApp = Join-Path $localPrograms "Ollama.exe"

  if (-not $script:OllamaCommand -and (Test-Path $candidateCommand)) {
    $script:OllamaCommand = $candidateCommand
  }

  if (Test-Path $candidateApp) {
    $script:OllamaApp = $candidateApp
  }
}

function Install-Ollama {
  Write-Section "Ollama was not found"
  Write-Note "This will download Ollama from:"
  Write-Note $DownloadUrl
  Confirm-Step "Install Ollama now?"

  $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("ollama-windows-installer-" + [guid]::NewGuid().ToString("N"))
  $installerPath = Join-Path $tempDir "OllamaSetup.exe"

  Invoke-Step "Create temporary directory $tempDir" {
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
  }

  try {
    Write-Section "Downloading Ollama"
    Invoke-Step "Download $DownloadUrl to $installerPath" {
      Invoke-WebRequest -Uri $DownloadUrl -OutFile $installerPath
    }

    Write-Section "Installing Ollama"
    Invoke-Step "Run OllamaSetup.exe" {
      $arguments = if ($Yes) { @("/SILENT", "/NORESTART") } else { @() }
      $process = Start-Process -FilePath $installerPath -ArgumentList $arguments -Wait -PassThru
      if ($process.ExitCode -ne 0) {
        throw "Ollama installer exited with code $($process.ExitCode)"
      }
    }
  } finally {
    if (-not $DryRun -and (Test-Path $tempDir)) {
      Remove-Item -Path $tempDir -Recurse -Force
    }
  }

  Find-Ollama
}

function Set-OllamaEnvironment {
  Write-Section "Configuring Ollama browser access"
  Write-Note "Allowed origins: $Origins"

  Invoke-Step "Set user environment variable OLLAMA_ORIGINS=$Origins" {
    [Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", $Origins, "User")
    $env:OLLAMA_ORIGINS = $Origins
  }

  if ($env:TENLIST_OLLAMA_CONTEXT_LENGTH) {
    Invoke-Step "Set user environment variable OLLAMA_CONTEXT_LENGTH=$($env:TENLIST_OLLAMA_CONTEXT_LENGTH)" {
      [Environment]::SetEnvironmentVariable("OLLAMA_CONTEXT_LENGTH", $env:TENLIST_OLLAMA_CONTEXT_LENGTH, "User")
      $env:OLLAMA_CONTEXT_LENGTH = $env:TENLIST_OLLAMA_CONTEXT_LENGTH
    }
  }
}

function Restart-OllamaIfRunning {
  $processes = Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $_.ProcessName -in @("Ollama", "ollama")
  }

  if (-not $processes) {
    return
  }

  Write-Section "Restarting Ollama so the new browser access setting takes effect"
  Confirm-Step "Quit the running Ollama process and restart it?"

  Invoke-Step "Stop running Ollama processes" {
    $processes | Stop-Process -Force
    Start-Sleep -Seconds 2
  }
}

function Wait-ForOllama {
  param([int]$Attempts)

  for ($i = 0; $i -lt $Attempts; $i++) {
    try {
      Invoke-WebRequest -Uri "$ApiUrl/api/tags" -UseBasicParsing -TimeoutSec 2 | Out-Null
      return $true
    } catch {
      Start-Sleep -Seconds 1
    }
  }

  return $false
}

function Start-Ollama {
  Write-Section "Starting Ollama"

  if ($DryRun) {
    Write-Host "+ Start Ollama app or ollama serve"
    return
  }

  if ($script:OllamaApp) {
    Start-Process -FilePath $script:OllamaApp | Out-Null
  }

  if (Wait-ForOllama -Attempts 25) {
    return
  }

  Write-WarningLine "The Ollama app did not start the API quickly. Starting 'ollama serve' in the background."
  $logDir = Join-Path $env:LOCALAPPDATA "Ollama"
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  $stdout = Join-Path $logDir "tenlist-ollama-serve.out.log"
  $stderr = Join-Path $logDir "tenlist-ollama-serve.err.log"
  Start-Process -FilePath $script:OllamaCommand -ArgumentList @("serve") -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr | Out-Null

  if (-not (Wait-ForOllama -Attempts 45)) {
    throw "Ollama did not become available at $ApiUrl"
  }
}

function Test-ModelInstalled {
  if (-not $script:OllamaCommand) {
    return $false
  }

  $list = & $script:OllamaCommand list 2>$null
  $escapedModel = [regex]::Escape($Model)
  return ($list -match "(?m)^$escapedModel\s")
}

function Confirm-FreeDiskSpace {
  $homeRoot = [System.IO.Path]::GetPathRoot($HOME)
  $driveName = $homeRoot.TrimEnd("\").TrimEnd(":")
  $drive = Get-PSDrive -Name $driveName -ErrorAction SilentlyContinue

  if (-not $drive) {
    return
  }

  $freeGB = [math]::Floor($drive.Free / 1GB)
  if ($freeGB -lt $MinimumFreeGB) {
    Write-WarningLine "Only about ${freeGB}GB is available on $homeRoot. Large models may need significantly more free space."
    Confirm-Step "Continue anyway?"
  }
}

function Pull-Model {
  if ($SkipModelPull) {
    Write-Section "Skipping model pull"
    return
  }

  if ($DryRun) {
    Write-Section "Would check/pull model: $Model"
    return
  }

  if (Test-ModelInstalled) {
    Write-Section "Model already installed: $Model"
    return
  }

  Write-Section "Model is not installed: $Model"
  Write-Note "This can download several GB and may take a while."
  Confirm-FreeDiskSpace
  Confirm-Step "Pull $Model now?"

  & $script:OllamaCommand pull $Model
  if ($LASTEXITCODE -ne 0) {
    throw "ollama pull failed with exit code $LASTEXITCODE"
  }
}

function Test-CorsHeaders {
  if ($DryRun) {
    return
  }

  $firstOrigin = ($Origins -split ",")[0].Trim()
  try {
    $response = Invoke-WebRequest `
      -Uri "$ApiUrl/api/chat" `
      -Method Options `
      -Headers @{
        "Origin" = $firstOrigin
        "Access-Control-Request-Method" = "POST"
      } `
      -UseBasicParsing `
      -TimeoutSec 5

    $corsHeader = $response.Headers["Access-Control-Allow-Origin"]
    if (-not $corsHeader) {
      Write-WarningLine "Could not confirm CORS headers for $firstOrigin. If the website cannot connect, quit and reopen Ollama, then try again."
    }
  } catch {
    Write-WarningLine "Could not confirm CORS headers for $firstOrigin. If the website cannot connect, quit and reopen Ollama, then try again."
  }
}

function Write-Summary {
  Write-Host ""
  Write-Host "Done."
  Write-Host ""
  Write-Host "Ollama API:       $ApiUrl"
  Write-Host "Model:            $Model"
  Write-Host "Allowed origins:  $Origins"
  Write-Host ""
  Write-Host "Open your web app and retry the local Ollama connection."
}

function Main {
  Write-Section "Ollama Windows Installer"
  Write-Note "Model: $Model"
  Write-Note "Allowed origins: $Origins"

  Test-WindowsVersion

  Find-Ollama
  if (-not $script:OllamaCommand) {
    Install-Ollama
  } else {
    Write-Section "Found Ollama: $script:OllamaCommand"
  }

  if (-not $script:OllamaCommand) {
    throw "Could not find the Ollama CLI after installation."
  }

  Set-OllamaEnvironment
  Restart-OllamaIfRunning
  Start-Ollama
  Pull-Model
  Test-CorsHeaders
  Write-Summary
}

Main
