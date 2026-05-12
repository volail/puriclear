import { Tabs } from 'expo-router'
import { useTranslation } from 'react-i18next'

export default function TabsLayout() {
  const { t } = useTranslation()
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: { backgroundColor: '#FFF9FB', borderTopColor: '#E8DFF0' },
        tabBarActiveTintColor: '#C8B4E8',
        tabBarInactiveTintColor: '#B0A0BC',
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t('upload.takePhoto') }}
      />
      <Tabs.Screen
        name="gallery/index"
        options={{ title: t('gallery.title') }}
      />
      <Tabs.Screen
        name="gallery/[id]"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: t('settings.title') }}
      />
    </Tabs>
  )
}
