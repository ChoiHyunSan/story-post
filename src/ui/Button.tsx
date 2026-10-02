import { Pressable, Text, StyleSheet } from 'react-native';
import { colors } from './theme';
export function Button({ title, accessibilityLabel, accessibilityHint, selected, expanded, onPress, disabled = false, secondary = false, choice = false }: {
  title: string; accessibilityLabel?: string; accessibilityHint?: string; selected?: boolean; expanded?: boolean;
  onPress: () => void; disabled?: boolean; secondary?: boolean; choice?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel}
    accessibilityHint={accessibilityHint} accessibilityState={{ disabled, selected, expanded }} disabled={disabled}
    onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.secondary, choice && styles.choice,
      pressed && styles.pressed, disabled && styles.disabled]}>
    <Text style={[styles.text, secondary && styles.secondaryText, choice && styles.choiceText]}>{title}</Text>
  </Pressable>;
}
const styles = StyleSheet.create({
  button: { minHeight: 50, paddingVertical: 14, paddingHorizontal: 18, backgroundColor: colors.primary, borderRadius: 4, justifyContent: 'center' },
  secondary: { backgroundColor: colors.secondarySurface, borderWidth: 1, borderColor: colors.border },
  choice: { minHeight: 58, backgroundColor: 'transparent', borderRadius: 0, borderTopWidth: 1, borderTopColor: colors.paperBorder, paddingHorizontal: 2 },
  pressed: { opacity: 0.72 }, disabled: { opacity: 0.48 },
  text: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.primaryText, textAlign: 'center' },
  secondaryText: { color: colors.secondaryText },
  choiceText: { color: colors.readingText, textAlign: 'left', fontWeight: '600' },
});
