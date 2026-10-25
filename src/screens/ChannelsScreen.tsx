import React, { useCallback, useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { PageHeader, Section } from '@/components/Layout';
import { useTheme, font } from '@/theme';
import { supabase } from '@/lib/supabase';
import { RootStackParams } from '@/navigation';

const API_KEY = process.env.EXPO_PUBLIC_LOVABLE_API_KEY ?? '';
const AI_BASE = 'https://ai.gateway.lovable.dev/v1';

type HighlightKind = 'quote' | 'action' | 'decision';

type Highlight = {
  kind: HighlightKind;
  text: string;
  meetingTitle: string;
  meetingId: string;
};

const KIND_META: Record<HighlightKind, { icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  quote: { icon: 'chatbubble-ellipses-outline', label: 'Key Quote' },
  action: { icon: 'checkmark-circle-outline', label: 'Action Item' },
  decision: { icon: 'flag-outline', label: 'Decision' },
};

async function fetchHighlights(): Promise<Highlight[]> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return [];

  const { data: meetings } = await supabase
    .from('meetings')
    .select('id,title,transcript')
    .eq('user_id', uid)
    .eq('status', 'ready')
    .not('transcript', 'is', null)
    .order('created_at', { ascending: false })
    .limit(10);

  if (!meetings || meetings.length === 0) return [];

  const kb = meetings
    .filter((m) => m.transcript?.trim())
    .map((m) => `--- "${m.title}" (id:${m.id}) ---\n${(m.transcript ?? '').slice(0, 3000)}`)
    .join('\n\n');

  if (!API_KEY || !kb) return [];

  const res = await fetch(`${AI_BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'system',
          content:
            'You are an assistant that extracts highlights from meeting transcripts. ' +
            'Respond with ONLY a JSON array. Each item must have: ' +
            '{ "kind": "quote"|"action"|"decision", "text": "...", "meetingTitle": "...", "meetingId": "..." }. ' +
            'Extract up to 12 items total. No markdown, no explanation.',
        },
        {
          role: 'user',
          content: `Extract the most important key quotes, action items, and decisions from these transcripts:\n\n${kb}`,
        },
      ],
    }),
  });

  if (!res.ok) return [];

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = (json.choices?.[0]?.message?.content ?? '').replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(raw) as Highlight[];
  } catch {
    return [];
  }
}

const FILTERS: { label: string; value: HighlightKind | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Quotes', value: 'quote' },
  { label: 'Actions', value: 'action' },
  { label: 'Decisions', value: 'decision' },
];

export default function HighlightsScreen() {
  const theme = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<HighlightKind | 'all'>('all');
  const [refreshing, setRefreshing] = useState(false);

  const { data: highlights = [], isLoading } = useQuery({
    queryKey: ['highlights'],
    queryFn: fetchHighlights,
    staleTime: 5 * 60_000,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await qc.invalidateQueries({ queryKey: ['highlights'] });
    setRefreshing(false);
  }, [qc]);

  const filtered = filter === 'all' ? highlights : highlights.filter((h) => h.kind === filter);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.mutedForeground} />}
      >
        <PageHeader title="Highlights" subtitle="Key moments from your meetings" />

        {/* Filter pills */}
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 8 }}>
          {FILTERS.map(({ label, value }) => {
            const active = filter === value;
            return (
              <Pressable
                key={value}
                onPress={() => setFilter(value)}
                style={({ pressed }) => [{
                  paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
                  backgroundColor: active ? theme.primary : theme.card,
                  borderWidth: 1, borderColor: active ? theme.primary : theme.border,
                  opacity: pressed ? 0.7 : 1,
                }]}
              >
                <Text style={{ fontSize: 13, fontFamily: font.sansSemi, color: active ? theme.primaryForeground : theme.mutedForeground }}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {isLoading ? (
          <View style={{ marginTop: 60, alignItems: 'center', gap: 12 }}>
            <ActivityIndicator color={theme.primary} />
            <Text style={{ fontSize: 13, color: theme.mutedForeground }}>Extracting highlights with AI…</Text>
          </View>
        ) : filtered.length === 0 ? (
          <Section>
            <View style={{ borderRadius: 20, borderWidth: 1, borderStyle: 'dashed', borderColor: theme.border, padding: 32, alignItems: 'center', gap: 10 }}>
              <Ionicons name="sparkles-outline" size={28} color={theme.mutedForeground} />
              <Text style={{ fontFamily: font.sansSemi, fontSize: 14, color: theme.foreground }}>No highlights yet</Text>
              <Text style={{ fontSize: 13, color: theme.mutedForeground, textAlign: 'center' }}>
                Record or upload meetings to start seeing AI-extracted highlights here.
              </Text>
            </View>
          </Section>
        ) : (
          <Section>
            <View style={{ gap: 10 }}>
              {filtered.map((h, i) => {
                const meta = KIND_META[h.kind];
                const kindColor = h.kind === 'action' ? theme.success : h.kind === 'decision' ? theme.primary : theme.foreground;
                return (
                  <Pressable
                    key={i}
                    onPress={() => nav.navigate('TranscriptionDetail', { id: h.meetingId })}
                    style={({ pressed }) => [{
                      borderRadius: 18, borderWidth: 1, borderColor: theme.border,
                      backgroundColor: theme.card, padding: 16, opacity: pressed ? 0.7 : 1, gap: 8,
                    }]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{
                        width: 26, height: 26, borderRadius: 8,
                        backgroundColor: h.kind === 'action' ? '#dcfce7' : h.kind === 'decision' ? '#dbeafe' : theme.secondary,
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Ionicons name={meta.icon} size={13} color={kindColor} />
                      </View>
                      <Text style={{ fontSize: 11, fontFamily: font.sansBold, color: kindColor, letterSpacing: 0.8 }}>
                        {meta.label.toUpperCase()}
                      </Text>
                      <View style={{ flex: 1 }} />
                      <Text style={{ fontSize: 11, color: theme.mutedForeground }} numberOfLines={1}>{h.meetingTitle}</Text>
                    </View>
                    <Text style={{ fontSize: 15, lineHeight: 22, color: theme.foreground }}>
                      {h.kind === 'quote' ? `"${h.text}"` : h.text}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Section>
        )}
      </ScrollView>
    </Screen>
  );
}

