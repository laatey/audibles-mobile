import React from 'react';
import { View, ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';

export function Screen({ children, style, edges = ['top'], ...rest }: ViewProps & { edges?: ('top' | 'bottom' | 'left' | 'right')[] }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const paddingTop = edges.includes('top') ? insets.top : 0;
  const paddingBottom = edges.includes('bottom') ? insets.bottom : 0;
  const paddingLeft = edges.includes('left') ? insets.left : 0;
  const paddingRight = edges.includes('right') ? insets.right : 0;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, paddingTop, paddingBottom, paddingLeft, paddingRight }}>
      <View style={[{ flex: 1, backgroundColor: theme.background }, style]} {...rest}>
        {children}
      </View>
    </View>
  );
}
