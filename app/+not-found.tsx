import { Link, Stack } from 'expo-router'
import { View, Text } from 'react-native'

export default function NotFound() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not Found' }} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF9FB' }}>
        <Text style={{ fontSize: 18, marginBottom: 16 }}>Page not found</Text>
        <Link href="/(tabs)">
          <Text style={{ color: '#C8B4E8' }}>Go home</Text>
        </Link>
      </View>
    </>
  )
}
