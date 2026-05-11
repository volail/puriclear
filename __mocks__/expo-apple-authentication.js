module.exports = {
  signInAsync: jest.fn().mockResolvedValue({ identityToken: 'mock-apple-token' }),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  isAvailableAsync: jest.fn().mockResolvedValue(true),
}
