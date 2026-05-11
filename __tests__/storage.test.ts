import { getHasSeenOnboarding, setHasSeenOnboarding } from '../src/lib/storage'

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)

test('returns false before setting', async () => {
  const result = await getHasSeenOnboarding()
  expect(result).toBe(false)
})

test('returns true after setting', async () => {
  await setHasSeenOnboarding()
  const result = await getHasSeenOnboarding()
  expect(result).toBe(true)
})
