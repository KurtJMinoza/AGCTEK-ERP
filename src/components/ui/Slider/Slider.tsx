import { useCallback, useRef, useState } from 'react'
import Thumb from './Thumb'
import Track from './Track'
import { useConfig } from '../ConfigProvider'
import useMergeRef from '../hooks/useMergeRef'
import useControllableState from '../hooks/useControllableState'
import { clamp } from '../utils/clamp'
import getChangeValue from './utils/getChangeValue'
import getFloatingValue from './utils/getFloatingValue'
import getPosition from './utils/getPosition'
import getPrecision from './utils/getPrecision'
import getClosestNumber from './utils/getClosestNumber'
import useMove from './utils/useMove'
import {
    getFirstMarkValue,
    getLastMarkValue,
    getNextMarkValue,
    getPreviousMarkValue,
} from './utils/getStepMarkValue'
import type {
    Ref,
    ReactNode,
    ComponentPropsWithoutRef,
    KeyboardEvent,
} from 'react'

export type SliderProps = {
    alwaysShowTooltip?: boolean
    classNames?: {
        thumb?: string
        bar?: string
        mark?: string | ((isFilled: boolean) => string)
        track?: string
    }
    defaultValue?: number
    disabled?: boolean
    inputProps?: ComponentPropsWithoutRef<'input'>
    marks?: { value: number; label?: ReactNode }[]
    max?: number
    min?: number
    name?: string
    onChange?: (value: number) => void
    onDraggingStop?: (value: number) => void
    precision?: number
    ref?: Ref<HTMLDivElement>
    showTooltipOnHover?: boolean
    step?: number
    stepOnMarks?: boolean
    thumbAriaLabel?: string
    tooltip?: ReactNode | ((value: number) => ReactNode)
    value?: number
}

