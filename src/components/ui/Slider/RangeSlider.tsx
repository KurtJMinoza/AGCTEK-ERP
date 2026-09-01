import { useRef, useState, useEffect } from 'react'
import Thumb from './Thumb'
import Track from './Track'
import { useConfig } from '../ConfigProvider'
import useControllableState from '../hooks/useControllableState'
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
    ComponentPropsWithoutRef,
    ReactNode,
    MouseEvent,
    TouchEvent,
    KeyboardEvent,
} from 'react'

export type RangeSliderValue = [number, number]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getClientPosition(event: any) {
    if ('TouchEvent' in window && event instanceof window.TouchEvent) {
        const touch = event.touches[0]
        return touch.clientX
    }

    return event.clientX
}

export type RangeSliderProps = {
    classNames?: {
        thumb?: [string, string]
        bar?: string
        mark?: string
        track?: string
    }
    alwaysShowTooltip?: boolean
    defaultValue?: RangeSliderValue
    disabled?: boolean
    inputProps?: ComponentPropsWithoutRef<'input'>
    marks?: { value: number; tooltip?: ReactNode }[]
    max?: number
    maxRange?: number
    min?: number
    minRange?: number
    name?: string
    precision?: number
    onChange?: (value: RangeSliderValue) => void
    onDraggingStop?: (value: RangeSliderValue) => void
    ref?: Ref<HTMLDivElement>
    showTooltipOnHover?: boolean
    step?: number
    stepOnMarks?: boolean
    thumbArialLabelStart?: string
    thumbAriaLabelEnd?: string
    tooltip?: ReactNode | ((value: number) => ReactNode)
    value?: RangeSliderValue
}

