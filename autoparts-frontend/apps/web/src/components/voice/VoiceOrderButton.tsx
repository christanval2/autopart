// ── VoiceOrderButton — commande vocale AutoBot (LiveKit WebRTC) ─
import { useState } from 'react';
import { Mic, MicOff, PhoneOff, AudioLines } from 'lucide-react';
import { Room, RoomEvent, ConnectionState } from 'livekit-client';
import { Button, Modal, Badge } from '@autoparts/ui';
import { voiceOrderApi } from '@autoparts/api';
import { useAuthStore } from '@/store/auth.store';
import { toast } from 'sonner';

type Phase = 'idle' | 'connecting' | 'live' | 'ending';

export function VoiceOrderButton() {
  const { isAuthenticated } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [muted, setMuted] = useState(false);
  const [level, setLevel] = useState(0);

  const [room, setRoom] = useState<Room | null>(null);
  const [session, setSession] = useState<{ roomName: string; sessionId: string } | null>(null);

  const start = async () => {
    if (!isAuthenticated) {
      toast.info('Connectez-vous pour passer une commande vocale.');
      return;
    }
    setPhase('connecting');
    try {
      const s = await voiceOrderApi.createSession();
      const r = new Room();
      r.on(RoomEvent.AudioPlaybackStatusChanged, () => undefined);
      // Mesure du niveau micro via les haut-parleurs actifs
      r.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        const loudest = speakers.reduce((max, sp) => Math.max(max, sp.audioLevel), 0);
        setLevel(loudest);
      });
      r.on(RoomEvent.Disconnected, () => setPhase('idle'));

      await r.connect(s.agentUrl, s.token);
      setRoom(r);
      setSession({ roomName: s.roomName, sessionId: s.sessionId });
      setPhase('live');
      if (!s.agentDispatched) {
        toast.warning(
          "Agent vocal non dispatché — le worker voice-agent n'est peut-être pas déployé.",
        );
      }
    } catch (e) {
      setPhase('idle');
      toast.error((e as Error).message ?? 'Impossible de démarrer la session vocale');
    }
  };

  const end = async () => {
    if (!session || !room) return;
    setPhase('ending');
    try {
      if (room.state !== ConnectionState.Disconnected) await room.disconnect();
      await voiceOrderApi.endSession(session.roomName);
    } catch {
      // la room expire seule côté LiveKit
    } finally {
      setRoom(null);
      setSession(null);
      setPhase('idle');
      setOpen(false);
    }
  };

  const toggleMute = () => {
    if (!room?.localParticipant) return;
    const next = !muted;
    setMuted(next);
    void room.localParticipant.setMicrophoneEnabled(!next);
  };

  return (
    <>
      {/* Empilé au-dessus de la bulle AutoBot (bottom-6 + h-14 + gap) */}
      <Button
        variant="secondary"
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-6 z-[80] h-12 w-12 justify-center rounded-full p-0 shadow-lg transition-transform hover:scale-105"
        aria-label="Commande vocale"
        title="Commande vocale — AutoBot"
      >
        <AudioLines strokeWidth={1.5} className="h-5 w-5" />
      </Button>

      <Modal open={open} onClose={() => phase === 'idle' && setOpen(false)} title="Commande vocale — AutoBot">
        <div className="flex flex-col items-center gap-5 py-6">
          {phase === 'idle' && (
            <>
              <p className="max-w-xs text-center text-sm text-muted-foreground">
                Parlez à AutoBot pour dicter votre commande : « Je veux des disques de frein pour
                Toyota Hilux 2018… ». L'agent prépare la commande avec vous.
              </p>
              <Button size="lg" onClick={start}>
                <Mic strokeWidth={1.5} className="h-5 w-5" /> Démarrer la session
              </Button>
            </>
          )}

          {phase === 'connecting' && (
            <>
              <div className="h-16 w-16 animate-pulse rounded-full bg-accent/30" />
              <p className="text-sm text-muted-foreground">Connexion à l'agent vocal…</p>
            </>
          )}

          {phase === 'live' && (
            <>
              <div className="relative flex h-20 w-20 items-center justify-center">
                <div
                  className="absolute inset-0 rounded-full bg-accent/30 transition-transform"
                  style={{ transform: `scale(${1 + Math.min(level, 1)})` }}
                />
                <AudioLines strokeWidth={1.5} className="h-8 w-8 text-accent" />
              </div>
              <Badge tone="success">Session active — je vous écoute</Badge>
              <div className="flex gap-3">
                <Button variant="outline" onClick={toggleMute}>
                  {muted ? <MicOff strokeWidth={1.5} className="h-4 w-4" /> : <Mic strokeWidth={1.5} className="h-4 w-4" />}
                  {muted ? 'Réactiver le micro' : 'Couper le micro'}
                </Button>
                <Button variant="destructive" onClick={end}>
                  <PhoneOff strokeWidth={1.5} className="h-4 w-4" /> Terminer
                </Button>
              </div>
              <p className="max-w-xs text-center text-xs text-muted-foreground">
                L'agent vocal passe la commande en votre nom ; retrouvez-la dans « Mes commandes ».
              </p>
            </>
          )}

          {phase === 'ending' && <p className="text-sm text-muted-foreground">Clôture de la session…</p>}
        </div>
      </Modal>
    </>
  );
}
