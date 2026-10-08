FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pré-télécharger les modèles Silero VAD (évite le DL au 1er démarrage)
RUN python -c "from livekit.plugins import silero; silero.VAD.load()"

COPY agent.py .
COPY .env .

ENV PYTHONUNBUFFERED=1

CMD ["python", "agent.py", "start"]
