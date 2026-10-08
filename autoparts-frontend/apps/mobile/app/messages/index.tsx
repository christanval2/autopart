import { useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { messagingApi } from '@autoparts/api';
import { formatDateTime } from '@autoparts/utils';
import { useAuthStore } from '../../src/store/auth.store';
import type { Message } from '@autoparts/types';

export default function MessagesScreen() {
  const { user, isAuthenticated } = useAuthStore();

  const { data: inbox = [] } = useQuery({
    queryKey: ['messages', 'inbox'],
    queryFn: messagingApi.inbox,
    enabled: isAuthenticated,
  });

  const conversations = new Map<string, Message>();
  for (const m of inbox) {
    const other = m.senderId === user?.id ? m.recipientId : m.senderId;
    if (!conversations.has(other)) conversations.set(other, m);
  }

  if (!isAuthenticated) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 dark:bg-slate-900">
        <Text className="text-sm text-slate-400">Connectez-vous pour voir vos messages.</Text>
      </View>
    );
  }

  return (
    <FlatList
      className="flex-1 bg-slate-50 dark:bg-slate-900"
      contentContainerClassName="p-3 gap-2"
      data={Array.from(conversations.entries())}
      keyExtractor={([otherId]) => otherId}
      ListEmptyComponent={<Text className="py-16 text-center text-sm text-slate-400">Aucun message.</Text>}
      renderItem={({ item: [otherId, last] }) => (
        <Pressable
          className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800"
          onPress={() => router.push({ pathname: '/messages/[id]', params: { id: otherId } })}
        >
          <Text className="font-semibold">{last.sender?.firstName ? `${last.sender.firstName} ${last.sender.lastName}` : otherId.slice(0, 8)}</Text>
          <Text className="mt-0.5 text-xs text-slate-400" numberOfLines={1}>
            {last.body}
          </Text>
          <Text className="mt-1 text-[10px] text-slate-400">{formatDateTime(last.createdAt)}</Text>
        </Pressable>
      )}
    />
  );
}
