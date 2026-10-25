import React, { ReactNode } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, font } from '@/theme';
import { Text } from './Text';

export function PageHeader({
  title,
  subtitle,
  trailing,
}: {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <View style={{ flex: 1 }}>
        {subtitle ? (
          <Text style={{ fontSize: 13, color: theme.mutedForeground, fontFamily: font.sans }}>{subtitle}</Text>
        ) : null}
        <Text style={{ fontFamily: font.displayBold, fontSize: 26, color: theme.foreground, marginTop: 2 }}>
          {title}
        </Text>
      </View>
      {trailing}
    </View>
  );
}

export function Section({
  title,
  action,
  children,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={{ paddingHorizontal: 24, paddingTop: 16 }}>
      {(title || action) && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          {title ? <Text style={{ fontFamily: font.displayBold, fontSize: 17, color: theme.foreground }}>{title}</Text> : <View />}
          {action}
        </View>
      )}
      {children}
    </View>
  );
}

export function ListGroup({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border, backgroundColor: theme.card, overflow: 'hidden' }}>
      {React.Children.toArray(children).map((c, i, arr) => (
        <View key={i}>
          {c}
          {i < arr.length - 1 ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.border, marginLeft: 16 }} /> : null}
        </View>
      ))}
    </View>
  );
}

export function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  onPress,
  showChevron,
}: {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
}) {
  const theme = useTheme();
  const inner = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 }}>
      {leading ? <View>{leading}</View> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        {typeof title === 'string' ? (
          <Text style={{ fontFamily: font.sansSemi, fontSize: 15, color: theme.foreground }} numberOfLines={1}>{title}</Text>
        ) : (
          title
        )}
        {subtitle ? (
          typeof subtitle === 'string' ? (
            <Text style={{ fontSize: 13, color: theme.mutedForeground, marginTop: 2 }} numberOfLines={1}>{subtitle}</Text>
          ) : (
            subtitle
          )
        ) : null}
      </View>
      {trailing ? <View>{trailing}</View> : null}
      {showChevron ? <Ionicons name="chevron-forward" size={16} color={theme.mutedForeground} /> : null}
    </View>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
        {inner}
      </Pressable>
    );
  }
  return inner;
}
