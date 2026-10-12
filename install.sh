#!/usr/bin/env bash
# Installe agent-speak, le serveur Piper et l'extension GNOME pour l'utilisateur courant.
# Les hooks des agents (Claude Code, Codex, Antigravity) restent à ajouter à la main : voir README.md.
set -euo pipefail

cd "$(dirname "$0")"
UUID=agent-speak@juliendevelopment
VOICES=~/.local/share/piper-voices
EXT=~/.local/share/gnome-shell/extensions/$UUID

for cmd in uv curl pw-play glib-compile-schemas; do
    command -v "$cmd" >/dev/null || { echo "Commande manquante : $cmd" >&2; exit 1; }
done

echo "→ Piper (moteur de synthèse vocale local)"
uv tool install piper-tts --with flask

echo "→ Voix FR et EN"
mkdir -p "$VOICES"
for v in fr_FR-siwis-medium en_US-lessac-medium; do
    [ -f "$VOICES/$v.onnx" ] || ~/.local/share/uv/tools/piper-tts/bin/python -m piper.download_voices "$v" --download-dir "$VOICES"
done

echo "→ Script agent-speak"
install -Dm755 bin/agent-speak ~/.local/bin/agent-speak

echo "→ Service systemd piper-tts"
install -Dm644 piper/piper-tts.service ~/.config/systemd/user/piper-tts.service
systemctl --user daemon-reload
systemctl --user enable --now piper-tts.service

echo "→ Extension GNOME"
rm -rf "$EXT"
mkdir -p "$EXT"
cp -r gnome-extension/$UUID/. "$EXT/"
glib-compile-schemas "$EXT/schemas"
# L'extension n'est visible par GNOME Shell (Wayland) qu'après une reconnexion :
# on l'ajoute donc directement à la liste des extensions activées.
current=$(gsettings get org.gnome.shell enabled-extensions)
if [[ $current != *"'$UUID'"* ]]; then
    if [[ $current == "@as []" || $current == "[]" ]]; then
        gsettings set org.gnome.shell enabled-extensions "['$UUID']"
    else
        gsettings set org.gnome.shell enabled-extensions "${current%]}, '$UUID']"
    fi
fi

echo
echo "Terminé. Déconnecte-toi puis reconnecte-toi pour voir l'icône dans la barre du haut."
echo "Test immédiat de la voix : agent-speak --say \"Bonjour, la lecture fonctionne.\""
