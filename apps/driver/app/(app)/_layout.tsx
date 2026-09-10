import { Stack } from 'expo-router'

export default function AppLayout() {
    return (
        <Stack
            screenOptions={{
                headerStyle: { backgroundColor: '#fff' },
                headerTintColor: '#111827',
                headerTitleStyle: { fontWeight: '700' },
                contentStyle: { backgroundColor: '#f9fafb' },
            }}
        >
            <Stack.Screen name="home" options={{ title: 'Today' }} />
            <Stack.Screen name="trip/[id]" options={{ title: 'Trip' }} />
            <Stack.Screen
                name="stop/[tripId]/[stopId]"
                options={{ title: 'Stop' }}
            />
        </Stack>
    )
}
