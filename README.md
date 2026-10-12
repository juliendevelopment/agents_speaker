# agents_speaker

Reads the answers of command-line coding agents (Claude Code, Codex, Antigravity CLI) aloud,
**100 % locally**, in French or English, with a GNOME extension to silence the voice.

- Speech synthesis is done by [Piper](https://github.com/OHF-Voice/piper1-gpl), on the machine:
  no text is sent to an external service.
- The language (FR/EN) is detected automatically and the voice is chosen accordingly.
- Playback starts when the agent has finished answering and stops as soon as you send it a new message.
- An icon in the GNOME top bar lets you stop playback and mute the voice, and a configurable
  keyboard shortcut stops playback.

## How it works

```
 Agent (Claude Code, Codex, agy)
   │  end of answer → "Stop" hook: JSON on stdin
   ▼
 agent-speak  (bin/agent-speak, Python)
   │  extracts the answer, strips Markdown/code/URLs, detects the language
   │  starts in the background (detached process group):
   ▼
 curl → local Piper server 127.0.0.1:5005   ──(if unavailable)──▶ piper command
   │  WAV
   ▼
 pw-play (PipeWire) → speakers

 New message → "UserPromptSubmit" hook → agent-speak --stop → kills playback
 GNOME extension → agent-speak --stop / --mute / --unmute
```

### State files

| File | Purpose |
|---|---|
| `$XDG_RUNTIME_DIR/agent-speak/pid` | process group ID of the current playback |
| `$XDG_RUNTIME_DIR/agent-speak/last.txt` | last text sent to Piper, with the voice used (debugging) |
| `~/.config/agent-speak/muted` | present = voice disabled |

The GNOME extension only reads these files and calls the script: all the logic stays in `agent-speak`.

## Repository contents

| Path | Purpose | Installed in |
|---|---|---|
| `bin/agent-speak` | hook script | `~/.local/bin/agent-speak` |
| `piper/piper-tts.service` | Piper HTTP server (systemd user service) | `~/.config/systemd/user/` |
| `gnome-extension/agent-speak@juliendevelopment/` | GNOME Shell 50 extension | `~/.local/share/gnome-shell/extensions/` |
| `hooks/claude-code.settings.json` | hooks to merge into `~/.claude/settings.json` | — |
| `hooks/codex.hooks.json` | Codex hooks | `~/.codex/hooks.json` |
| `hooks/antigravity.hooks.json` | Antigravity CLI (agy) hooks | `~/.gemini/config/hooks.json` |
| `install.sh` | installs everything except the hooks | — |

## Installation

### Prerequisites

Tested on Fedora with GNOME Shell 50. Whichever installation method you choose, check that you have:

| Requirement | Why | Check |
|---|---|---|
| GNOME Shell **50** | the extension only declares version 50; on another version it is installed but not loaded, and without GNOME the script stops at the last step | `gnome-shell --version` |
| a systemd user session | the Piper server runs as a user service | `systemctl --user status` |
| `python3` | `agent-speak` is a Python script | `python3 --version` |
| `uv` | installs Piper | `uv --version` |
| `curl` | sends text to the Piper server | `curl --version` |
| `pw-play` (Fedora package `pipewire-utils`) | plays the audio through PipeWire | `command -v pw-play` |
| `glib-compile-schemas`, `gsettings` (GLib, installed with GNOME) | compile the extension's settings and enable it | `command -v glib-compile-schemas gsettings` |
| `~/.local/bin` in your `PATH` | the hooks call `agent-speak` by name (see below) | `echo $PATH` |
| default `uv` tool locations | the script and the service expect Piper in `~/.local/share/uv/tools/piper-tts` and `~/.local/bin/piper`: do not set `UV_TOOL_DIR` or `UV_TOOL_BIN_DIR` | `uv tool dir` |

Install as your normal user, **not with `sudo`**: everything is installed in your home directory.

There are two ways to install: run the script yourself, or ask your coding agent to do it.

### Option 1: run the install script

```sh
./install.sh
```

The script:

1. installs Piper with `uv tool install piper-tts --with flask` (Flask is used by the HTTP server);
2. downloads the `fr_FR-siwis-medium` and `en_US-lessac-medium` voices into `~/.local/share/piper-voices`;
3. copies `agent-speak` into `~/.local/bin`;
4. installs and starts the `piper-tts` service;
5. copies the extension, compiles its settings schema and adds it to the enabled extensions.

Then add the hooks by hand (see [Hooks](#hooks)): the script does not touch the agents'
configuration, so as not to overwrite an existing one.

### Option 2: ask your coding agent

Start Claude Code, Codex or Antigravity CLI in the cloned repository and paste this prompt. The agent
checks the prerequisites, installs everything and adds the hooks to its own configuration, merging
them with what is already there.

```text
Install agent-speak from this repository for my user. Read README.md first: it describes every file
and where it goes.

1. Check every prerequisite listed in the "Prerequisites" table of README.md and report the result.
   If something is missing, stop and tell me the command to install it. Never use sudo yourself.
2. Run ./install.sh and show me its output. If it fails, explain why and stop.
3. Check that `command -v agent-speak` prints ~/.local/bin/agent-speak in my login shell. If not,
   add ~/.local/bin to the PATH in that shell's configuration (fish: `fish_add_path ~/.local/bin`).
4. Add the agent-speak hooks for the agent you are (Claude Code, Codex or Antigravity CLI), using
   the matching file in hooks/ and the destination given in README.md. If the destination file
   already exists, merge the hooks into it and keep every existing entry; show me the change
   before writing it. Do not touch the configuration of the other agents.
5. Test the voice with: agent-speak --say "The installation works."
6. Summarize what you did and remind me to log out and back in so GNOME loads the extension,
   and to restart the agent so the hooks are active.
```

To install the hooks for another agent too, run the same prompt in that agent.

### After installing

On Wayland, you must **log out and log back in** for GNOME Shell to load the extension.

The hooks call `agent-speak` by name, so `~/.local/bin` must be in the `PATH` of the shell that
starts the agent. Otherwise the hook fails without any message (the script always exits with code 0)
and nothing is read. To check:

```sh
command -v agent-speak    # should print ~/.local/bin/agent-speak
```

If it prints nothing, add the directory to the `PATH`, then restart the agent from a new terminal:

```sh
fish_add_path ~/.local/bin                                  # fish (persistent setting)
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc    # bash
```

## Hooks

A *hook* is a command that the agent runs automatically at a given point in its cycle.
agent-speak uses two of them.

### Claude Code

In `~/.claude/settings.json` (contents of `hooks/claude-code.settings.json`):

```json
{
  "hooks": {
    "Stop": [
      { "hooks": [ { "type": "command", "command": "agent-speak" } ] }
    ],
    "UserPromptSubmit": [
      { "hooks": [ { "type": "command", "command": "agent-speak --stop" } ] }
    ]
  }
}
```

- **`Stop`** fires when Claude has finished answering. Claude Code sends a JSON object on standard
  input that contains, among other things, `last_assistant_message`, the text of the answer.
  `agent-speak` reads it, starts playback **in a detached process** and returns immediately: the agent
  never waits for playback to finish.
- **`UserPromptSubmit`** fires when you send a new message: `agent-speak --stop` stops the current
  playback, so that it does not talk over the conversation.

The script never returns an error to the agent (exit code always 0): a sound problem must not
block the work.

### Codex and Antigravity CLI

Same principle. Codex uses the same event names as Claude Code. Antigravity (agy) fires
`Stop` and `PreInvocation`, and does not provide the text directly but a `transcriptPath`:
`agent-speak` then reads the model's last answer (`PLANNER_RESPONSE`) from that JSONL file.

## Piper

[Piper](https://github.com/OHF-Voice/piper1-gpl) is a neural text-to-speech engine that runs on the CPU.

The `piper-tts` service runs `python -m piper.http_server` on `127.0.0.1:5005` (reachable only
from the machine). It keeps the voices loaded in memory: an answer starts playing in about one
second. If the server does not respond, `agent-speak` calls the `piper` command directly, which
reloads the voice every time (about 5 s to start).

```sh
systemctl --user status piper-tts      # server status
journalctl --user -u piper-tts -f      # logs
```

The voices come from the [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices) catalog.
To try another one:

```sh
~/.local/share/uv/tools/piper-tts/bin/python -m piper.download_voices fr_FR-tom-medium --download-dir ~/.local/share/piper-voices
AGENT_SPEAK_VOICE_FR=fr_FR-tom-medium agent-speak --say "Bonjour"
```

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `AGENT_SPEAK_MAX` | `0` | maximum number of characters read; `0` = no limit |
| `AGENT_SPEAK_SPEED` | `0.9` | speed (Piper's `length_scale`): above 1 = slower |
| `AGENT_SPEAK_VOICE_FR` | `fr_FR-siwis-medium` | French voice |
| `AGENT_SPEAK_VOICE_EN` | `en_US-lessac-medium` | English voice |
| `AGENT_SPEAK_VOICES` | `~/.local/share/piper-voices` | voices directory |
| `AGENT_SPEAK_SERVER` | `http://127.0.0.1:5005` | Piper server address |
| `AGENT_SPEAK_PIPER` | `~/.local/bin/piper` | fallback piper command |

For Claude Code, these variables can be set in the `"env"` key of `~/.claude/settings.json`:
the hooks inherit them.

## Command line

```sh
agent-speak --say "text"    # read a text (test)
agent-speak --stop          # stop the current playback
agent-speak --mute          # disable the voice (and stop playback)
agent-speak --unmute        # enable the voice again
agent-speak --toggle        # toggle
```

## GNOME extension

An icon in the top bar:

| Icon | State | Left click |
|---|---|---|
| speaker | voice enabled, nothing playing | opens the menu |
| "stop" square | playback in progress | stops playback immediately |
| crossed-out speaker | voice disabled | opens the menu |

Menu: **Arrêter la lecture** (stop playback), **Lire les réponses à voix haute** switch (read answers
aloud), **Paramètres…** (settings).

The **Super+Shift+X** shortcut stops playback. It can be changed in the extension's settings (the
"Paramètres…" menu entry or the Extensions app): click the row, then type the combination; Escape
cancels, Backspace disables the shortcut. A single key is not accepted (it would capture that
keystroke everywhere), except the function keys F1 to F35.

The setting is stored in `/org/gnome/shell/extensions/agent-speak/stop-shortcut`:

```sh
gsettings --schemadir ~/.local/share/gnome-shell/extensions/agent-speak@juliendevelopment/schemas \
  set org.gnome.shell.extensions.agent-speak stop-shortcut "['<Control><Alt>s']"
```

## What is not read

- code blocks and URLs (removed before synthesis);
- with Claude Code, only the **last text block** of the answer is passed to the hook: text written
  before a tool call is not read.

## Troubleshooting

| Symptom | Check |
|---|---|
| nothing is read | `command -v agent-speak` (see `PATH` under Installation); `agent-speak --say test`; presence of `~/.config/agent-speak/muted` |
| playback slow to start | `systemctl --user status piper-tts` (otherwise falls back to the piper command) |
| unexpected text read | `cat $XDG_RUNTIME_DIR/agent-speak/last.txt` |
| icon missing | log back in; `gnome-extensions info agent-speak@juliendevelopment`; `journalctl --user -b \| grep -i agent-speak` |

## License

[MIT](LICENSE). Piper and the Piper voices are not part of this repository: they are downloaded
during installation and keep their own licenses.
