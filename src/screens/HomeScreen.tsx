import React, { useEffect, useState } from 'react';
import { View, FlatList, Pressable, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { decode as decodeB64 } from 'base64-arraybuffer';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useTheme, font } from '@/theme';
import { supabase } from '@/lib/supabase';
import { transcribeMeeting } from '@/lib/ai';
import { RootStackParams } from '@/navigation';

type Meeting = {
  id: string;
  title: string;
  summary: string | null;
  transcript: string | null;
  status: string;
  created_at: string;
};

function timeAgo(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function HomeScreen() {
  const theme = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const qc = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      setUserId(u.id);
      const meta = u.user_metadata as { name?: string } | undefined;
      setUserName(meta?.name || u.email?.split('@')[0] || 'there');
    });
  }, []);

  const { data: meetings = [] } = useQuery({
    queryKey: ['meetings', userId],
    enabled: !!userId,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meetings')
        .select('id,title,summary,transcript,status,created_at')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw new Error(error.message);
      return (data ?? []) as Meeting[];
    },
  });

  useEffect(() => {
    if (!userId) return;
    const anyProcessing = meetings.some((m) => m.status === 'processing');
    if (!anyProcessing) return;
    const i = setInterval(() => qc.invalidateQueries({ queryKey: ['meetings', userId] }), 4000);
    return () => clearInterval(i);
  }, [meetings, userId, qc]);

  async function pickAndUpload() {
    if (!userId) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setUploading(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
      if (res.canceled) return;
      const asset = res.assets[0];
      const uri = asset.uri;
      const mime = asset.mimeType || 'audio/mpeg';
      const ext = (asset.name?.split('.').pop() || 'mp3').toLowerCase();
      const path = `${userId}/${Date.now()}.${ext}`;
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const bytes = decodeB64(base64);
      const { error: upErr } = await supabase.storage.from('audio').upload(path, bytes, { contentType: mime });
      if (upErr) throw upErr;
      const { data: row, error: insErr } = await supabase
        .from('meetings')
        .insert({ user_id: userId, title: asset.name?.replace(/\.[^.]+$/, '') ?? 'Recording', audio_path: path, status: 'processing' })
        .select('id')
        .single();
      if (insErr) throw insErr;
      await qc.invalidateQueries({ queryKey: ['meetings', userId] });
      await transcribeMeeting({ meetingId: row.id, audioBase64: base64, mimeType: mime });
      await qc.invalidateQueries({ queryKey: ['meetings', userId] });
    } catch (e: unknown) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setUploading(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await qc.invalidateQueries({ queryKey: ['meetings', userId] });
    setRefreshing(false);
  }

  return (
    <Screen>
      <FlatList
        data={meetings}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.mutedForeground} />}
        ListHeaderComponent={
          <View>
            <View style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: font.displayBold, fontSize: 22, color: theme.foreground }}>Audibles</Text>
              <Pressable
                onPress={pickAndUpload}
                disabled={uploading}
                style={({ pressed }) => [{ width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card, alignItems: 'center', justifyContent: 'center', opacity: uploading || pressed ? 0.6 : 1 }]}
              >
                {uploading ? <ActivityIndicator size="small" color={theme.foreground} /> : <Ionicons name="cloud-upload-outline" size={16} color={theme.foreground} />}
              </Pressable>
            </View>
            <View style={{ paddingHorizontal: 24 }}>
              <Text style={{ fontSize: 14, color: theme.mutedForeground, marginBottom: 6 }}>Welcome,</Text>
              <Text style={{ fontFamily: font.displayBold, fontSize: 32, color: theme.foreground, textTransform: 'capitalize' }}>{userName}</Text>
            </View>
            <View style={{ paddingHorizontal: 24, paddingTop: 28, paddingBottom: 8 }}>
              <Text style={{ fontSize: 11, color: theme.mutedForeground, fontFamily: font.sansBold, letterSpacing: 1.4 }}>RECENT</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={{ marginHorizontal: 24, marginTop: 12, borderRadius: 20, borderWidth: 1, borderColor: theme.border, borderStyle: 'dashed', padding: 28, alignItems: 'center' }}>
            <Text style={{ fontFamily: font.sansSemi, fontSize: 14, color: theme.foreground }}>No recordings yet</Text>
            <Text style={{ fontSize: 13, color: theme.mutedForeground, marginTop: 4, textAlign: 'center' }}>Tap the mic button below to record one.</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <Pressable
            onPress={() => nav.navigate('TranscriptionDetail', { id: item.id })}
            style={({ pressed }) => [{ paddingHorizontal: 24, paddingVertical: 16, borderTopWidth: index === 0 ? 0 : 1, borderColor: theme.border, opacity: pressed ? 0.6 : 1, flexDirection: 'row', alignItems: 'center', gap: 12 }]}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontFamily: font.sansSemi, fontSize: 15, color: theme.foreground }} numberOfLines={1}>{item.title}</Text>
              <Text style={{ fontSize: 13, color: theme.mutedForeground, marginTop: 4 }} numberOfLines={4}>
                {item.status === 'processing' ? 'Transcribing…' : item.summary || item.transcript || 'No transcript yet.'}
              </Text>
              <Text style={{ fontSize: 12, color: theme.mutedForeground, marginTop: 6, opacity: 0.7 }}>{timeAgo(item.created_at)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.mutedForeground} />
          </Pressable>
        )}
      />

      <Pressable
        onPress={async () => { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); (nav as unknown as { navigate: (n: string) => void }).navigate('Live'); }}
        style={({ pressed }) => [{
          position: 'absolute',
          right: 24,
          bottom: 110,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: theme.primary,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ scale: pressed ? 0.95 : 1 }],
          shadowColor: '#000',
          shadowOpacity: 0.15,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        }]}
      >
        <Ionicons name="mic" size={22} color={theme.primaryForeground} />
      </Pressable>
    </Screen>
  );
}