const Slider = (props: SliderProps) => {
    const {
        value,
        onChange,
        onDraggingStop,
        min = 0,
        max = 100,
        step = 1,
        precision: _precision,
        defaultValue = 0,
        name,
        marks = [],
        tooltip = (f) => f,
        alwaysShowTooltip = false,
        classNames = {},
        thumbAriaLabel,
        showTooltipOnHover = false,
        disabled = false,
        inputProps,
        stepOnMarks,
        ref = null,
        ...rest
    } = props

    const { direction } = useConfig()

    const [hovered, setHovered] = useState(false)
    const [_value, setValue] = useControllableState({
        prop: typeof value === 'number' ? clamp(value, min!, max!) : value,
        defaultProp:
            typeof defaultValue === 'number'
                ? clamp(defaultValue, min!, max!)
                : defaultValue,
        onChange,
    })

    const valueRef = useRef(_value)
    const root = useRef<HTMLDivElement>(null)
    const thumb = useRef<HTMLDivElement>(null)
    const position = getPosition({
        value: _value as number,
        min: min!,
        max: max!,
    })
    const scaledValue = _value as number
    const _tooltip =
        typeof tooltip === 'function' ? tooltip(scaledValue) : tooltip
    const precision = _precision ?? getPrecision(step!)

    const handleChange = useCallback(
        ({ x }: { x: number }) => {
            if (!disabled) {
                const nextValue = getChangeValue({
                    value: x,
                    min: min!,
                    max: max!,
                    step: step!,
                    precision,
                })
                setValue(
                    stepOnMarks && marks?.length
                        ? getClosestNumber(
                              nextValue,
                              marks.map((mark) => mark.value),
                          )
                        : nextValue,
                )
                valueRef.current = nextValue
            }
        },
        [disabled, min, max, step, precision, setValue, marks, stepOnMarks],
    )

    const { ref: container, active } = useMove(
        handleChange,
        {
            onScrubEnd: () =>
                !disabled &&
                onDraggingStop?.(
                    (stepOnMarks && marks?.length
                        ? getClosestNumber(
                              valueRef.current as number,
                              marks.map((mark) => mark.value),
                          )
                        : valueRef.current) as number,
                ),
        },
        direction,
    )

    const handleTrackKeydownCapture = (
        event: KeyboardEvent<HTMLDivElement>,
    ) => {
        if (!disabled) {
            switch (event.key) {
                case 'ArrowUp': {
                    event.preventDefault()
                    thumb.current?.focus()

                    if (stepOnMarks && marks) {
                        const nextValue = getNextMarkValue(
                            _value as number,
                            marks,
                        )
                        setValue(nextValue)
                        onDraggingStop?.(nextValue)
                        break
                    }

                    const nextValue = getFloatingValue(
                        Math.min(
                            Math.max((_value as number) + step!, min!),
                            max!,
                        ),
                        precision,
                    )
                    setValue(nextValue)
                    onDraggingStop?.(nextValue)
                    break
                }

                case 'ArrowRight': {
                    event.preventDefault()
                    thumb.current?.focus()

                    if (stepOnMarks && marks) {
                        const nextValue =
                            direction === 'rtl'
                                ? getPreviousMarkValue(_value as number, marks)
                                : getNextMarkValue(_value as number, marks)
                        setValue(nextValue)
                        onDraggingStop?.(nextValue)
                        break
                    }

                    const nextValue = getFloatingValue(
                        Math.min(
                            Math.max(
                                direction === 'rtl'
                                    ? (_value as number) - step!
                                    : (_value as number) + step!,
                                min!,
                            ),
                            max!,
                        ),
                        precision,
                    )
                    setValue(nextValue)
                    onDraggingStop?.(nextValue)
                    break
                }

                case 'ArrowDown': {
                    event.preventDefault()
                    thumb.current?.focus()

                    if (stepOnMarks && marks) {
                        const nextValue = getPreviousMarkValue(
                            _value as number,
                            marks,
                        )
                        setValue(nextValue)
                        onDraggingStop?.(nextValue)
                        break
                    }

                    const nextValue = getFloatingValue(
                        Math.min(
                            Math.max((_value as number) - step!, min!),
                            max!,
                        ),
                        precision,
                    )
                    setValue(nextValue)
                    onDraggingStop?.(nextValue)
                    break
                }

                case 'ArrowLeft': {
                    event.preventDefault()
                    thumb.current?.focus()

                    if (stepOnMarks && marks) {
                        const nextValue =
                            direction === 'rtl'
                                ? getNextMarkValue(_value as number, marks)
                                : getPreviousMarkValue(_value as number, marks)
                        setValue(nextValue)
                        onDraggingStop?.(nextValue)
                        break
                    }

                    const nextValue = getFloatingValue(
                        Math.min(
                            Math.max(
                                direction === 'rtl'
                                    ? (_value as number) + step!
                                    : (_value as number) - step!,
                                min!,
                            ),
                            max!,
                        ),
                        precision,
                    )
                    setValue(nextValue)
                    onDraggingStop?.(nextValue)
                    break
                }

                case 'Home': {
                    event.preventDefault()
                    thumb.current?.focus()

                    if (stepOnMarks && marks) {
                        setValue(getFirstMarkValue(marks))
                        onDraggingStop?.(getFirstMarkValue(marks))
                        break
                    }

                    setValue(min!)
                    onDraggingStop?.(min!)
                    break
                }

                case 'End': {
                    event.preventDefault()
                    thumb.current?.focus()

                    if (stepOnMarks && marks) {
                        setValue(getLastMarkValue(marks))
                        onDraggingStop?.(getLastMarkValue(marks))
                        break
                    }

                    setValue(max!)
                    onDraggingStop?.(max!)
                    break
                }

                default: {
                    break
                }
            }
        }
    }

    return (
        <div
            {...rest}
            ref={useMergeRef(ref, root)}
            onKeyDownCapture={handleTrackKeydownCapture}
            onMouseDownCapture={() => root.current?.focus()}
        >
            <Track
                offset={0}
                filled={position}
                marks={marks}
                min={min!}
                max={max!}
                value={scaledValue}
                disabled={disabled}
                trackClass={classNames.track}
                barClass={classNames.bar}
                markClass={classNames.mark}
                direction={direction}
                containerProps={{
                    ref: container,
                    onMouseEnter: showTooltipOnHover
                        ? () => setHovered(true)
                        : undefined,
                    onMouseLeave: showTooltipOnHover
                        ? () => setHovered(false)
                        : undefined,
                }}
            >
                <Thumb
                    ref={thumb}
                    max={max!}
                    min={min!}
                    value={scaledValue}
                    position={position}
                    direction={direction}
                    dragging={active}
                    tooltip={_tooltip}
                    alwaysShowTooltip={alwaysShowTooltip}
                    thumbAriaLabel={thumbAriaLabel}
                    showTooltipOnHover={showTooltipOnHover}
                    isHovered={hovered}
                    disabled={disabled}
                    thumbClass={classNames.thumb}
                />
            </Track>

            <input
                type="hidden"
                name={name}
                value={scaledValue}
                {...inputProps}
            />
        </div>
    )
}

export default Slider
