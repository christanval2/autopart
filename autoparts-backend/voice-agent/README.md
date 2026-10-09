# AutoParts Voice Agent — LiveKit + Groq (STT/LLM) + Piper (TTS)

Agent vocal de commande : le client parle, AutoBot comprend et passe la commande.

| Brique | Service | Modèle |
|---|---|---|
| STT (comprendre) | Groq | whisper-large-v3 (fr + pidgin) |
| LLM (décider) | Groq | gpt-oss-20b (`GROQ_LLM_MODEL`) |
| TTS (parler) | **Piper local** | fr_FR-siwis-medium (~60 Mo, 10× temps réel, zéro clé) |

## Installation

```bash
pip install -r requirements.txt
python download_voices.py      # voix française Piper (~60 Mo, une fois)
cp .env.example .env           # renseigner LIVEKIT_*, GROQ_API_KEY, BACKEND_URL
```

## Lancement

```bash
python agent.py dev     # développement
python agent.py start   # production (connexion au cloud LiveKit)
```

Autres voix : `python download_voices.py --all` puis
`PIPER_VOICE=voices/fr_FR-upmc-high.onnx python agent.py dev`
(upmc = meilleure qualité, tom = voix masculine).

## Notes techniques

- `playai-tts` a été **retiré du catalogue Groq** — le TTS est passé en local
  Piper (aucune clé, aucun coût, latence mesurée : 11× temps réel sur CPU).
- `llama-3.3` a également été retiré du catalogue Groq — LLM sur
  `gpt-oss-20b` (modifiable via `GROQ_LLM_MODEL`).
- L'adaptateur `PiperTTS` suit l'API livekit-agents 1.8.5
  (ChunkedStream + AudioEmitter PCM).
