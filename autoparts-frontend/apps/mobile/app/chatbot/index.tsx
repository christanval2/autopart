import { useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Link } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Mic, Send, Trash2 } from 'lucide-react-native';
import { chatbotApi } from '@autoparts/api';
import { useAuthStore } from '../../src/store/auth.store';
import type { ChatMessage } from '@autoparts/types';

const GREETING: ChatMessage = {
  role: 'assistant',
  content:
    'Bonjour 👋 Je suis AutoBot. Posez-moi vos questions : pièce compatible, prix, disponibilité, suivi de commande…',
};

export default function ChatbotScreen() {
  const user = useAuthStore((s) => s.user);
  const sessionKey = useRef(`mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const { data: status } = useQuery({
    queryKey: ['chatbot', 'status'],
    queryFn: chatbotApi.status,
  });
  const available = status?.available !== false;

  const send = async () => {
    const text = input.trim();
    if (!text || pending) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setPending(true);
    try {
      const reply = await chatbotApi.send(text, sessionKey.current, user?.id);
      setMessages((m) => [...m, reply]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: (e as Error).message ?? "Erreur — l'assistant est indisponible." },
      ]);
    } finally {
      setPending(false);
    }
  };

  const clear = async () => {
    try {
      await chatbotApi.clear(sessionKey.current);
    } catch {
      // L'historique serveur peut déjà être expiré — on réinitialise localement.
    }
    sessionKey.current = `mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    setMessages([GREETING]);
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-slate-50 dark:bg-slate-900"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View className="flex-row items-center justify-between border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-700 dark:bg-slate-800">
        <View className="flex-row items-center gap-2">
          <View className={`h-2 w-2 rounded-full ${available ? 'bg-success' : 'bg-danger'}`} />
          <Text className="text-sm font-semibold">AutoBot {available ? '· en ligne' : '· indisponible'}</Text>
        </View>
        <View className="flex-row items-center gap-3">
          <Link href="/vocal" asChild>
            <Pressable className="rounded-lg bg-primary/10 p-2">
              <Mic size={18} color="#1A4D8F" />
            </Pressable>
          </Link>
          <Pressable className="rounded-lg bg-slate-100 p-2 dark:bg-slate-700" onPress={clear}>
            <Trash2 size={18} color="#64748B" />
          </Pressable>
        </View>
      </View>

      <FlatList
        ref={listRef}
        className="flex-1"
        contentContainerClassName="p-3 gap-2"
        data={messages}
        keyExtractor={(_, i) => String(i)}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListFooterComponent={
          pending ? (
            <Text className="px-2 text-xs text-slate-400">AutoBot écrit…</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <View className={item.role === 'user' ? 'self-end' : 'self-start'}>
            <Text
              className={`max-w-[280px] rounded-2xl px-3 py-2 text-sm ${
                item.role === 'user'
                  ? 'rounded-br-sm bg-primary text-white'
                  : 'rounded-bl-sm bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100'
              }`}
            >
              {item.content}
            </Text>
          </View>
        )}
      />

      <View className="flex-row items-center gap-2 border-t border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
        <TextInput
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          placeholder="Votre question…"
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => void send()}
          returnKeyType="send"
        />
        <Pressable
          className={`rounded-lg bg-primary p-2.5 ${pending ? 'opacity-50' : ''}`}
          disabled={pending}
          onPress={send}
        >
          <Send size={18} color="white" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
