import { useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { messagingApi } from '@autoparts/api';
import { formatDateTime } from '@autoparts/utils';
import { useAuthStore } from '../../src/store/auth.store';
import type { Message } from '@autoparts/types';

export default function ThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [text, setText] = useState('');

  const { data: thread = [] } = useQuery({
    queryKey: ['messages', 'thread', id],
    queryFn: () => messagingApi.thread(id!),
    enabled: Boolean(id),
  });

  const send = useMutation({
    mutationFn: () => messagingApi.send({ recipientId: id!, body: text }),
    onSuccess: () => {
      setText('');
      void qc.invalidateQueries({ queryKey: ['messages'] });
    },
  });

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-slate-50 dark:bg-slate-900"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <FlatList
        contentContainerClassName="p-3 gap-2"
        data={thread}
        keyExtractor={(m) => m.id}
        renderItem={({ item }: { item: Message }) => (
          <View
            className={`max-w-[80%] rounded-xl px-3 py-2 ${
              item.senderId === user?.id ? 'ml-auto bg-primary' : 'bg-slate-200 dark:bg-slate-700'
            }`}
          >
            <Text className={`text-sm ${item.senderId === user?.id ? 'text-white' : 'text-slate-800 dark:text-slate-100'}`}>
              {item.body}
            </Text>
            <Text className={`mt-0.5 text-[9px] ${item.senderId === user?.id ? 'text-white/70' : 'text-slate-400'}`}>
              {formatDateTime(item.createdAt)}
            </Text>
          </View>
        )}
      />
      <View className="flex-row gap-2 border-t border-slate-200 p-3 dark:border-slate-700">
        <TextInput
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          placeholder="Votre message…"
          value={text}
          onChangeText={setText}
        />
        <Pressable
          className="rounded-lg bg-accent px-4 py-2.5 disabled:opacity-40"
          disabled={!text.trim() || send.isPending}
          onPress={() => send.mutate()}
        >
          <Text className="font-semibold text-white">Envoyer</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
