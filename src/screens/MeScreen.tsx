import React, { useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator, Image, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { decode as decodeB64 } from 'base64-arraybuffer';
import * as Haptics from 'expo-haptics';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { PageHeader, Section } from '@/components/Layout';
import { useTheme, font } from '@/theme';
import { supabase } from '@/lib/supabase';
import { RootStackParams } from '@/navigation';

async function fetchProfile() {
  const { data } = await supabase.auth.getUser();
  const u = data.user;
  if (!u) return null;
  const meta = u.user_metadata as { avatar_path?: string; name?: string } | null;
  const name = meta?.name ?? '';
  const avatarPath = meta?.avatar_path ?? null;
  let avatarUrl: string | null = null;
  if (avatarPath) {
    const { data: signed } = await supabase.storage.from('avatars').createSignedUrl(avatarPath, 3600);
    avatarUrl = signed?.signedUrl ?? null;
  }
  const [{ data: meetings }, { count: chatCount }] = await Promise.all([
    supabase.from('meetings').select('duration_seconds').eq('user_id', u.id),
    supabase.from('chat_threads').select('id', { count: 'exact', head: true }).eq('user_id', u.id),
  ]);
  const totalSec = (meetings ?? []).reduce((s, m) => s + (m.duration_seconds ?? 0), 0);
  return {
    userId: u.id,
    email: u.email ?? '',
    name: name || u.email?.split('@')[0] || 'User',
    joined: u.created_at ? new Date(u.created_at).toLocaleDateString([], { month: 'long', year: 'numeric' }) : '',
    avatarUrl,
    stats: {
      meetings: meetings?.length ?? 0,
      minutes: Math.round(totalSec / 60),
      chats: chatCount ?? 0,
    },
  };
}

export default function MeScreen() {
  const theme = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const { data: profile } = useQuery({ queryKey: ['me-profile'], queryFn: fetchProfile, staleTime: 30_000 });

  async function pickAvatar() {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7, allowsEditing: true, aspect: [1, 1] });
    if (res.canceled) return;
    const asset = res.assets[0];
    setUploading(true);
    try {
      const { data: ures } = await supabase.auth.getUser();
      const uid = ures.user?.id;
      if (!uid) throw new Error('Not signed in');
      const ext = (asset.uri.split('.').pop() || 'jpg').toLowerCase();
      const path = `${uid}/avatar-${Date.now()}.${ext}`;
      const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      const bytes = decodeB64(base64);
      const { error } = await supabase.storage.from('avatars').upload(path, bytes, { upsert: true, contentType: asset.mimeType || `image/${ext}` });
      if (error) throw error;
      const { error: uerr } = await supabase.auth.updateUser({ data: { avatar_path: path } });
      if (uerr) throw uerr;
      await qc.invalidateQueries({ queryKey: ['me-profile'] });
    } catch (e: unknown) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setUploading(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  const initial = (profile?.name?.[0] ?? profile?.email?.[0] ?? 'U').toUpperCase();

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        <PageHeader title="Me" />
        <Section>
          <View style={{ alignItems: 'center', paddingVertical: 12, gap: 12 }}>
            <Pressable onPress={pickAvatar} style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}>
              <View style={{ width: 80, height: 80, borderRadius: 40, overflow: 'hidden', backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' }}>
                {profile?.avatarUrl ? (
                  <Image source={{ uri: profile.avatarUrl }} style={{ width: '100%', height: '100%' }} />
                ) : (
                  <Text style={{ color: theme.primaryForeground, fontFamily: font.displayBold, fontSize: 32 }}>{initial}</Text>
                )}
              </View>
              <View style={{ position: 'absolute', right: -2, bottom: -2, width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: theme.background, backgroundColor: theme.foreground, alignItems: 'center', justifyContent: 'center' }}>
                {uploading ? <ActivityIndicator size="small" color={theme.background} /> : <Ionicons name="camera" size={12} color={theme.background} />}
              </View>
            </Pressable>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontFamily: font.sansSemi, fontSize: 17, textTransform: 'capitalize' }}>{profile?.name || '—'}</Text>
              {!!profile?.email && <Text style={{ fontSize: 13, color: theme.mutedForeground, marginTop: 2 }}>{profile.email}</Text>}
              {!!profile?.joined && <Text style={{ fontSize: 11, color: theme.mutedForeground, marginTop: 4 }}>Member since {profile.joined}</Text>}
            </View>
          </View>
        </Section>

        <Section>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <StatCard icon="mic-outline" value={profile?.stats.meetings ?? 0} label="Recordings" />
            <StatCard icon="time-outline" value={profile?.stats.minutes ?? 0} label="Minutes" />
            <StatCard icon="chatbubble-outline" value={profile?.stats.chats ?? 0} label="Chats" />
          </View>
        </Section>

        <Section>
          <Pressable onPress={() => nav.navigate('Settings')} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card, padding: 16, opacity: pressed ? 0.7 : 1 }]}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: theme.secondary, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="settings-outline" size={16} color={theme.foreground} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: font.sansSemi, fontSize: 15 }}>Settings</Text>
              <Text style={{ fontSize: 12, color: theme.mutedForeground }}>Appearance, account</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.mutedForeground} />
          </Pressable>
        </Section>

        <Section>
          <Pressable onPress={signOut} style={({ pressed }) => [{ borderRadius: 18, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, opacity: pressed ? 0.6 : 1 }]}>
            <Ionicons name="log-out-outline" size={16} color={theme.destructive} />
            <Text style={{ color: theme.destructive, fontFamily: font.sansSemi, fontSize: 15 }}>Sign out</Text>
          </Pressable>
          <Text style={{ textAlign: 'center', marginTop: 18, fontSize: 11, color: theme.mutedForeground }}>Audibles · v1.0</Text>
        </Section>
      </ScrollView>
    </Screen>
  );
}

function StatCard({ icon, value, label }: { icon: keyof typeof Ionicons.glyphMap; value: number; label: string }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 4, borderRadius: 18, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card, paddingVertical: 16 }}>
      <Ionicons name={icon} size={16} color={theme.mutedForeground} />
      <Text style={{ fontFamily: font.displayBold, fontSize: 20 }}>{value}</Text>
      <Text style={{ fontSize: 11, color: theme.mutedForeground }}>{label}</Text>
    </View>
  );
}
