# Ollama Windows Installer

Unsigned Windows setup helper for a web app that talks to a user's local Ollama server.

By default it configures Ollama for Ten List Bible and pulls:

```powershell
gemma4
```

The model is configurable, so the same installer can be reused if the preferred local model changes.

## What It Does

`ollama-windows-installer.ps1`:

- checks that the machine is running Windows 10 22H2 or newer
- checks whether Ollama is already installed
- downloads and runs the official Ollama Windows installer if needed
- sets `OLLAMA_ORIGINS` as a user environment variable
- restarts/starts Ollama so the origin setting is active
- pulls the configured model unless skipped
- verifies that the local API is reachable at `http://localhost:11434`

It does not set `OLLAMA_HOST`, so Ollama keeps its default local-only bind behavior.

## Run Locally

Double-click:

```text
ollama-windows-installer.cmd
```

Or run from PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ollama-windows-installer.ps1
```

The script runs non-interactively by default — it accepts every action
without prompting. To run interactively (prompt before each step), pass
`-Yes:$false`:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ollama-windows-installer.ps1 -Yes:$false
```

## Configuration

Use flags:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ollama-windows-installer.ps1 `
  -Model "gemma4" `
  -Origins "https://tenlistbible.com,https://www.tenlistbible.com"
```

Or environment variables:

```powershell
$env:TENLIST_OLLAMA_MODEL = "gemma4"
$env:TENLIST_OLLAMA_ORIGINS = "https://tenlistbible.com,https://www.tenlistbible.com"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ollama-windows-installer.ps1
```

Useful options:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ollama-windows-installer.ps1 -SkipModelPull
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ollama-windows-installer.ps1 -DryRun -Yes -SkipModelPull
```

## Build A Zip

This creates an unsigned zip containing the PowerShell script, double-click launcher, README, and optional Inno Setup file:

```bash
./scripts/build-zip.sh
```

Output:

```text
dist/ollama-windows-installer.zip
```

## Build An Unsigned EXE On Windows

Install Inno Setup on Windows, then open:

```text
OllamaWindowsInstaller.iss
```

Click **Compile**. The output will be:

```text
dist\ollama-windows-installer.exe
```

This `.exe` is still unsigned. Windows SmartScreen may warn users when they download or run it.

## Verify

```bash
./scripts/verify.sh
```

On macOS/Linux, this checks shell scripts and file presence. If `pwsh` is installed, it also parses the PowerShell script and runs a dry run.

On Windows, use:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ollama-windows-installer.ps1 -DryRun -Yes -SkipModelPull
```

## Web App Integration

The browser app should check whether Ollama is available:

```js
export async function getLocalOllamaStatus() {
  const response = await fetch("http://localhost:11434/api/tags");
  if (!response.ok) {
    throw new Error(`Ollama returned ${response.status}`);
  }

  const data = await response.json();
  return data.models;
}
```

Then call the chat API with the configured model:

```js
export async function explainSelection(selectedText) {
  const response = await fetch("http://localhost:11434/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gemma4",
      stream: false,
      messages: [
        {
          role: "system",
          content:
            "You explain selected Bible passages carefully. Distinguish text, context, and interpretation. Avoid inventing historical or theological claims.",
        },
        {
          role: "user",
          content: `Explain this selected passage:\n\n${selectedText}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = await response.json();
  return data.message.content;
}
```

Remember that `OLLAMA_ORIGINS` uses origins only. Do not include `/app`; use `https://tenlistbible.com`, not `https://tenlistbible.com/app`.

## Upstream Ollama References

- Windows install and storage notes: https://docs.ollama.com/windows
- Windows environment variable behavior and `OLLAMA_ORIGINS`: https://docs.ollama.com/faq
- Windows download page: https://ollama.com/download/windows
- Gemma 4 model page: https://ollama.com/library/gemma4
