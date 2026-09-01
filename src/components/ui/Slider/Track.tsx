import Marks from './Marks'
import classNames from '../utils/classNames'
import type { ComponentProps, ReactNode } from 'react'
import type { TypeAttributes } from '../@types/common'

export interface TrackProps {
    filled: number
    offset?: number
    marksOffset?: number
    marks?: { value: number; label?: ReactNode }[]
    min: number
    max: number
    value: number
    children: ReactNode
    disabled?: boolean
    containerProps?: ComponentProps<'div'>
    trackClass?: string
    barClass?: string
    markClass?: string | ((isFilled: boolean) => string)
    direction: TypeAttributes.Direction
}

export function Track({
    filled,
    children,
    offset,
    disabled,
    marksOffset,
    containerProps,
    trackClass,
    barClass,
    markClass,
    ...rest
}: TrackProps) {
    return (
        <div className="slider-track-wrapper" {...containerProps}>
            <div className={classNames('slider-track', trackClass)}>
                <div
                    className={classNames(
                        'slider-bar',
                        disabled && 'disabled',
                        barClass,
                    )}
                    style={{
                        width: `calc(${filled}% + 6px)`,
                        ...(offset && {
                            insetInlineStart: `calc(${offset}% - 6px)`,
                        }),
                        insetInlineStart: `calc(${offset}% - 6px)`,
                    }}
                />

                {children}
                <Marks
                    {...rest}
                    markClass={markClass}
                    offset={marksOffset}
                    disabled={disabled}
                />
            </div>
        </div>
    )
}
export default Track
