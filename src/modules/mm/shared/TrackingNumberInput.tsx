'use client'

import Input from '@/components/ui/Input'
import type { ComponentProps } from 'react'
import { formatTrackingNumber, formatTrackingNumberLive } from './trackingNumberFormat'

type InputProps = ComponentProps<typeof Input>

type TrackingNumberInputProps = Omit<InputProps, 'value' | 'onChange'> & {
    value: string
    onChange: (value: string) => void
}

/** Batch / serial number field with live sanitize + canonical format on blur. */
export function TrackingNumberInput({ value, onChange, onBlur, ...rest }: TrackingNumberInputProps) {
    return (
        <Input
            {...rest}
            value={value}
            onChange={(e) => onChange(formatTrackingNumberLive(e.target.value))}
            onBlur={(e) => {
                onChange(formatTrackingNumber(value))
                onBlur?.(e)
            }}
        />
    )
}

export default TrackingNumberInput
