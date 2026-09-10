import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Session } from '../types'

const KEY = 'agctek.driver.session'

export async function saveSession(session: Session): Promise<void> {
    await AsyncStorage.setItem(KEY, JSON.stringify(session))
}

export async function loadSession(): Promise<Session | null> {
    const raw = await AsyncStorage.getItem(KEY)
    if (!raw) return null
    try {
        return JSON.parse(raw) as Session
    } catch {
        return null
    }
}

export async function clearSession(): Promise<void> {
    await AsyncStorage.removeItem(KEY)
}
