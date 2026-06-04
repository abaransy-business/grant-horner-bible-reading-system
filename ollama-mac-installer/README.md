# Ollama Mac Installer

Unsigned macOS setup helper for a web app that talks to a user's local Ollama server.

By default it configures Ollama for Ten List Bible and pulls:

```bash
gemma4:12b
```

The model is configurable, so the same installer can be reused if the preferred local model changes.

## What It Does

`ollama-mac-installer.command`:

- checks that the machine is running macOS 14 or newer
- checks whether Ollama is already installed
- downloads and installs the official Ollama macOS app if needed
- sets `OLLAMA_ORIGINS` using `launchctl setenv`
- restarts/starts Ollama so the origin setting is active
- pulls the configured model unless skipped
- verifies that the local API is reachable at `http://localhost:11434`

It does not set `OLLAMA_HOST`, so Ollama keeps its default local-only bind behavior.

## Run Locally

```bash
chmod +x ./ollama-mac-installer.command
./ollama-mac-installer.command
```

The script runs non-interactively by default — it accepts every action
without prompting. To run interactively (prompt before each step), pass
`ASSUME_YES=0`:

```bash
ASSUME_YES=0 ./ollama-mac-installer.command
```

## Configuration

Use flags:

```bash
./ollama-mac-installer.command \
  --model gemma4:12b \
  --origins "https://tenlistbible.com,https://www.tenlistbible.com"
```

Or environment variables:

```bash
TENLIST_OLLAMA_MODEL="gemma4:12b" \
TENLIST_OLLAMA_ORIGINS="https://tenlistbible.com,https://www.tenlistbible.com" \
./ollama-mac-installer.command
```

Useful options:

```bash
./ollama-mac-installer.command --skip-model-pull
./ollama-mac-installer.command --dry-run --yes --skip-model-pull
```

## Build A DMG

This creates an unsigned DMG containing the command file and this README:

```bash
./scripts/build-dmg.sh
```

Output:

```bash
dist/ollama-mac-installer.dmg
```

Because this is unsigned, macOS Gatekeeper may warn users when they download or run it.

## Verify

```bash
./scripts/verify.sh
```

This runs shell syntax checks and a dry run. It does not download Ollama or pull the model.

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
      model: "gemma4:12b",
      stream: false,
      messages: [
        {
          role: "system",
          content:
            "You explain selected Bible passages carefully. Distinguish text, context, and interpretation. Avoid inventing historical or theological claims."
        },
        {
          role: "user",
          content: `Explain this selected passage:\n\n${selectedText}`
        }
      ]
    })
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

- macOS install and storage notes: https://docs.ollama.com/macos
- API chat endpoint: https://docs.ollama.com/api/chat
- macOS environment variables and `OLLAMA_ORIGINS`: https://docs.ollama.com/faq
- Gemma 4 model page: https://ollama.com/library/gemma4
