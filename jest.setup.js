jest.mock('expo-crypto', () => ({
  randomUUID: () => require('node:crypto').randomUUID(),
  getRandomBytes: (n) => new Uint8Array(require('node:crypto').randomBytes(n)),
}));
