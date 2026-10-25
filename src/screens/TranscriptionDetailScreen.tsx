import React, { useEffect, useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useTheme, font } from '@/theme';
import { supabase } from '@/lib/supabase';
import { RootStackParams } from '@/navigation';

type Tab = 'summary' | 'transcript' | 'chat';

type Meeting = { id: string; title: string; transcript: string | null; summary: string | null; status: string; created_at: string };

export default function TranscriptionDetailScreen() {
  const theme = useTheme();
  const route = useRoute<RouteProp<RootStackParams, 'TranscriptionDetail'>>();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const id = route.params.id;
  const [tab, setTab] = useState<Tab>('summary');

  const { data: meeting, refetch } = useQuery({
    queryKey: ['meeting', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meetings')
        .select('id,title,transcript,summary,status,created_at')
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as Meeting | null;
    },
  });

  useEffect(() => {
    if (meeting?.status !== 'processing') return;
    const i = setInterval(() => refetch(), 4000);
    return () => clearInterval(i);
  }, [meeting?.status, refetch]);

  return (
    <Screen edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 }}>
        <Pressable onPress={() => nav.goBack()} style={{ flexDirection: 'row', alignItems: 'center', padding: 8 }}>
          <Ionicons name="chevron-back" size={20} color={theme.mutedForeground} />
          <Text style={{ color: theme.mutedForeground, fontSize: 15 }}>Home</Text>
        </Pressable>
        <Pressable style={{ padding: 8 }}>
          <Ionicons name="share-outline" size={20} color={theme.mutedForeground} />
        </Pressable>
      </View>
      <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
        <Text style={{ fontSize: 11, fontFamily: font.sansBold, color: theme.mutedForeground, letterSpacing: 1.2 }}>
          {meeting ? new Date(meeting.created_at).toLocaleString() : ''}
        </Text>
        <Text style={{ marginTop: 4, fontFamily: font.displayBold, fontSize: 24, color: theme.foreground }}>
          {meeting?.title || 'Loading…'}
        </Text>
        {meeting?.status === 'processing' && <Text style={{ marginTop: 4, fontSize: 13, color: theme.mutedForeground }}>Transcribing audio…</Text>}
      </View>

      <View style={{ flexDirection: 'row', marginHorizontal: 20, marginTop: 16, padding: 4, borderRadius: 12, backgroundColor: theme.secondary }}>
        {(['summary', 'transcript', 'chat'] as Tab[]).map((t) => {
          const active = tab === t;
          return (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              style={({ pressed }) => [{ flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10, backgroundColor: active ? theme.card : 'transparent', opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={{ fontSize: 13, fontFamily: font.sansSemi, color: active ? theme.foreground : theme.mutedForeground, textTransform: 'capitalize' }}>{t}</Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
        {tab === 'summary' && (
          <Text style={{ fontSize: 15, lineHeight: 22, color: theme.foreground }}>
            {meeting?.summary || (meeting?.status === 'processing' ? 'Working on it…' : 'No summary available.')}
          </Text>
        )}
        {tab === 'transcript' && (
          <Text style={{ fontSize: 15, lineHeight: 22, color: theme.foreground }}>
            {meeting?.transcript || (meeting?.status === 'processing' ? 'Working on it…' : 'No transcript available.')}
          </Text>
        )}
        {tab === 'chat' && <MeetingChatList meetingId={id} ready={meeting?.status === 'ready'} />}
      </ScrollView>
    </Screen>
  );
}

function MeetingChatList({ meetingId, ready }: { meetingId: string; ready: boolean | undefined }) {
  const theme = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParams>>();

  const { data: threads, isLoading } = useQuery({
    queryKey: ['chat-threads', 'meeting', meetingId],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      const { data: th } = await supabase
        .from('chat_threads')
        .select('id,title,updated_at')
        .eq('user_id', uid ?? '')
        .eq('meeting_id', meetingId)
        .order('updated_at', { ascending: false });
      const ids = (th ?? []).map((t) => t.id);
      const lastByThread: Record<string, string> = {};
      if (ids.length) {
        const { data: msgs } = await supabase
          .from('chat_messages')
          .select('thread_id,content,created_at')
          .in('thread_id', ids)
          .order('created_at', { ascending: false });
        for (const m of msgs ?? []) if (!lastByThread[m.thread_id]) lastByThread[m.thread_id] = m.content;
      }
      return (th ?? []).map((t) => ({ ...t, last: lastByThread[t.id] ?? '' }));
    },
    staleTime: 15_000,
  });

  return (
    <View style={{ gap: 16 }}>
      {!ready && (
        <View style={{ borderRadius: 14, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card, padding: 14 }}>
          <Text style={{ fontSize: 13, color: theme.mutedForeground }}>Chat will be available once transcription finishes.</Text>
        </View>
      )}

      <Pressable
        disabled={!ready}
        onPress={() => nav.navigate('NewChat', { meetingId })}
        style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card, padding: 16, opacity: !ready ? 0.5 : pressed ? 0.7 : 1 }]}
      >
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="add" size={18} color={theme.primaryForeground} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: font.sansSemi, fontSize: 15 }}>New chat</Text>
          <Text style={{ fontSize: 13, color: theme.mutedForeground }}>Ask about this meeting</Text>
        </View>
        {ready && <Ionicons name="chevron-forward" size={16} color={theme.mutedForeground} />}
      </Pressable>

      <View>
        <Text style={{ fontSize: 11, fontFamily: font.sansBold, color: theme.mutedForeground, letterSpacing: 1.2, marginBottom: 8 }}>CONVERSATIONS</Text>
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
                <Text style={{ fontSize: 12, color: theme.mutedForeground }}>{new Date(t.updated_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={{ borderRadius: 18, borderWidth: 1, borderStyle: 'dashed', borderColor: theme.border, padding: 24, alignItems: 'center', gap: 8 }}>
            <Ionicons name="chatbubble-outline" size={22} color={theme.mutedForeground} />
            <Text style={{ fontSize: 13, color: theme.mutedForeground }}>No conversations yet for this meeting.</Text>
          </View>
        )}
      </View>
    </View>
  );
}
