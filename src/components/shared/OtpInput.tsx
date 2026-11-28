import { useEffect, useState, useRef } from 'react'
import Input from '@/components/ui/Input'
import classNames from '@/utils/classNames'
import type { ChangeEvent, KeyboardEvent, ClipboardEvent } from 'react'

interface OTPInputProps {
    length?: number
    value?: string
    onChange?: (value: string) => void
    disabled?: boolean
    className?: string
    inputClass?: string
    autoFocus?: boolean
    placeholder?: string
    invalid?: boolean
    invalidDigits?: number[]
    invalidClass?: string
}

const OTPInput = ({
    length = 6,
    value = '',
    onChange,
    disabled = false,
    className = '',
    inputClass,
    autoFocus = false,
    placeholder,
    invalid = false,
    invalidDigits,
    invalidClass,
}: OTPInputProps) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [_, setActiveInput] = useState<number>(0)
    const inputRefs = useRef<(HTMLInputElement | null)[]>([])

    useEffect(() => {
        inputRefs.current = Array(length)
            .fill(null)
            .map((_, i) => inputRefs.current[i] || null)
    }, [length])

    const handleChange = (e: ChangeEvent<HTMLInputElement>, index: number) => {
        const newValue = e.target.value
        if (newValue.length > 1) return

        const newOTPValue =
            value.slice(0, index) + newValue + value.slice(index + 1)

        onChange?.(newOTPValue)

        if (newValue && index < length - 1) {
            setActiveInput(index + 1)
            inputRefs.current[index + 1]?.focus()
        }
    }

    const handleKeyDown = (
        e: KeyboardEvent<HTMLInputElement>,
        index: number,
    ) => {
        if (e.key === 'Backspace') {
            e.preventDefault()
            if (value[index]) {
                const newOTPValue =
                    value.slice(0, index) + '' + value.slice(index + 1)
                onChange?.(newOTPValue)
            } else if (index > 0) {
                setActiveInput(index - 1)
                inputRefs.current[index - 1]?.focus()
            }
        } else if (e.key === 'ArrowLeft' && index > 0) {
            e.preventDefault()
            setActiveInput(index - 1)
            inputRefs.current[index - 1]?.focus()
        } else if (e.key === 'ArrowRight' && index < length - 1) {
            e.preventDefault()
            setActiveInput(index + 1)
            inputRefs.current[index + 1]?.focus()
        }
    }

    const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault()
        const pastedData = e.clipboardData
            .getData('text/plain')
            .slice(0, length)
        if (pastedData.match(/^[0-9]+$/)) {
            onChange?.(pastedData.padEnd(length, ''))
        }
    }

    const setRef = (index: number) => (ref: HTMLInputElement | null) => {
        inputRefs.current[index] = ref
    }

    return (
        <div className={`flex gap-2 ${className}`}>
            {Array(length)
                .fill(null)
                .map((_, index) => {
                    const digitInvalid = invalidDigits?.includes(index) ?? false
                    return (
                        <Input
                            key={index}
                            ref={setRef(index)}
                            className={classNames(
                                'text-center text-lg h-[58px] w-[58px] transition-transform duration-150 focus:scale-105',
                                value[index] && !digitInvalid
                                    ? 'scale-105 ring-1 ring-leaf-400/60'
                                    : '',
                                digitInvalid &&
                                    'scale-105 ring-1 ring-rose-400/60',
                                digitInvalid
                                    ? (invalidClass ?? inputClass)
                                    : inputClass,
                            )}
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={1}
                            value={value[index] || ''}
                            disabled={disabled}
                            autoFocus={autoFocus && index === 0}
                            placeholder={placeholder}
                            aria-label={`Digit ${index + 1} of ${length}`}
                            invalid={invalid}
                            onChange={(e) =>
                                handleChange(
                                    e as ChangeEvent<HTMLInputElement>,
                                    index,
                                )
                            }
                            onKeyDown={(e) =>
                                handleKeyDown(
                                    e as KeyboardEvent<HTMLInputElement>,
                                    index,
                                )
                            }
                            onPaste={handlePaste}
                            onFocus={() => setActiveInput(index)}
                        />
                    )
                })}
        </div>
    )
}

export default OTPInput
