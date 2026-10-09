#!/usr/bin/env python3
"""
Télécharge les voix françaises Piper (rhasspy/piper-voices sur HuggingFace).
À lancer une fois avant `python agent.py dev` :

    python download_voices.py            # voix par défaut : fr_FR-siwis-medium
    python download_voices.py --all      # siwis + upmc + tom

Les fichiers atterrissent dans ./voices/ (ignoré par git).
"""
import os
import sys
import urllib.request

BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/fr/fr_FR"
# clés = identifiant complet de la voix (nom de fichier sur le disque)
VOICES = {
    "fr_FR-siwis-medium": f"{BASE}/siwis/medium/fr_FR-siwis-medium",   # défaut : léger (~60 Mo), très correct
    "fr_FR-upmc-high":    f"{BASE}/upmc/high/fr_FR-upmc-high",          # meilleure qualité, plus lourd
    "fr_FR-tom-medium":   f"{BASE}/tom/medium/fr_FR-tom-medium",        # voix masculine alternative
}
DEST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "voices")


def fetch(url: str, dest: str) -> None:
    print(f"  ↓ {os.path.basename(dest)} …")
    urllib.request.urlretrieve(url, dest)


def main() -> None:
    want_all = "--all" in sys.argv
    os.makedirs(DEST, exist_ok=True)
    wanted = VOICES if want_all else {"fr_FR-siwis-medium": VOICES["fr_FR-siwis-medium"]}

    for name, base in wanted.items():
        onnx = os.path.join(DEST, f"{name}.onnx")
        conf = onnx + ".json"
        if os.path.exists(onnx) and os.path.exists(conf):
            print(f"✓ {name} déjà présent")
            continue
        fetch(base + ".onnx", onnx)
        fetch(base + ".onnx.json", conf)
        print(f"✓ {name} installé")

    print("\nTerminé — voix dans", DEST)
    print("Autre voix : PIPER_VOICE=<chemin .onnx> python agent.py dev")


if __name__ == "__main__":
    main()
