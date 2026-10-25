import React, { useEffect, useRef, useState } from 'react';
import { View, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useTheme, font } from '@/theme';
import { supabase } from '@/lib/supabase';
import { askKnowledge } from '@/lib/ai';
import { RootStackParams } from '@/navigation';

type Msg = { id?: string; role: 'user' | 'assistant'; content: string };

export default function ChatDetailScreen() {
  const theme = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const route = useRoute<RouteProp<RootStackParams, 'ChatDetail'>>();
  const id = route.params.id;
  const qc = useQueryClient();
  const scrollRef = useRef<ScrollView>(null);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<Msg[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['chat-thread', id],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      const { data: thread } = await supabase
        .from('chat_threads')
        .select('id,title,meeting_id')
        .eq('id', id)
        .eq('user_id', uid ?? '')
        .maybeSingle();
      if (!thread) throw new Error('Not found');
      const { data: messages } = await supabase
        .from('chat_messages')
        .select('id,role,content,created_at')
        .eq('thread_id', id)
        .order('created_at', { ascending: true });
      return { thread, messages: messages ?? [] };
    },
  });

  const serverMessages: Msg[] = (data?.messages ?? []).map((m: { id: string; role: string; content: string }) => ({
    id: m.id,
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }));
  const messages: Msg[] = [...serverMessages, ...pending];

  useEffect(() => { setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100); }, [messages.length, sending]);

  async function send() {
    const q = draft.trim();
    if (!q || sending) return;
    setDraft('');
    setError(null);
    setSending(true);
    setPending([{ role: 'user', content: q }]);
    try {
      await askKnowledge({ threadId: id, question: q });
      setPending([]);
      await qc.invalidateQueries({ queryKey: ['chat-thread', id] });
      await qc.invalidateQueries({ queryKey: ['chat-threads'] });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to send');
      setPending([]);
    } finally {
      setSending(false);
    }
  }

  function handleDelete() {
    Alert.alert('Delete chat?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          const meetingId = data?.thread.meeting_id;
          const { data: u } = await supabase.auth.getUser();
          await supabase.from('chat_threads').delete().eq('id', id).eq('user_id', u.user?.id ?? '');
          await qc.invalidateQueries({ queryKey: ['chat-threads'] });
          if (meetingId) nav.replace('TranscriptionDetail', { id: meetingId });
          else nav.goBack();
        },
      },
    ]);
  }

  return (
    <Screen edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderColor: theme.border }}>
          <Pressable onPress={() => nav.goBack()} style={{ flexDirection: 'row', alignItems: 'center', padding: 8 }}>
            <Ionicons name="chevron-back" size={20} color={theme.mutedForeground} />
            <Text style={{ color: theme.mutedForeground, fontSize: 15 }}>{data?.thread.meeting_id ? 'Back' : 'Chats'}</Text>
          </Pressable>
          <Text style={{ fontFamily: font.sansSemi, fontSize: 15, flex: 1, textAlign: 'center' }} numberOfLines={1}>{data?.thread.title ?? 'Chat'}</Text>
          <Pressable onPress={handleDelete} style={{ padding: 8 }}>
            <Ionicons name="trash-outline" size={18} color={theme.mutedForeground} />
          </Pressable>
        </View>

        <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 20, gap: 16 }}>
          {messages.length === 0 && !sending && (
            <View style={{ marginTop: 32, alignItems: 'center' }}>
              <Text style={{ fontFamily: font.sansSemi, fontSize: 15 }}>Ask anything</Text>
              <Text style={{ marginTop: 4, fontSize: 13, color: theme.mutedForeground }}>Audibles will search across your meetings.</Text>
            </View>
          )}
          {messages.map((m, i) => m.role === 'user' ? (
            <View key={i} style={{ alignSelf: 'flex-end', maxWidth: '85%' }}>
              <View style={{ backgroundColor: theme.primary, borderRadius: 18, borderBottomRightRadius: 6, paddingHorizontal: 14, paddingVertical: 10 }}>
                <Text style={{ color: theme.primaryForeground, fontSize: 15 }}>{m.content}</Text>
              </View>
            </View>
          ) : (
            <View key={i} style={{ maxWidth: '92%' }}>
              <Text style={{ fontSize: 11, color: theme.mutedForeground, fontFamily: font.sansBold, letterSpacing: 1.2, marginBottom: 4 }}>AUDIBLES</Text>
              <Text style={{ color: theme.foreground, fontSize: 15, lineHeight: 22 }}>{m.content}</Text>
            </View>
          ))}
          {sending && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ActivityIndicator size="small" color={theme.mutedForeground} />
              <Text style={{ fontSize: 13, color: theme.mutedForeground }}>Thinking…</Text>
            </View>
          )}
          {error && <Text style={{ fontSize: 13, color: theme.destructive }}>{error}</Text>}
        </ScrollView>

        <View style={{ borderTopWidth: 1, borderColor: theme.border, padding: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderRadius: 18, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card, paddingHorizontal: 12, paddingVertical: 8 }}>
            <TextInput
              multiline
              value={draft}
              onChangeText={setDraft}
              placeholder="Ask about your meetings…"
              placeholderTextColor={theme.mutedForeground}
              style={{ flex: 1, color: theme.foreground, fontSize: 15, fontFamily: 'Manrope_500Medium', maxHeight: 120, paddingVertical: 6 }}
            />
            <Pressable
              onPress={send}
              disabled={!draft.trim() || sending}
              style={({ pressed }) => [{ width: 34, height: 34, borderRadius: 17, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', opacity: !draft.trim() || sending || pressed ? 0.5 : 1 }]}
            >
              {sending ? <ActivityIndicator size="small" color={theme.primaryForeground} /> : <Ionicons name="arrow-up" size={18} color={theme.primaryForeground} />}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
