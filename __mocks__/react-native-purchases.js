module.exports = {
  Purchases: {
    configure: jest.fn(),
    getOfferings: jest.fn().mockResolvedValue({ current: null }),
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn().mockResolvedValue({ activeSubscriptions: [] }),
    setLogLevel: jest.fn(),
    logIn: jest.fn(),
    logOut: jest.fn(),
  },
  LOG_LEVEL: { DEBUG: 'DEBUG' },
}
