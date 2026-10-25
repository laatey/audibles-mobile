import React, { useEffect, useRef, useState } from 'react';
import { View, TextInput, Pressable, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useTheme, font } from '@/theme';
import { supabase } from '@/lib/supabase';
import { askKnowledge } from '@/lib/ai';
import { RootStackParams } from '@/navigation';

export default function NewChatScreen() {
  const theme = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const route = useRoute<RouteProp<RootStackParams, 'NewChat'>>();
  const qc = useQueryClient();
  const meetingId = route.params?.meetingId;
  const inputRef = useRef<TextInput>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meetingTitle, setMeetingTitle] = useState<string | null>(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 200); }, []);

  useEffect(() => {
    if (!meetingId) return;
    supabase.from('meetings').select('title').eq('id', meetingId).maybeSingle().then(({ data }) => setMeetingTitle(data?.title ?? null));
  }, [meetingId]);

  async function send() {
    const q = draft.trim();
    if (!q || sending) return;
    setSending(true);
    setError(null);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error('Not signed in');
      const { data: row, error: insErr } = await supabase
        .from('chat_threads')
        .insert({ user_id: uid, title: 'New chat', meeting_id: meetingId ?? null })
        .select('id')
        .single();
      if (insErr) throw insErr;
      await askKnowledge({ threadId: row.id, question: q });
      await qc.invalidateQueries({ queryKey: ['chat-threads'] });
      nav.replace('ChatDetail', { id: row.id });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to send');
      setSending(false);
    }
  }

  const subtitle = meetingId
    ? meetingTitle ? `About: ${meetingTitle}` : 'About this meeting'
    : 'Across all your meetings';

  return (
    <Screen edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderColor: theme.border }}>
          <Pressable onPress={() => nav.goBack()} style={{ flexDirection: 'row', alignItems: 'center', padding: 8 }}>
            <Ionicons name="chevron-back" size={20} color={theme.mutedForeground} />
            <Text style={{ color: theme.mutedForeground, fontSize: 15 }}>{meetingId ? 'Back' : 'Chats'}</Text>
          </Pressable>
          <Text style={{ fontFamily: font.sansSemi, fontSize: 15 }}>New chat</Text>
          <View style={{ width: 48 }} />
        </View>

        <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 60, alignItems: 'center' }}>
          <Text style={{ fontFamily: font.displayBold, fontSize: 18 }}>Ask anything</Text>
          <Text style={{ marginTop: 4, fontSize: 13, color: theme.mutedForeground }}>{subtitle}</Text>
          {error && <Text style={{ marginTop: 12, fontSize: 13, color: theme.destructive }}>{error}</Text>}
        </View>

        <View style={{ borderTopWidth: 1, borderColor: theme.border, padding: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderRadius: 18, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card, paddingHorizontal: 12, paddingVertical: 8 }}>
            <TextInput
              ref={inputRef}
              multiline
              value={draft}
              onChangeText={setDraft}
              placeholder={meetingId ? 'Ask about this meeting…' : 'Ask about your meetings…'}
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
