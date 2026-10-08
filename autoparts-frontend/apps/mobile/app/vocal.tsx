import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { chatbotApi } from '@autoparts/api';
import { useAuthStore } from '../src/store/auth.store';
import {
  speechRecognitionAvailable,
  startRecognition,
  speak,
  stopSpeaking,
} from '../src/lib/speech';
import type { ChatMessage } from '@autoparts/types';

type Turn = { role: 'user' | 'assistant'; content: string };

const GREETING =
  'Bonjour, je suis AutoBot vocal. Appuyez sur le micro et posez votre question : pièce, prix, disponibilité.';

/**
 * Assistant vocal — Web Speech API (reconnaissance + synthèse) branchée sur
 * le cerveau AutoBot (POST /chatbot/message). Web Chromium/Edge : vocal complet.
 * Natif / navigateurs sans API : retombe sur la saisie texte.
 */
export default function VocalScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const sessionKey = useRef(`voice-${Date.now().toString(36)}`);

  const supported = Platform.OS === 'web' && speechRecognitionAvailable();
  const [listening, setListening] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [partial, setPartial] = useState('');
  const [muted, setMuted] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([{ role: 'assistant', content: GREETING }]);
  const [typed, setTyped] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const abortRec = useRef<(() => void) | null>(null);

  // Pulse du micro pendant l'écoute.
  const pulse = useSharedValue(1);
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));
  useEffect(() => {
    if (listening) {
      pulse.value = withRepeat(
        withTiming(1.12, { duration: 650, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      );
    } else {
      cancelAnimation(pulse);
      pulse.value = withTiming(1, { duration: 180 });
    }
  }, [listening, pulse]);

  // Salue vocalement à l'arrivée (une seule fois).
  useEffect(() => {
    if (supported && !muted) {
      const h = speak(GREETING);
      if (h) setSpeaking(true);
    }
    return () => {
      stopSpeaking();
      abortRec.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reply = (text: string) => {
    setTurns((t) => [...t, { role: 'assistant', content: text }]);
    if (supported && !muted) {
      const h = speak(text, 'fr-FR', () => setSpeaking(false));
      if (h) setSpeaking(true);
    }
  };

  const ask = async (text: string) => {
    const question = text.trim();
    if (!question || thinking) return;
    setTurns((t) => [...t, { role: 'user', content: question }]);
    setThinking(true);
    try {
      const answer = await chatbotApi.send(question, sessionKey.current, user?.id);
      reply(answer.content);
    } catch (e) {
      reply((e as Error).message ?? "L'assistant est indisponible.");
    } finally {
      setThinking(false);
    }
  };

  const startListening = () => {
    if (listening || thinking) return;
    stopSpeaking();
    setSpeaking(false);
    setPartial('');
    setListening(true);
    abortRec.current = startRecognition('fr-FR', {
      onResult: (text, isFinal) => {
        setPartial(text);
        if (isFinal) {
          abortRec.current?.();
          abortRec.current = null;
          setListening(false);
          setPartial('');
          void ask(text);
        }
      },
      onEnd: () => setListening(false),
      onError: (message) => {
        setTurns((t) => [...t, { role: 'assistant', content: `⚠ ${message}` }]);
      },
    });
  };

  const stopListening = () => {
    abortRec.current?.();
    abortRec.current = null;
    setListening(false);
  };

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-900">
      {/* Barre d'état */}
      <View className="flex-row items-center justify-between border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-700 dark:bg-slate-800">
        <View className="flex-row items-center gap-2">
          <View
            className={`h-2 w-2 rounded-full ${
              listening ? 'bg-primary' : thinking ? 'bg-accent' : speaking ? 'bg-success' : 'bg-slate-300'
            }`}
          />
          <Text className="text-sm font-semibold">
            {listening ? 'Je vous écoute…' : thinking ? 'AutoBot réfléchit…' : speaking ? 'AutoBot parle' : 'AutoBot vocal'}
          </Text>
        </View>
        <Pressable
          className="rounded-lg bg-slate-100 p-2 dark:bg-slate-700"
          onPress={() => {
            setMuted((m) => {
              if (!m) stopSpeaking();
              return !m;
            });
          }}
        >
          {muted ? <VolumeX size={18} color="#97A0AC" /> : <Volume2 size={18} color="#C92F3E" />}
        </Pressable>
      </View>

      {/* Conversation */}
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerClassName="gap-2 p-3"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {turns.map((t, i) => (
          <View key={i} className={t.role === 'user' ? 'self-end' : 'self-start'}>
            <Text
              className={`max-w-[290px] rounded-2xl px-3 py-2 text-sm ${
                t.role === 'user'
                  ? 'rounded-br-sm bg-primary text-white'
                  : 'rounded-bl-sm bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100'
              }`}
            >
              {t.content}
            </Text>
          </View>
        ))}
        {partial ? (
          <Text className="self-end max-w-[290px] rounded-2xl rounded-br-sm bg-primary/60 px-3 py-2 text-sm italic text-white">
            {partial}…
          </Text>
        ) : null}
        {thinking ? <Text className="px-2 text-xs text-slate-400">AutoBot réfléchit…</Text> : null}
        {!supported ? (
          <Text className="mt-2 px-2 text-center text-xs text-slate-400">
            {Platform.OS === 'web'
              ? "Ce navigateur ne supporte pas la reconnaissance vocale — utilisez la saisie ci-dessous (Chrome/Edge recommandés)."
              : 'Le vocal temps réel nécessite un build natif avec micro — la saisie texte reste disponible.'}
          </Text>
        ) : null}
      </ScrollView>

      {/* Saisie texte de secours */}
      <View className="flex-row items-center gap-2 border-t border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
        <TextInput
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          placeholder="Écrire à AutoBot…"
          value={typed}
          onChangeText={setTyped}
          onSubmitEditing={() => {
            void ask(typed);
            setTyped('');
          }}
          returnKeyType="send"
        />
      </View>

      {/* Bouton micro */}
      <View className="items-center border-t border-slate-200 bg-white pb-6 pt-4 dark:border-slate-700 dark:bg-slate-800">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={listening ? 'Arrêter l écoute' : 'Parler à AutoBot'}
          disabled={!supported || thinking}
          onPress={listening ? stopListening : startListening}
          className={supported && !thinking ? '' : 'opacity-40'}
        >
          <Animated.View
            style={[pulseStyle]}
            className={`h-[72px] w-[72px] items-center justify-center rounded-full ${
              listening ? 'bg-primary' : 'bg-white shadow-md dark:bg-slate-700'
            }`}
          >
            {listening ? (
              <MicOff size={30} color="#FFFFFF" />
            ) : (
              <Mic size={30} color="#C92F3E" />
            )}
          </Animated.View>
        </Pressable>
        <Text className="mt-2 text-xs text-slate-400">
          {listening ? 'Appuyez pour arrêter' : 'Appuyez pour parler'}
        </Text>
      </View>
    </View>
  );
}
