import assert from 'node:assert/strict';
import test from 'node:test';
import { colors } from '../src/ui/theme';

function luminance(hex: string): number {
  const channels = hex.match(/[0-9A-F]{2}/gi);
  assert.ok(channels && channels.length === 3, `Invalid color: ${hex}`);
  const [red, green, blue] = channels.map(value => {
    const channel = Number.parseInt(value, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground: string, background: string): number {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('core text and control color pairs meet WCAG AA normal-text contrast', () => {
  const pairs = [
    [colors.primaryText, colors.primary],
    [colors.heading, colors.canvas],
    [colors.body, colors.canvas],
    [colors.readingText, colors.paper],
    [colors.muted, colors.canvas],
    [colors.label, colors.surface],
    [colors.secondaryText, colors.secondarySurface],
    [colors.errorText, colors.errorSurface],
  ];
  for (const [foreground, background] of pairs) {
    assert.ok(contrast(foreground, background) >= 4.5,
      `${foreground} on ${background} must have at least 4.5:1 contrast`);
  }
});
