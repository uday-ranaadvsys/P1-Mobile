import { StyleSheet, Text as RNText, type TextProps } from 'react-native';

// Inter, the typeface of the design. Custom fonts need one family per weight, so the weight in a style
// ("fontWeight: '700'") is turned into the matching Inter family here and every Text in the app uses this.
const FAMILY: Record<string, string> = {
  '100': 'Inter_400Regular',
  '200': 'Inter_400Regular',
  '300': 'Inter_400Regular',
  '400': 'Inter_400Regular',
  normal: 'Inter_400Regular',
  '500': 'Inter_500Medium',
  '600': 'Inter_600SemiBold',
  '700': 'Inter_700Bold',
  bold: 'Inter_700Bold',
  '800': 'Inter_800ExtraBold',
  '900': 'Inter_800ExtraBold',
};

export function fontFamilyFor(weight: unknown): string {
  return FAMILY[String(weight ?? '400')] ?? 'Inter_400Regular';
}

export function Text({ style, ...props }: TextProps) {
  const weight = StyleSheet.flatten(style)?.fontWeight;
  return <RNText {...props} style={[style, { fontFamily: fontFamilyFor(weight), fontWeight: 'normal' }]} />;
}
