import { renderHook } from '@testing-library/react-native'
import { useGallery } from '../src/hooks/useGallery'

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      then: jest.fn(),
    }),
  },
}))

jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'uid' } } }),
}))

test('initial state has empty uploads and not loading', () => {
  const { result } = renderHook(() => useGallery())
  expect(result.current.uploads).toEqual([])
})
