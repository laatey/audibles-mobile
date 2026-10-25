import React from 'react';
import { Text as RNText, TextProps, StyleSheet } from 'react-native';
import { useTheme, font } from '@/theme';

export function Text({ style, ...rest }: TextProps) {
  const theme = useTheme();
  return (
    <RNText
      {...rest}
      style={[{ color: theme.foreground, fontFamily: font.sans, fontSize: 15 }, style]}
    />
  );
}

export const textStyles = StyleSheet.create({});
