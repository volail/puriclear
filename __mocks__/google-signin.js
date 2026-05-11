module.exports = {
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn().mockResolvedValue(true),
    signIn: jest.fn(),
    getTokens: jest.fn(),
  },
  statusCodes: { SIGN_IN_CANCELLED: '12501' },
}
