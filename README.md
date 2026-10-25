# audibles-mobile

Native Expo (SDK 54) port of the Audibles Vite app — same product, same design, on a phone.

## Run

```bash
cd audibles-mobile
npm install
npx expo install --fix
npx expo-doctor
npm run ios       # iOS Simulator
npm run android   # Android Emulator
npm start         # Expo Go (scan QR)
```

## Configuration

Supabase URL and anon key are wired in `app.json → expo.extra`. They already point at the same backend as the web app.

### AI features (transcription + chat)

Set an env var **before** `expo start` to enable the AI gateway calls used by:
- audio file upload transcription (Home)
- live-chunk transcription + finalize (Live)
- knowledge base chat (Chats, transcription Chat tab)

```bash
export EXPO_PUBLIC_LOVABLE_API_KEY=sk-...
```

> ⚠️  Shipping the API key in a mobile bundle exposes it. Before publishing,
> move these calls into a Supabase Edge Function that holds the key server-side
> and have the app call that function instead. See `src/lib/ai.ts` for the
> exact shapes to port.

## What was ported

✅ 10 screens → 10 native screens
✅ Bottom-tab navigation with floating pill + sliding indicator
✅ All Supabase reads/writes (auth, meetings, chat_threads, chat_messages, storage)
✅ Live chunked transcription via `expo-av` (3-second segments)
✅ Audio file upload via `expo-document-picker`
✅ Avatar upload via `expo-image-picker` + signed URLs
✅ Light/Dark theme via `useColorScheme`
✅ Haptic feedback on key interactions
✅ Safe area + keyboard avoidance on every screen

## Library swaps

| Web | Native |
|---|---|
| `@tanstack/react-router` | `@react-navigation/native` (stack + tabs) |
| `@tanstack/react-start` server fns | direct `fetch` to Lovable AI Gateway (`src/lib/ai.ts`) |
| `lucide-react` icons | `@expo/vector-icons` (Ionicons) |
| Tailwind classes | `StyleSheet` + theme tokens (`src/theme`) |
| `MediaRecorder` (browser) | `expo-av` Recording |
| `localStorage` | `@react-native-async-storage/async-storage` |
| HTML `<input type="file">` | `expo-document-picker` / `expo-image-picker` |
| `sonner` toasts | `Alert.alert` |

## Manual verification

- iOS microphone & photo-library permission prompts on first use
- Supabase email/password auth works against the existing project
- `avatars` bucket signed URLs render correctly
- Pull-to-refresh on Home invalidates the meetings query
- Live recording rotates segments every 3s and updates the transcript card
