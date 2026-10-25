import React, { useState } from 'react';
import { View, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useTheme, font, radius } from '@/theme';
import { Text } from '@/components/Text';

export default function AuthScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name } },
        });
        if (error) throw error;
        
        if (!data.session) {
          Alert.alert(
            'Check Your Email',
            'We have sent a verification link to your email address. Please verify your account, then sign in.',
            [{ text: 'OK', onPress: () => {
              setPassword('');
              setMode('signin');
            }}]
          );
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
          <View style={{ marginBottom: 28 }}>
            <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="mic" size={22} color={theme.primaryForeground} />
            </View>
            <Text style={{ marginTop: 22, fontFamily: font.displayBold, fontSize: 28, color: theme.foreground }}>
              {mode === 'signin' ? 'Welcome back' : 'Create your account'}
            </Text>
            <Text style={{ marginTop: 6, fontSize: 15, color: theme.mutedForeground }}>
              {mode === 'signin' ? 'Sign in to continue to Audibles.' : 'Start transcribing in seconds.'}
            </Text>
          </View>

          {mode === 'signup' && (
            <Field label="Name" value={name} onChangeText={setName} placeholder="Jane Cooper" />
          )}
          <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@company.com" keyboardType="email-address" autoCapitalize="none" />
          <Field label="Password" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry />

          {error && <Text style={{ marginTop: 6, color: theme.destructive, fontSize: 13 }}>{error}</Text>}

          <Pressable
            disabled={loading}
            onPress={submit}
            style={({ pressed }) => [{
              marginTop: 14,
              height: 50,
              borderRadius: 14,
              backgroundColor: theme.primary,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: loading || pressed ? 0.7 : 1,
            }]}
          >
            <Text style={{ color: theme.primaryForeground, fontFamily: font.sansSemi, fontSize: 15 }}>
              {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </Text>
          </Pressable>

          <View style={{ alignItems: 'center', marginTop: 24 }}>
            <Pressable onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
              <Text style={{ fontSize: 13, color: theme.mutedForeground }}>
                {mode === 'signin' ? "Don't have an account? " : 'Already have one? '}
                <Text style={{ color: theme.foreground, fontFamily: font.sansSemi }}>
                  {mode === 'signin' ? 'Sign up' : 'Sign in'}
                </Text>
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const theme = useTheme();
  const { label, ...rest } = props;
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ marginBottom: 6, marginLeft: 4, fontSize: 12, color: theme.mutedForeground, fontFamily: font.sansSemi }}>{label}</Text>
      <TextInput
        {...rest}
        placeholderTextColor={theme.mutedForeground}
        style={{
          height: 48,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: theme.border,
          backgroundColor: theme.card,
          paddingHorizontal: 16,
          fontSize: 15,
          color: theme.foreground,
          fontFamily: 'Manrope_500Medium',
        }}
      />
    </View>
  );
}
