import React, { useEffect, useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { PageHeader, Section } from '@/components/Layout';
import { useTheme, font } from '@/theme';
import { supabase } from '@/lib/supabase';
import { RootStackParams } from '@/navigation';

type Thread = { id: string; title: string; updated_at: string; meeting_id: string | null; last?: string };

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (now.getTime() - d.getTime() < 6 * 24 * 60 * 60 * 1000) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

async function listGlobalThreads(): Promise<Thread[]> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return [];
  const { data: threads, error } = await supabase
    .from('chat_threads')
    .select('id,title,updated_at,meeting_id')
    .eq('user_id', uid)
    .is('meeting_id', null)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  const ids = (threads ?? []).map((t) => t.id);
  const lastByThread: Record<string, string> = {};
  if (ids.length) {
    const { data: msgs } = await supabase
      .from('chat_messages')
      .select('thread_id,content,created_at')
      .in('thread_id', ids)
      .order('created_at', { ascending: false });
    for (const m of msgs ?? []) if (!lastByThread[m.thread_id]) lastByThread[m.thread_id] = m.content;
  }
  return (threads ?? []).map((t) => ({ ...t, last: lastByThread[t.id] ?? '' }));
}

export default function ChatsScreen() {
  const theme = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const { data: threads, isLoading } = useQuery({ queryKey: ['chat-threads', 'global'], queryFn: listGlobalThreads, staleTime: 15_000 });

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        <PageHeader title="Chats" subtitle="Knowledge base across all meetings" />
        <Section>
          <Pressable
            onPress={() => nav.navigate('NewChat', {})}
            style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card, padding: 16, opacity: pressed ? 0.7 : 1 }]}
          >
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="add" size={18} color={theme.primaryForeground} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: font.sansSemi, fontSize: 15 }}>New chat</Text>
              <Text style={{ fontSize: 13, color: theme.mutedForeground }}>Ask across all your transcripts</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.mutedForeground} />
          </Pressable>
        </Section>

        <Section title="Recent">
          {isLoading ? (
            <View style={{ borderRadius: 18, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card, padding: 24, alignItems: 'center' }}>
              <ActivityIndicator color={theme.mutedForeground} />
            </View>
          ) : threads && threads.length > 0 ? (
            <View style={{ borderRadius: 18, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card, overflow: 'hidden' }}>
              {threads.map((t, i) => (
                <Pressable
                  key={t.id}
                  onPress={() => nav.navigate('ChatDetail', { id: t.id })}
                  style={({ pressed }) => [{ paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: i === 0 ? 0 : 1, borderColor: theme.border, opacity: pressed ? 0.6 : 1, flexDirection: 'row', alignItems: 'center', gap: 12 }]}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: theme.secondary, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="chatbubble-outline" size={16} color={theme.foreground} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontFamily: font.sansSemi, fontSize: 15 }} numberOfLines={1}>{t.title}</Text>
                    <Text style={{ fontSize: 13, color: theme.mutedForeground }} numberOfLines={1}>{t.last || 'No messages yet'}</Text>
                  </View>
                  <Text style={{ fontSize: 12, color: theme.mutedForeground }}>{formatTime(t.updated_at)}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={{ borderRadius: 18, borderWidth: 1, borderStyle: 'dashed', borderColor: theme.border, padding: 28, alignItems: 'center', gap: 8 }}>
              <Ionicons name="chatbubble-outline" size={22} color={theme.mutedForeground} />
              <Text style={{ fontFamily: font.sansSemi, fontSize: 14 }}>No chats yet</Text>
              <Text style={{ fontSize: 12, color: theme.mutedForeground, textAlign: 'center' }}>Start a new chat to ask questions across all your recordings.</Text>
            </View>
          )}
        </Section>
      </ScrollView>
    </Screen>
  );
}
