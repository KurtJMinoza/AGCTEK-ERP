import * as ImagePicker from 'expo-image-picker'

/**
 * Camera photo (library fallback) as a compressed data URL, or null when cancelled.
 * Throws when neither camera nor library permission is granted.
 */
export async function capturePhotoDataUrl(): Promise<string | null> {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) {
        const lib = await ImagePicker.requestMediaLibraryPermissionsAsync()
        if (!lib.granted) throw new Error('Camera / photo permission required')
    }
    const options = { quality: 0.55, base64: true, allowsEditing: true }
    const result = await ImagePicker.launchCameraAsync(options).catch(async () =>
        ImagePicker.launchImageLibraryAsync(options),
    )
    if (result.canceled || !result.assets[0]) return null
    const asset = result.assets[0]
    return asset.base64
        ? `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`
        : asset.uri
}
