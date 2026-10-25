// Direct calls to the Lovable AI Gateway, mirroring the Vite server functions.
// SECURITY: For production you should proxy these via a Supabase Edge Function
// so the API key isn't shipped in the mobile bundle.
import { supabase } from './supabase';

const API_KEY = process.env.EXPO_PUBLIC_LOVABLE_API_KEY ?? '';
const AI_BASE = 'https://ai.gateway.lovable.dev/v1';

function requireKey() {
  if (!API_KEY) throw new Error('Missing EXPO_PUBLIC_LOVABLE_API_KEY');
}

function extFromMime(mime: string) {
  const t = mime.split(';')[0];
  if (t.includes('webm')) return 'webm';
  if (t.includes('mp4') || t.includes('m4a') || t.includes('aac')) return 'mp4';
  if (t.includes('wav')) return 'wav';
  if (t.includes('mpeg')) return 'mp3';
  return 'mp4';
}

export async function transcribeChunk(opts: {
  audioBase64: string;
  mimeType: string;
}): Promise<{ text: string }> {
  requireKey();
  const ext = extFromMime(opts.mimeType);
  const form = new FormData();
  form.append('model', 'openai/gpt-4o-mini-transcribe');
  // RN FormData file shape:
  form.append('file', {
    uri: `data:${opts.mimeType};base64,${opts.audioBase64}`,
    name: `chunk.${ext}`,
    type: opts.mimeType,
  } as never);

  const res = await fetch(`${AI_BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}` },
    body: form as never,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Transcription ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { text?: string };
  return { text: (json.text ?? '').trim() };
}

export async function transcribeMeeting(opts: {
  meetingId: string;
  audioBase64: string;
  mimeType: string;
}): Promise<{ title?: string; summary?: string }> {
  requireKey();
  const format = extFromMime(opts.mimeType);
  const res = await fetch(`${AI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'system',
          content:
            'You are a transcription assistant. Respond with ONLY a JSON object: {"title":"3-6 word title","transcript":"full verbatim transcript","summary":"2-4 sentence summary"}. No markdown.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Transcribe and summarize this audio.' },
            { type: 'input_audio', input_audio: { data: opts.audioBase64, format } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI ${res.status}: ${t.slice(0, 200)}`);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = (json.choices?.[0]?.message?.content ?? '').replace(/```json|```/g, '').trim();
  let parsed: { title?: string; transcript?: string; summary?: string } = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = { transcript: raw };
  }
  const { data: u } = await supabase.auth.getUser();
  await supabase
    .from('meetings')
    .update({
      title: parsed.title || 'Untitled recording',
      transcript: parsed.transcript || '',
      summary: parsed.summary || '',
      status: 'ready',
    })
    .eq('id', opts.meetingId)
    .eq('user_id', u.user?.id ?? '');
  return { title: parsed.title, summary: parsed.summary };
}

export async function finalizeMeeting(opts: {
  meetingId: string;
  transcript: string;
}) {
  const transcript = (opts.transcript ?? '').trim();
  let title = 'Untitled recording';
  let summary = '';
  if (transcript && API_KEY) {
    try {
      const res = await fetch(`${AI_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            {
              role: 'system',
              content:
                'Respond with ONLY a JSON object: {"title":"3-6 word title","summary":"2-4 sentence summary"}. No markdown.',
            },
            { role: 'user', content: transcript.slice(0, 15000) },
          ],
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const raw = (json.choices?.[0]?.message?.content ?? '').replace(/```json|```/g, '').trim();
        try {
          const parsed = JSON.parse(raw) as { title?: string; summary?: string };
          if (parsed.title) title = parsed.title;
          if (parsed.summary) summary = parsed.summary;
        } catch {}
      }
    } catch {}
  }
  const { data: u } = await supabase.auth.getUser();
  await supabase
    .from('meetings')
    .update({ title, transcript, summary, status: 'ready' })
    .eq('id', opts.meetingId)
    .eq('user_id', u.user?.id ?? '');
  return { title, summary };
}

export async function askKnowledge(opts: { threadId: string; question: string }) {
  requireKey();
  const { data: u } = await supabase.auth.getUser();
  const userId = u.user?.id;
  if (!userId) throw new Error('Not signed in');

  const { data: thread } = await supabase
    .from('chat_threads')
    .select('id,title,meeting_id')
    .eq('id', opts.threadId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!thread) throw new Error('Thread not found');

  const { data: history } = await supabase
    .from('chat_messages')
    .select('role,content')
    .eq('thread_id', opts.threadId)
    .order('created_at', { ascending: true })
    .limit(40);

  let mq = supabase
    .from('meetings')
    .select('title,summary,transcript,created_at')
    .eq('user_id', userId)
    .eq('status', 'ready');
  if (thread.meeting_id) mq = mq.eq('id', thread.meeting_id);
  else mq = mq.order('created_at', { ascending: false }).limit(20);
  const { data: meetings } = await mq;

  const cap = thread.meeting_id ? 20000 : 4000;
  const kb = (meetings ?? [])
    .map(
      (m, i) =>
        `--- Meeting ${i + 1}: ${m.title} (${new Date(m.created_at).toLocaleDateString()}) ---\nSummary: ${m.summary ?? ''}\nTranscript: ${(m.transcript ?? '').slice(0, cap)}`,
    )
    .join('\n\n');

  const scope = thread.meeting_id
    ? 'Answer using ONLY the single meeting transcript below.'
    : 'Answer using ONLY the meeting transcripts below. Cite the meeting title when referencing facts.';
  const system = `You are Audibles, a meeting knowledge assistant. ${scope} If the answer isn't in the transcripts, say so plainly.\n\n${kb || '(No meetings yet.)'}`;

  await supabase.from('chat_messages').insert({
    thread_id: opts.threadId,
    user_id: userId,
    role: 'user',
    content: opts.question,
  });

  const res = await fetch(`${AI_BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: system },
        ...(history ?? []),
        { role: 'user', content: opts.question },
      ],
    }),
  });
  if (!res.ok) {
    if (res.status === 429) throw new Error('Rate limited. Try again in a moment.');
    if (res.status === 402) throw new Error('AI credits exhausted.');
    const t = await res.text().catch(() => '');
    throw new Error(`AI ${res.status}: ${t.slice(0, 200)}`);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const answer = (json.choices?.[0]?.message?.content ?? '').trim();

  await supabase.from('chat_messages').insert({
    thread_id: opts.threadId,
    user_id: userId,
    role: 'assistant',
    content: answer,
  });

  const isFirst = (history ?? []).length === 0;
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (isFirst) updates.title = opts.question.slice(0, 60);
  await supabase.from('chat_threads').update(updates).eq('id', opts.threadId);

  return { answer };
}
