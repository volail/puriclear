module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|tamagui|@tamagui/.*)',
  ],
  moduleNameMapper: {
    '^react-native-purchases$': '<rootDir>/__mocks__/react-native-purchases.js',
    '^expo-apple-authentication$': '<rootDir>/__mocks__/expo-apple-authentication.js',
    '^@react-native-google-signin/google-signin$': '<rootDir>/__mocks__/google-signin.js',
    '^expo-localization$': '<rootDir>/__mocks__/expo-localization.js',
  },
}
