import React, { useEffect, useState } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useTheme, useThemeContext, font } from '@/theme';
import type { ThemeMode } from '@/theme';
import { supabase } from '@/lib/supabase';
import { RootStackParams } from '@/navigation';

export default function SettingsScreen() {
  const theme = useTheme();
  const { themeMode, setThemeMode } = useThemeContext();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const [email, setEmail] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ''));
  }, []);

  async function choose(t: ThemeMode) {
    await setThemeMode(t);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <Screen edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 }}>
        <Pressable onPress={() => nav.goBack()} style={{ flexDirection: 'row', alignItems: 'center', padding: 8 }}>
          <Ionicons name="chevron-back" size={20} color={theme.mutedForeground} />
          <Text style={{ color: theme.mutedForeground, fontSize: 15 }}>Me</Text>
        </Pressable>
        <Text style={{ fontFamily: font.sansSemi, fontSize: 15 }}>Settings</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 18 }}>
          <Text style={{ fontFamily: font.sansBold, fontSize: 11, color: theme.mutedForeground, letterSpacing: 1.2 }}>ACCOUNT</Text>
          <View style={{ marginTop: 8, borderRadius: 18, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card, padding: 16 }}>
            <Text style={{ fontSize: 13, color: theme.mutedForeground }}>Signed in as</Text>
            <Text style={{ marginTop: 2, fontFamily: font.sansSemi, fontSize: 15 }} numberOfLines={1}>{email || '—'}</Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: 20, paddingTop: 22 }}>
          <Text style={{ fontFamily: font.sansBold, fontSize: 11, color: theme.mutedForeground, letterSpacing: 1.2 }}>APPEARANCE</Text>
          <View style={{ marginTop: 8, flexDirection: 'row', gap: 6, borderRadius: 18, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card, padding: 4 }}>
            {([{ v: 'system', icon: 'phone-portrait-outline' as const, label: 'System' }, { v: 'light', icon: 'sunny-outline' as const, label: 'Light' }, { v: 'dark', icon: 'moon-outline' as const, label: 'Dark' }] as const).map(({ v, icon, label }) => {
              const active = themeMode === v;
              return (
                <Pressable
                  key={v}
                  onPress={() => choose(v as ThemeMode)}
                  style={({ pressed }) => [{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: active ? theme.secondary : 'transparent', opacity: pressed ? 0.7 : 1 }]}
                >
                  <Ionicons name={icon} size={18} color={active ? theme.foreground : theme.mutedForeground} />
                  <Text style={{ marginTop: 4, fontSize: 12, fontFamily: font.sansSemi, color: active ? theme.foreground : theme.mutedForeground }}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ paddingHorizontal: 20, paddingTop: 22 }}>
          <Pressable
            onPress={signOut}
            style={({ pressed }) => [{ borderRadius: 18, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, opacity: pressed ? 0.7 : 1 }]}
          >
            <Ionicons name="log-out-outline" size={16} color={theme.destructive} />
            <Text style={{ color: theme.destructive, fontFamily: font.sansSemi, fontSize: 15 }}>Sign out</Text>
          </Pressable>
        </View>

        <Text style={{ textAlign: 'center', marginTop: 28, fontSize: 12, color: theme.mutedForeground }}>Audibles · v1.0.0</Text>
      </ScrollView>
    </Screen>
  );
}

