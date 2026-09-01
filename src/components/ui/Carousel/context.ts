import { createContext, useContext } from 'react'

export type CarouselOrientation = 'horizontal' | 'vertical'

export interface ScrollInfo {
    snaps: number[]
    maxScroll: number
    itemPositions: number[]
}

export interface CarouselApi {
    scrollPrev: () => void
    scrollNext: () => void
    canScrollPrev: boolean
    canScrollNext: boolean
    selectedIndex: number
    scrollTo: (index: number) => void
    scrollSnapCount: number
}

export interface CarouselContextProps {
    orientation: CarouselOrientation
    scrollPrev: () => void
    scrollNext: () => void
    canScrollPrev: boolean
    canScrollNext: boolean
    selectedIndex: number
    scrollTo: (index: number) => void
    scrollPosition: number
    itemCount: number
    setItemCount: (count: number) => void
    scrollInfo: ScrollInfo
    setScrollInfo: (info: ScrollInfo) => void
    containerRef: React.RefObject<HTMLDivElement | null>
    isDragging: boolean
    setIsDragging: (dragging: boolean) => void
    setDragOffset: (offset: number) => void
    loop: boolean
}

const CarouselContext = createContext<CarouselContextProps | null>(null)

export const CarouselContextProvider = CarouselContext.Provider

export function useCarousel() {
    const context = useContext(CarouselContext)
    if (!context) {
        throw new Error('useCarousel must be used within a <Carousel />')
    }
    return context
}

export default CarouselContext
