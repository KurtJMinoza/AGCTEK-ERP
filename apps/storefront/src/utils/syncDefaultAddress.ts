import { commerceApi } from '@/src/api/client'
import type { AccountForm } from '@/src/accountFields'
import type { SavedAddressInput } from '@/src/types'
import type { DeliveryPin } from '@/src/components/DeliveryLocationPicker'

/** Upserts the shopper's default saved address (lat/lng + text fields). */
export async function syncDefaultAddress(form: AccountForm, pin: DeliveryPin): Promise<void> {
    const addresses = await commerceApi.getAddresses()
    const payload: SavedAddressInput = {
        addressType: 'HOME',
        addressLine: form.addressLine1.trim(),
        barangay: null,
        city: form.city.trim(),
        province: form.region.trim(),
        postalCode: form.postalCode.trim(),
        country: form.country.trim() || 'PH',
        latitude: pin.latitude,
        longitude: pin.longitude,
        isDefault: true,
        additionalInfo: null,
    }
    const current = addresses.find((a) => a.isDefault) ?? addresses[0]
    if (current) await commerceApi.updateAddress(current.id, payload)
    else await commerceApi.createAddress(payload)
}