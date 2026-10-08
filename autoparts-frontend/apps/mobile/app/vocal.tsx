import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import { Mic, MicOff, PhoneCall, PhoneOff, Bot } from 'lucide-react-native';
import { voiceOrderApi } from '@autoparts/api';
import { useAuthStore } from '../src/store/auth.store';
import type { VoiceSession } from '@autoparts/types';

type CallState = 'idle' | 'connecting' | 'connected' | 'ended' | 'error';

/** Une barre d'activité audio — hauteur animée avec son propre retard. */
function Bar({ level, color, base }: { level: SharedValue<number>; color: string; base: number }) {
  const style = useAnimatedStyle(() => ({
    height: 8 + level.value * base,
  }));
  return <Animated.View style={[{ width: 4, borderRadius: 2, backgroundColor: color, marginHorizontal: 2 }, style]} />;
}

/** Barres d'activité audio animées — hauteur suivie par un shared value. */
function AudioBars({ active, color }: { active: boolean; color: string }) {
  const level = useSharedValue(0.3);
  useEffect(() => {
    if (active) {
      level.value = withRepeat(
        withTiming(1, { duration: 420, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      );
    } else {
      cancelAnimation(level);
      level.value = withTiming(0.3, { duration: 200 });
    }
  }, [active, level]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', height: 34 }}>
      <Bar level={level} color={color} base={22} />
      <Bar level={level} color={color} base={34} />
      <Bar level={level} color={color} base={18} />
      <Bar level={level} color={color} base={30} />
      <Bar level={level} color={color} base={14} />
    </View>
  );
}

/**
 * Appel vocal LiveKit — comme l'agent backend (worker autoparts-voice-agent).
 * POST /voice-order/session → { roomName, token, agentUrl } → Room WebRTC :
 * micro publié, voix de l'agent lue en direct (full-duplex).
 * Web uniquement (livekit-client) ; le natif exigera @livekit/react-native.
 */
export default function VocalScreen() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const [state, setState] = useState<CallState>('idle');
  const [muted, setMuted] = useState(false);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [session, setSession] = useState<VoiceSession | null>(null);
  const roomRef = useRef<{ disconnect: () => void } | null>(null);
  const micRef = useRef<{ mute: () => unknown; unmute: () => unknown } | null>(null);

  const isWeb = Platform.OS === 'web';

  const cleanup = useCallback(() => {
    roomRef.current?.disconnect();
    roomRef.current = null;
    micRef.current = null;
    setAgentSpeaking(false);
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const startCall = async () => {
    if (!isWeb) {
      setMessage('Les appels vocaux nécessitent le web (WebRTC). Le chat AutoBot reste disponible.');
      return;
    }
    if (!isAuthenticated) {
      router.push('/(auth)/login');
      return;
    }
    setState('connecting');
    setMessage(null);
    try {
      const sess = await voiceOrderApi.createSession();
      setSession(sess);

      const lk = await import('livekit-client');
      const room = new lk.Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;

      room.on(lk.RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === lk.Track.Kind.Audio) {
          setAgentSpeaking(true);
          track.attach().play().catch(() => {});
        }
      });
      room.on(lk.RoomEvent.TrackUnsubscribed, () => setAgentSpeaking(false));
      room.on(lk.RoomEvent.Disconnected, () => {
        setState((s) => (s === 'ended' ? s : 'ended'));
        setAgentSpeaking(false);
      });

      await room.connect(sess.agentUrl, sess.token);

      // Publie le micro (autoplay policy : l'appel vient d'un geste utilisateur).
      const mic = await lk.createLocalAudioTrack();
      micRef.current = mic;
      await room.localParticipant.publishTrack(mic);

      setState('connected');
    } catch (e) {
      cleanup();
      setState('error');
      setMessage((e as Error).message ?? 'Impossible de joindre l’agent vocal.');
    }
  };

  const endCall = async () => {
    const roomName = session?.roomName;
    cleanup();
    setState('ended');
    if (roomName) {
      try {
        await voiceOrderApi.endSession(roomName);
      } catch {
        // la room se ferme seule côté LiveKit
      }
    }
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    void (next ? micRef.current?.mute() : micRef.current?.unmute());
  };

  const statusLabel: Record<CallState, string> = {
    idle: 'Prêt à appeler',
    connecting: 'Connexion à l’agent…',
    connected: 'Appel en cours',
    ended: 'Appel terminé',
    error: 'Échec de connexion',
  };

  // Pulse du bouton raccrocher pendant l'appel.
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (state === 'connected') {
      pulse.value = withRepeat(
        withTiming(1.06, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      );
    } else {
      cancelAnimation(pulse);
      pulse.value = withTiming(1, { duration: 200 });
    }
  }, [state, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  const inCall = state === 'connected' || state === 'connecting';

  return (
    <View className="flex-1 bg-slate-950">
      {/* Halo agent */}
      <View className="flex-1 items-center justify-center gap-5 px-6">
        <View
          className={`h-[120px] w-[120px] items-center justify-center rounded-full ${
            state === 'connected' ? 'bg-primary/20' : 'bg-white/5'
          }`}
        >
          {state === 'connected' ? (
            <AudioBars active={agentSpeaking} color="#E04553" />
          ) : (
            <Bot size={48} color={state === 'error' ? '#97A0AC' : '#C92F3E'} />
          )}
        </View>

        <View className="items-center gap-1.5">
          <Text className="text-xl font-bold text-white">AutoBot Vocal</Text>
          <Text
            className={`text-sm ${
              state === 'connected'
                ? 'text-success'
                : state === 'connecting'
                  ? 'text-accent'
                  : state === 'error'
                    ? 'text-primary'
                    : 'text-slate-400'
            }`}
          >
            {statusLabel[state]}
          </Text>
          {session && state === 'connected' ? (
            <Text className="text-[11px] text-slate-500">Session {session.sessionId.slice(0, 8)}…</Text>
          ) : null}
          {message ? (
            <Text className="mt-2 max-w-[300px] text-center text-xs text-slate-400">{message}</Text>
          ) : null}
        </View>

        {state === 'connected' ? (
          <Text className="max-w-[300px] text-center text-xs text-slate-500">
            Parlez naturellement : « J’ai une Toyota Hilux 2018, je cherche des plaquettes de frein ».
            L’agent cherche, ajoute au panier et passe la commande à la voix.
          </Text>
        ) : null}

        {/* Contrôles d'appel */}
        {inCall ? (
          <View className="flex-row items-center gap-6">
            <Pressable
              accessibilityRole="button"
              className={`h-14 w-14 items-center justify-center rounded-full ${muted ? 'bg-white/10' : 'bg-white/15'}`}
              onPress={toggleMute}
              disabled={state !== 'connected'}
            >
              {muted ? <MicOff size={22} color="#97A0AC" /> : <Mic size={22} color="#FFFFFF" />}
            </Pressable>
            <Animated.View style={pulseStyle}>
              <Pressable
                accessibilityRole="button"
                className="h-[68px] w-[68px] items-center justify-center rounded-full bg-primary"
                onPress={() => void endCall()}
              >
                <PhoneOff size={26} color="#FFFFFF" />
              </Pressable>
            </Animated.View>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            className="h-[76px] w-[76px] items-center justify-center rounded-full bg-success"
            onPress={() => void startCall()}
          >
            <PhoneCall size={30} color="#FFFFFF" />
          </Pressable>
        )}

        {state === 'ended' || state === 'error' ? (
          <Pressable onPress={() => { setState('idle'); setMessage(null); }}>
            <Text className="text-sm font-semibold text-slate-400">Réessayer</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
