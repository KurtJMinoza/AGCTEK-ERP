import type { Ref } from 'react'
import classNames from '../utils/classNames'
import { useCarousel } from './context'
import type { CommonProps } from '../@types/common'

export interface CarouselItemProps extends CommonProps {
    ref?: Ref<HTMLDivElement>
}

const CarouselItem = (props: CarouselItemProps) => {
    const { className, children, ref, ...rest } = props
    const { orientation } = useCarousel()

    const itemClass = classNames(
        'min-w-0 shrink-0 grow-0 basis-full',
        orientation === 'horizontal' ? 'px-2' : 'py-2',
        className,
    )

    return (
        <div
            ref={ref}
            role="group"
            aria-roledescription="slide"
            className={itemClass}
            {...rest}
        >
            {children}
        </div>
    )
}

export default CarouselItem