const RangeSlider = (props: RangeSliderProps) => {
    const {
        classNames = {},
        value,
        onChange,
        onDraggingStop,
        min = 0,
        max = 100,
        minRange = 0,
        maxRange,
        step = 1,
        precision: _precision,
        defaultValue,
        name,
        marks = [],
        tooltip = (f) => f,
        alwaysShowTooltip = false,
        thumbArialLabelStart,
        thumbAriaLabelEnd,
        showTooltipOnHover = false,
        disabled = false,
        inputProps,
        stepOnMarks,
        ref = null,
        ...rest
    } = props

    const { direction } = useConfig()
    const [focused, setFocused] = useState(-1)
    const [hovered, setHovered] = useState(false)

    const [controlableValue, setValue] = useControllableState({
        prop: value,
        defaultProp: defaultValue,
        onChange,
    })

    const _value = controlableValue as RangeSliderValue

    const valueRef = useRef(_value as RangeSliderValue)
    const thumbs = useRef<HTMLDivElement[]>([])
    const thumbIndex = useRef<number | undefined>(undefined)
    const positions = [
        getPosition({ value: _value[0], min: min!, max: max! }),
        getPosition({ value: _value[1], min: min!, max: max! }),
    ]

    const precision = _precision ?? getPrecision(step!)

    const _setValue = (val: RangeSliderValue) => {
        setValue(val)
        valueRef.current = val
    }

    useEffect(
        () => {
            if (Array.isArray(value)) {
                valueRef.current = value
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        Array.isArray(value) ? [value[0], value[1]] : [null, null],
    )

    const setRangedValue = (
        val: number,
        index: number,
        triggerChangeEnd: boolean,
    ) => {
        if (index === -1) {
            return
        }

        const clone: RangeSliderValue = [...valueRef.current]

        if (stepOnMarks && marks) {
            const closest = getClosestNumber(
                val,
                marks.map((m) => m.value),
            )

            const current = clone[index]
            clone[index] = closest
            const otherIndex = index === 0 ? 1 : 0

            const lastMarkValue = getLastMarkValue(marks)
            const firstMarkValue = getFirstMarkValue(marks)

            if (
                closest === lastMarkValue &&
                clone[otherIndex] === lastMarkValue
            ) {
                clone[index] = current
            } else if (
                closest === firstMarkValue &&
                clone[otherIndex] === firstMarkValue
            ) {
                clone[index] = current
            } else if (closest === clone[otherIndex]) {
                if (current > clone[otherIndex]) {
                    clone[otherIndex] = getPreviousMarkValue(closest, marks)
                } else {
                    clone[otherIndex] = getNextMarkValue(closest, marks)
                }
            }
        } else {
            clone[index] = val

            if (index === 0) {
                if (val > clone[1] - (minRange! - 0.000000001)) {
                    clone[1] = Math.min(val + minRange!, max!)
                }

                if (val > (max! - (minRange! - 0.000000001) || min!)) {
                    clone[index] = valueRef.current[index]
                }

                if (clone[1] - val > maxRange!) {
                    clone[1] = val + maxRange!
                }
            }

            if (index === 1) {
                if (val < clone[0] + minRange!) {
                    clone[0] = Math.max(val - minRange!, min!)
                }

                if (val < clone[0] + minRange!) {
                    clone[index] = valueRef.current[index]
                }

                if (val - clone[0] > maxRange!) {
                    clone[0] = val - maxRange!
                }
            }
        }

        clone[0] = getFloatingValue(clone[0], precision)
        clone[1] = getFloatingValue(clone[1], precision)

        if (clone[0] > clone[1]) {
            const temp = clone[0]
            clone[0] = clone[1]
            clone[1] = temp
        }

        _setValue(clone)

        if (triggerChangeEnd) {
            onDraggingStop?.(valueRef.current)
        }
    }

    const handleChange = (val: number) => {
        if (!disabled) {
            const nextValue = getChangeValue({
                value: val,
                min: min!,
                max: max!,
                step: step!,
                precision,
            })
            setRangedValue(nextValue, thumbIndex.current!, false)
        }
    }

    const { ref: container, active } = useMove(
        ({ x }) => handleChange(x),
        { onScrubEnd: () => !disabled && onDraggingStop?.(valueRef.current) },
        direction,
    )

    function handleThumbMouseDown(index: number) {
        thumbIndex.current = index
    }

    const handleTrackMouseDownCapture = (
        event: MouseEvent<HTMLDivElement> | TouchEvent<HTMLDivElement>,
    ) => {
        container.current!.focus()
        const rect = container.current!.getBoundingClientRect()
        const changePosition = getClientPosition(event.nativeEvent)
        const changeValue = getChangeValue({
            value: changePosition - rect.left,
            max: max!,
            min: min!,
            step: step!,
            containerWidth: rect.width,
        })

        const nearestHandle =
            Math.abs(_value[0] - changeValue) >
            Math.abs(_value[1] - changeValue)
                ? 1
                : 0
        const _nearestHandle =
            direction === 'ltr' ? nearestHandle : nearestHandle === 1 ? 0 : 1

        thumbIndex.current = _nearestHandle
    }

    const getFocusedThumbIndex = () => {
        if (focused !== 1 && focused !== 0) {
            setFocused(0)
            return 0
        }

        return focused
    }

    const handleTrackKeydownCapture = (
        event: KeyboardEvent<HTMLDivElement>,
    ) => {
        if (!disabled) {
            switch (event.key) {
                case 'ArrowUp': {
                    event.preventDefault()
                    const focusedIndex = getFocusedThumbIndex()
                    thumbs.current[focusedIndex].focus()
                    const nextValue =
                        stepOnMarks && marks
                            ? getNextMarkValue(
                                  valueRef.current[focusedIndex],
                                  marks,
                              )
                            : Math.min(
                                  Math.max(
                                      valueRef.current[focusedIndex] + step!,
                                      min!,
                                  ),
                                  max!,
                              )
                    setRangedValue(
                        getFloatingValue(nextValue, precision),
                        focusedIndex,
                        true,
                    )
                    break
                }

                case 'ArrowRight': {
                    event.preventDefault()
                    const focusedIndex = getFocusedThumbIndex()
                    thumbs.current[focusedIndex].focus()

                    const nextValue =
                        stepOnMarks && marks
                            ? (direction === 'rtl'
                                  ? getPreviousMarkValue
                                  : getNextMarkValue)(
                                  valueRef.current[focusedIndex],
                                  marks,
                              )
                            : Math.min(
                                  Math.max(
                                      direction === 'rtl'
                                          ? valueRef.current[focusedIndex] -
                                                step!
                                          : valueRef.current[focusedIndex] +
                                                step!,
                                      min!,
                                  ),
                                  max!,
                              )

                    setRangedValue(
                        getFloatingValue(nextValue, precision),
                        focusedIndex,
                        true,
                    )
                    break
                }

                case 'ArrowDown': {
                    event.preventDefault()
                    const focusedIndex = getFocusedThumbIndex()
                    thumbs.current[focusedIndex].focus()
                    const nextValue =
                        stepOnMarks && marks
                            ? getPreviousMarkValue(
                                  valueRef.current[focusedIndex],
                                  marks,
                              )
                            : Math.min(
                                  Math.max(
                                      valueRef.current[focusedIndex] - step!,
                                      min!,
                                  ),
                                  max!,
                              )
                    setRangedValue(
                        getFloatingValue(nextValue, precision),
                        focusedIndex,
                        true,
                    )
                    break
                }

                case 'ArrowLeft': {
                    event.preventDefault()
                    const focusedIndex = getFocusedThumbIndex()
                    thumbs.current[focusedIndex].focus()

                    const nextValue =
                        stepOnMarks && marks
                            ? (direction === 'rtl'
                                  ? getNextMarkValue
                                  : getPreviousMarkValue)(
                                  valueRef.current[focusedIndex],
                                  marks,
                              )
                            : Math.min(
                                  Math.max(
                                      direction === 'rtl'
                                          ? valueRef.current[focusedIndex] +
                                                step!
                                          : valueRef.current[focusedIndex] -
                                                step!,
                                      min!,
                                  ),
                                  max!,
                              )

                    setRangedValue(
                        getFloatingValue(nextValue, precision),
                        focusedIndex,
                        true,
                    )
                    break
                }

                default: {
                    break
                }
            }
        }
    }

    const sharedThumbProps = {
        max: max!,
        min: min!,
        alwaysShowTooltip,
        onBlur: () => setFocused(-1),
    }

    return (
        <div {...rest} ref={ref}>
            <Track
                offset={positions[0]}
                marksOffset={_value[0]}
                filled={positions[1] - positions[0]}
                marks={marks}
                min={min!}
                max={max!}
                value={_value[1]}
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
                    onTouchStartCapture: handleTrackMouseDownCapture,
                    onTouchEndCapture: () => {
                        thumbIndex.current = -1
                    },
                    onMouseDownCapture: handleTrackMouseDownCapture,
                    onMouseUpCapture: () => {
                        thumbIndex.current = -1
                    },
                    onKeyDownCapture: handleTrackKeydownCapture,
                }}
            >
                <Thumb
                    {...sharedThumbProps}
                    ref={(node) => {
                        thumbs.current[0] = node!
                    }}
                    value={_value[0]}
                    position={positions[0]}
                    dragging={active}
                    direction={direction}
                    tooltip={
                        typeof tooltip === 'function'
                            ? tooltip(getFloatingValue(_value[0], precision))
                            : tooltip
                    }
                    thumbAriaLabel={thumbArialLabelStart}
                    showTooltipOnHover={showTooltipOnHover}
                    isHovered={hovered}
                    disabled={disabled}
                    thumbClass={classNames.thumb?.[0] ?? ''}
                    onMouseDown={() => handleThumbMouseDown(0)}
                    onFocus={() => setFocused(0)}
                />
                <Thumb
                    {...sharedThumbProps}
                    ref={(node) => {
                        thumbs.current[1] = node!
                    }}
                    thumbAriaLabel={thumbAriaLabelEnd}
                    value={_value[1]}
                    position={positions[1]}
                    direction={direction}
                    dragging={active}
                    tooltip={
                        typeof tooltip === 'function'
                            ? tooltip(getFloatingValue(_value[1], precision))
                            : tooltip
                    }
                    showTooltipOnHover={showTooltipOnHover}
                    isHovered={hovered}
                    disabled={disabled}
                    thumbClass={classNames.thumb?.[1] ?? ''}
                    onMouseDown={() => handleThumbMouseDown(1)}
                    onFocus={() => setFocused(1)}
                />
            </Track>
            <input
                type="hidden"
                name={`${name}-from`}
                value={_value[0]}
                {...inputProps}
            />
            <input
                type="hidden"
                name={`${name}-to`}
                value={_value[1]}
                {...inputProps}
            />
        </div>
    )
}

export default RangeSlider
