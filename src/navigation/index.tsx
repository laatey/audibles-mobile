import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View, Pressable, Animated, StyleSheet, Platform } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import { useTheme, font } from '@/theme';
import { Text } from '@/components/Text';
import HomeScreen from '@/screens/HomeScreen';
import HighlightsScreen from '@/screens/ChannelsScreen';
import LiveScreen from '@/screens/LiveScreen';
import ChatsScreen from '@/screens/ChatsScreen';
import MeScreen from '@/screens/MeScreen';
import AuthScreen from '@/screens/AuthScreen';
import SettingsScreen from '@/screens/SettingsScreen';
import TranscriptionDetailScreen from '@/screens/TranscriptionDetailScreen';
import ChatDetailScreen from '@/screens/ChatDetailScreen';
import NewChatScreen from '@/screens/NewChatScreen';

export type RootStackParams = {
  Tabs: undefined;
  Auth: undefined;
  Settings: undefined;
  TranscriptionDetail: { id: string };
  ChatDetail: { id: string };
  NewChat: { meetingId?: string };
};

export type TabParams = {
  Home: undefined;
  Channels: undefined;
  Live: undefined;
  Chats: undefined;
  Me: undefined;
};

const Stack = createNativeStackNavigator<RootStackParams>();
const Tabs = createBottomTabNavigator<TabParams>();

const TAB_ICONS: Record<keyof TabParams, keyof typeof Ionicons.glyphMap> = {
  Home: 'home-outline',
  Channels: 'sparkles-outline',
  Live: 'radio-outline',
  Chats: 'chatbubble-outline',
  Me: 'person-outline',
};
const TAB_ICONS_ACTIVE: Record<keyof TabParams, keyof typeof Ionicons.glyphMap> = {
  Home: 'home',
  Channels: 'sparkles',
  Live: 'radio',
  Chats: 'chatbubble',
  Me: 'person',
};

const TAB_LABELS: Record<keyof TabParams, string> = {
  Home: 'Home',
  Channels: 'Highlights',
  Live: 'Live',
  Chats: 'Chats',
  Me: 'Me',
};

function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [barWidth, setBarWidth] = useState(0);
  const indicator = React.useRef(new Animated.Value(state.index)).current;
  useEffect(() => {
    Animated.spring(indicator, { toValue: state.index, useNativeDriver: true, friction: 9 }).start();
  }, [state.index, indicator]);

  const innerPad = 6;
  const tabCount = state.routes.length;
  const innerWidth = Math.max(barWidth - innerPad * 2, 0);
  const tabW = innerWidth / Math.max(tabCount, 1);
  const translateX = indicator.interpolate({
    inputRange: state.routes.map((_, i) => i),
    outputRange: state.routes.map((_, i) => i * tabW),
  });

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingBottom: Math.max(insets.bottom, 8),
        paddingHorizontal: 16,
        paddingTop: 6,
        backgroundColor: 'transparent',
      }}
    >
      <View
        onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
        style={{
          flexDirection: 'row',
          backgroundColor: theme.card,
          borderRadius: 28,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.border,
          paddingVertical: 8,
          paddingHorizontal: innerPad,
          ...Platform.select({
            ios: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
            android: { elevation: 8 },
          }),
        }}
      >
        {barWidth > 0 && (
          <Animated.View
            style={{
              position: 'absolute',
              top: 6,
              bottom: 6,
              left: innerPad,
              width: tabW,
              backgroundColor: theme.secondary,
              borderRadius: 22,
              transform: [{ translateX }],
            }}
          />
        )}
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const name = route.name as keyof TabParams;
          const { options } = descriptors[route.key];
          return (
            <Pressable
              key={route.key}
              onPress={async () => {
                await Haptics.selectionAsync();
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name as never);
              }}
              accessibilityRole="button"
              accessibilityLabel={options.tabBarAccessibilityLabel}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, gap: 2 }}
            >
              <Ionicons
                name={focused ? TAB_ICONS_ACTIVE[name] : TAB_ICONS[name]}
                size={22}
                color={focused ? theme.primary : theme.mutedForeground}
              />
              <Text style={{ fontFamily: font.sansBold, fontSize: 10, color: focused ? theme.primary : theme.mutedForeground }}>
                {TAB_LABELS[name]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function TabsNavigator() {
  return (
    <Tabs.Navigator
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="Home" component={HomeScreen} />
      <Tabs.Screen name="Channels" component={HighlightsScreen} options={{ title: 'Highlights' }} />
      <Tabs.Screen name="Live" component={LiveScreen} />
      <Tabs.Screen name="Chats" component={ChatsScreen} />
      <Tabs.Screen name="Me" component={MeScreen} />
    </Tabs.Navigator>
  );
}

export default function RootNavigator() {
  const theme = useTheme();
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setAuthed(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (authed === null) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }}>
      {authed ? (
        <>
          <Stack.Screen name="Tabs" component={TabsNavigator} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="TranscriptionDetail" component={TranscriptionDetailScreen} />
          <Stack.Screen name="ChatDetail" component={ChatDetailScreen} />
          <Stack.Screen name="NewChat" component={NewChatScreen} options={{ presentation: 'modal' }} />
        </>
      ) : (
        <Stack.Screen name="Auth" component={AuthScreen} />
      )}
    </Stack.Navigator>
  );
}
