import React, { useEffect, useRef, useState } from 'react';
import { View, Pressable, ActivityIndicator, Alert, ScrollView, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { decode as decodeB64 } from 'base64-arraybuffer';
import * as Haptics from 'expo-haptics';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useTheme, font } from '@/theme';
import { supabase } from '@/lib/supabase';
import { transcribeChunk, finalizeMeeting } from '@/lib/ai';
import { RootStackParams } from '@/navigation';

const CHUNK_MS = 3000;

const recordingPreset: Audio.RecordingOptions = {
  isMeteringEnabled: true,
  android: {
    extension: '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 96000,
  },
  ios: {
    extension: '.m4a',
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality: Audio.IOSAudioQuality.MEDIUM,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 96000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: 'audio/webm', bitsPerSecond: 96000 },
};

export default function LiveScreen() {
  const theme = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const qc = useQueryClient();

  const [userId, setUserId] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [liveText, setLiveText] = useState('');
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<Audio.Recording | null>(null);
  const transcriptRef = useRef('');
  const chunkBase64sRef = useRef<string[]>([]);
  const stoppingRef = useRef(false);
  const segmentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const wavePhase = useRef(0);
  const waveAnim = useRef(new Animated.Value(0)).current;
  const rafRef = useRef<number | null>(null);
  const BAR_COUNT = 48;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (!recording || paused) return;
    const i = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(i);
  }, [recording, paused]);

  // Drive the waveform at ~60fps when recording and not paused
  const recordingRef = useRef(false);
  const pausedRef = useRef(false);

  useEffect(() => { recordingRef.current = recording; }, [recording]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  useEffect(() => {
    const tick = () => {
      if (recordingRef.current && !pausedRef.current) {
        wavePhase.current += 0.07;
        waveAnim.setValue(wavePhase.current);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [waveAnim]);

  useEffect(() => () => {
    if (segmentTimer.current) clearTimeout(segmentTimer.current);
    recRef.current?.stopAndUnloadAsync().catch(() => {});
  }, []);

  function enqueueTranscribe(base64: string, mime: string) {
    queueRef.current = queueRef.current.then(async () => {
      try {
        const { text } = await transcribeChunk({ audioBase64: base64, mimeType: mime });
        if (text) {
          transcriptRef.current = (transcriptRef.current + ' ' + text).trim();
          setLiveText(transcriptRef.current);
        }
      } catch (e) {
        console.warn('chunk failed', e);
      }
    }).catch(() => {});
  }

  async function startSegment() {
    try {
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(recordingPreset);
      await rec.startAsync();
      recRef.current = rec;
      if (segmentTimer.current) clearTimeout(segmentTimer.current);
      segmentTimer.current = setTimeout(rotateSegment, CHUNK_MS);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Recording failed');
    }
  }

  async function rotateSegment() {
    const rec = recRef.current;
    if (!rec) return;
    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      recRef.current = null;
      if (uri) {
        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        chunkBase64sRef.current.push(base64);
        enqueueTranscribe(base64, 'audio/mp4');
      }
    } catch (e) {
      console.warn('rotate failed', e);
    }
    if (!stoppingRef.current && !paused) startSegment();
  }

  async function start() {
    setError(null);
    setLiveText('');
    transcriptRef.current = '';
    chunkBase64sRef.current = [];
    setSeconds(0);
    stoppingRef.current = false;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) throw new Error('Microphone permission denied');
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      setPaused(false);
      setRecording(true);
      await startSegment();
    } catch (e: unknown) {
      setRecording(false);
      setError(e instanceof Error ? e.message : 'Could not start');
    }
  }

  async function togglePause() {
    await Haptics.selectionAsync();
    if (!paused) {
      setPaused(true);
      if (segmentTimer.current) clearTimeout(segmentTimer.current);
      const rec = recRef.current;
      if (rec) {
        try {
          await rec.stopAndUnloadAsync();
          const uri = rec.getURI();
          recRef.current = null;
          if (uri) {
            const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
            chunkBase64sRef.current.push(base64);
            enqueueTranscribe(base64, 'audio/mp4');
          }
        } catch {}
      }
    } else {
      setPaused(false);
      await startSegment();
    }
  }

  async function stopAndSave() {
    if (!userId) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    stoppingRef.current = true;
    setRecording(false);
    setPaused(false);
    setFinalizing(true);
    if (segmentTimer.current) clearTimeout(segmentTimer.current);
    const rec = recRef.current;
    if (rec) {
      try {
        await rec.stopAndUnloadAsync();
        const uri = rec.getURI();
        recRef.current = null;
        if (uri) {
          const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
          chunkBase64sRef.current.push(base64);
          enqueueTranscribe(base64, 'audio/mp4');
        }
      } catch {}
    }
    await queueRef.current;

    if (chunkBase64sRef.current.length === 0) {
      setError('That recording was empty — please try again.');
      setFinalizing(false);
      return;
    }

    try {
      // Upload the last segment as the canonical audio file (full reassembly of m4a segments
      // is non-trivial; the transcript is already complete from chunked transcription).
      const lastB64 = chunkBase64sRef.current[chunkBase64sRef.current.length - 1];
      const bytes = decodeB64(lastB64);
      const path = `${userId}/${Date.now()}.m4a`;
      const { error: upErr } = await supabase.storage.from('audio').upload(path, bytes, { contentType: 'audio/mp4' });
      if (upErr) throw upErr;
      const { data: row, error: insErr } = await supabase
        .from('meetings')
        .insert({ user_id: userId, title: `Recording ${new Date().toLocaleString()}`, audio_path: path, status: 'processing', duration_seconds: seconds })
        .select('id')
        .single();
      if (insErr) throw insErr;
      await finalizeMeeting({ meetingId: row.id, transcript: transcriptRef.current });
      await qc.invalidateQueries({ queryKey: ['meetings', userId] });
      nav.navigate('TranscriptionDetail', { id: row.id });
    } catch (e: unknown) {
      Alert.alert('Save failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setFinalizing(false);
    }
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <Screen>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 }}>
        <Pressable onPress={() => nav.goBack()}>
          <Text style={{ color: theme.mutedForeground }}>Cancel</Text>
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: recording && !paused ? theme.destructive : theme.mutedForeground }} />
          <Text style={{ fontSize: 13, fontFamily: font.sansSemi }}>{mm}:{ss}</Text>
        </View>
        <View style={{ width: 48 }} />
      </View>

      {/* Title */}
      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 6 }}>
        <Text style={{ fontSize: 11, fontFamily: font.sansBold, color: theme.mutedForeground, letterSpacing: 1.2 }}>
          {finalizing ? 'SAVING' : recording ? (paused ? 'PAUSED' : 'RECORDING') : 'READY'}
        </Text>
        <Text style={{ marginTop: 4, fontFamily: font.displayBold, fontSize: 22 }}>
          {recording ? 'Live transcription' : finalizing ? 'Finalizing…' : 'New recording'}
        </Text>
      </View>

      {/* Animated waveform */}
      <View style={{ paddingHorizontal: 20, paddingVertical: 8 }}>
        <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          {Array.from({ length: BAR_COUNT }).map((_, i) => {
            // Each bar interpolates its height based on waveAnim (the continuously updating phase)
            const heightAnim = waveAnim.interpolate({
              inputRange: [0, 100],
              outputRange: [
                // idle height
                10 + Math.abs(Math.sin(i * 1.1)) * 6,
                // active height — unique phase offset per bar gives organic wave shape
                14 + Math.abs(Math.sin(i * 0.55 + i * 0.08)) * 38,
              ],
              extrapolate: 'clamp',
            });

            const activeHeightAnim = waveAnim.interpolate({
              inputRange: waveAnim.__getValue() - 1 < 0 ? [0, 0.001] : [waveAnim.__getValue() - 1, waveAnim.__getValue()],
              outputRange: [0, 0],
              extrapolate: 'clamp',
            });

            // Use a simpler interpolation driven by the phase
            const barHeight = recording && !paused
              ? waveAnim.interpolate({
                  inputRange: [0, Math.PI * 2, Math.PI * 4, Math.PI * 6],
                  outputRange: [
                    10 + Math.abs(Math.sin(i * 0.5)) * 40,
                    10 + Math.abs(Math.sin(i * 0.5 + Math.PI * 0.5)) * 40,
                    10 + Math.abs(Math.sin(i * 0.5 + Math.PI)) * 40,
                    10 + Math.abs(Math.sin(i * 0.5)) * 40,
                  ],
                  extrapolate: 'extend',
                })
              : new Animated.Value(8 + Math.abs(Math.sin(i * 1.1)) * 6);

            return (
              <Animated.View
                key={i}
                style={{
                  width: 3,
                  borderRadius: 2,
                  backgroundColor: recording && !paused ? theme.primary : theme.mutedForeground,
                  opacity: recording && !paused ? 0.85 : 0.35,
                  height: barHeight,
                }}
              />
            );
          })}
        </View>
      </View>

      {/* Transcript — no card, rendered directly on the page */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 180 }}
      >
        {error && <Text style={{ fontSize: 13, color: theme.destructive, marginBottom: 12 }}>{error}</Text>}
        {liveText ? (
          <Text style={{ fontSize: 17, lineHeight: 28, color: theme.foreground, fontFamily: font.sans }}>
            {liveText}
          </Text>
        ) : (
          <Text style={{ fontSize: 15, color: theme.mutedForeground, lineHeight: 24, fontFamily: font.sans }}>
            {recording
              ? 'Listening… transcribed text will appear here every few seconds.'
              : 'Tap the mic to start recording. Your transcript will appear live as you speak.'}
          </Text>
        )}
      </ScrollView>

      {/* Controls */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 110, paddingHorizontal: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 999, paddingHorizontal: 24, paddingVertical: 12 }}>
          <Pressable
            onPress={togglePause}
            disabled={!recording || finalizing}
            style={({ pressed }) => [{ width: 48, height: 48, borderRadius: 24, backgroundColor: theme.secondary, alignItems: 'center', justifyContent: 'center', opacity: !recording || finalizing ? 0.4 : pressed ? 0.7 : 1 }]}
          >
            <Ionicons name={paused ? 'mic' : 'pause'} size={20} color={theme.secondaryForeground} />
          </Pressable>

          {recording ? (
            <Pressable
              onPress={stopAndSave}
              disabled={finalizing}
              style={({ pressed }) => [{ width: 56, height: 56, borderRadius: 28, backgroundColor: theme.destructive, alignItems: 'center', justifyContent: 'center', opacity: finalizing || pressed ? 0.7 : 1 }]}
            >
              {finalizing ? <ActivityIndicator color={theme.destructiveForeground} /> : <Ionicons name="square" size={18} color={theme.destructiveForeground} />}
            </Pressable>
          ) : (
            <Pressable
              onPress={start}
              disabled={finalizing}
              style={({ pressed }) => [{ width: 56, height: 56, borderRadius: 28, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', opacity: finalizing || pressed ? 0.7 : 1 }]}
            >
              {finalizing ? <ActivityIndicator color={theme.primaryForeground} /> : <Ionicons name="mic" size={22} color={theme.primaryForeground} />}
            </Pressable>
          )}

          <View style={{ width: 48 }} />
        </View>
      </View>
    </Screen>
  );
}

