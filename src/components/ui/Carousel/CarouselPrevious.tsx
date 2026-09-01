import Button from '../Button'
import classNames from '../utils/classNames'
import { useCarousel } from './context'
import { HiChevronLeft } from 'react-icons/hi'
import type { ComponentPropsWithoutRef } from 'react'

export type CarouselPreviousProps = Omit<
    ComponentPropsWithoutRef<typeof Button>,
    'icon' | 'shape' | 'aria-label'
>

const CarouselPrevious = (props: CarouselPreviousProps) => {
    const { className, variant = 'default', size = 'sm', ...rest } = props
    const { orientation, scrollPrev, canScrollPrev } = useCarousel()

    const buttonClass = classNames(
        orientation === 'vertical' && 'rotate-90',
        className,
    )

    return (
        <Button
            variant={variant}
            size={size}
            className={buttonClass}
            disabled={!canScrollPrev}
            shape="circle"
            aria-label="Previous slide"
            icon={<HiChevronLeft />}
            onClick={scrollPrev}
            {...rest}
        />
    )
}

export default CarouselPrevious
