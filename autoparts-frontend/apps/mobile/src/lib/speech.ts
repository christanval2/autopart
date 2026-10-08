/* ── Reconnaissance + synthèse vocale (Web Speech API) ──────────
   Disponible sur navigateurs Chromium/Edge (web). Sur natif, ces APIs
   n'existent pas : l'écran vocal retombe sur la saisie texte.
   Typages minimaux — l'API n'est pas dans lib.dom pour webkit. */

type SpeechRecognitionAlternativeLike = { transcript: string };
type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
  length: number;
};
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechRecognitionResultLike };
};
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
};

type RecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): RecognitionCtor | null {
  const w = globalThis as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechRecognitionAvailable(): boolean {
  return getRecognitionCtor() !== null;
}

export type RecognitionHandlers = {
  /** `isFinal` distingue les résultats provisoires du résultat définitif. */
  onResult: (text: string, isFinal: boolean) => void;
  onEnd: () => void;
  onError: (message: string) => void;
};

export function startRecognition(lang: string, handlers: RecognitionHandlers): () => void {
  const Ctor = getRecognitionCtor();
  if (!Ctor) {
    handlers.onError('Reconnaissance vocale non supportée sur ce navigateur');
    handlers.onEnd();
    return () => {};
  }
  const rec = new Ctor();
  rec.lang = lang;
  rec.continuous = false;
  rec.interimResults = true;

  rec.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      handlers.onResult(r[0].transcript, r.isFinal);
    }
  };
  rec.onend = () => handlers.onEnd();
  rec.onerror = (e) => handlers.onError(e.error === 'not-allowed' ? 'Micro refusé' : 'Erreur micro');

  try {
    rec.start();
  } catch {
    handlers.onError('Micro indisponible');
    handlers.onEnd();
  }
  return () => {
    try {
      rec.abort();
    } catch {
      // déjà arrêté
    }
  };
}

let currentUtterance: { cancel: () => void } | null = null;

/** Lit un texte à voix haute (fr-FR). Retourne un handle annulable. */
export function speak(
  text: string,
  lang = 'fr-FR',
  onEnd?: () => void,
): { cancel: () => void } | null {
  const synth = (globalThis as unknown as { speechSynthesis?: { speak: (u: unknown) => void; cancel: () => void; pending: boolean; speaking: boolean } }).speechSynthesis;
  if (!synth) return null;

  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = 1.05;
  const handle = {
    cancel: () => {
      try {
        synth.cancel();
      } catch {
        // noop
      }
    },
  };
  currentUtterance = handle;
  u.onend = () => {
    currentUtterance = null;
    onEnd?.();
  };
  synth.speak(u);
  return handle;
}

export function stopSpeaking(): void {
  currentUtterance?.cancel();
  currentUtterance = null;
}
