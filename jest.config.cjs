module.exports = {
  watchman: false,
  projects: ['ios', 'android'].map(platform => ({
    displayName: platform,
    preset: '@react-native/jest-preset',
    haste: { defaultPlatform: platform, platforms: ['android', 'ios', 'native'] },
    testMatch: ['<rootDir>/tests/ui/**/*.test.tsx'],
    transform: {
      '^.+\\.(js|ts|tsx)$': ['babel-jest', { presets: ['module:@react-native/babel-preset'] }],
    },
    clearMocks: true,
  })),
};
