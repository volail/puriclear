import { getHasSeenOnboarding, setHasSeenOnboarding } from '../src/lib/storage'

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)

beforeEach(async () => {
  const AsyncStorage = require('@react-native-async-storage/async-storage')
  await AsyncStorage.clear()
})

test('completing onboarding sets the flag', async () => {
  expect(await getHasSeenOnboarding()).toBe(false)
  await setHasSeenOnboarding()
  expect(await getHasSeenOnboarding()).toBe(true)
})
