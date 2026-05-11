module.exports = {
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn().mockResolvedValue(true),
    signIn: jest.fn(),
    getTokens: jest.fn().mockResolvedValue({ idToken: 'mock-google-token' }),
  },
  statusCodes: { SIGN_IN_CANCELLED: '12501' },
}
