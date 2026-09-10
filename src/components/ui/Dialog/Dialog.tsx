import Modal from 'react-modal'
import classNames from 'classnames'
import CloseButton from '../CloseButton'
import { motion } from 'framer-motion'
import useWindowSize from '../hooks/useWindowSize'
import type ReactModal from 'react-modal'
import type { CSSProperties, MouseEvent } from 'react'

export interface DialogProps extends ReactModal.Props {
    closable?: boolean
    contentClassName?: string
    height?: string | number
    onClose?: (e: MouseEvent<HTMLSpanElement>) => void
    width?: number
}

const Dialog = (props: DialogProps) => {
    const currentSize = useWindowSize()

    const {
        bodyOpenClassName,
        children,
        className,
        closable = true,
        closeTimeoutMS = 150,
        contentClassName,
        height,
        isOpen,
        onClose,
        overlayClassName,
        portalClassName,
        style,
        width = 520,
        ...rest
    } = props

    const onCloseClick = (e: MouseEvent<HTMLSpanElement>) => {
        onClose?.(e)
    }

    const renderCloseButton = (
        <CloseButton
            absolute
            className="ltr:right-4 rtl:left-4 top-4 z-10 sm:ltr:right-5 sm:rtl:left-5"
            onClick={onCloseClick}
        />
    )

    const viewportW = currentSize.width
    const isCompact =
        typeof viewportW === 'number' && viewportW > 0 && viewportW <= Math.max(width + 32, 480)

    const contentStyle: { content: CSSProperties; overlay?: CSSProperties } = {
        content: {
            position: 'relative',
            inset: 'auto',
            top: 'auto',
            left: 'auto',
            right: 'auto',
            bottom: 'auto',
            margin: 0,
            width: isCompact ? 'calc(100vw - 1.5rem)' : width,
            maxWidth: `min(${width}px, calc(100vw - 1.5rem))`,
            maxHeight: 'calc(100dvh - 1.5rem)',
            height: 'auto',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            ...(style?.content ?? {}),
        },
        overlay: style?.overlay,
    }

    if (height !== undefined) {
        contentStyle.content.height = height
    }

    const dialogClass = classNames('dialog-content', contentClassName)

    return (
        <Modal
            className={{
                base: classNames('dialog', className as string),
                afterOpen: 'dialog-after-open',
                beforeClose: 'dialog-before-close',
            }}
            overlayClassName={{
                base: classNames(
                    'dialog-overlay !fixed !inset-0 !flex !items-center !justify-center !p-3 sm:!p-4',
                    overlayClassName as string,
                ),
                afterOpen: 'dialog-overlay-after-open',
                beforeClose: 'dialog-overlay-before-close',
            }}
            portalClassName={classNames('dialog-portal', portalClassName)}
            bodyOpenClassName={classNames('dialog-open', bodyOpenClassName)}
            ariaHideApp={false}
            isOpen={isOpen}
            style={contentStyle}
            closeTimeoutMS={closeTimeoutMS}
            {...rest}
        >
            <motion.div
                className={dialogClass}
                initial={{ opacity: 0, transform: 'translateY(8px) scale(0.98)' }}
                animate={{
                    opacity: isOpen ? 1 : 0,
                    transform: isOpen
                        ? 'translateY(0) scale(1)'
                        : 'translateY(8px) scale(0.98)',
                }}
                transition={{ duration: 0.15 }}
            >
                {closable && renderCloseButton}
                {children}
            </motion.div>
        </Modal>
    )
}

Dialog.displayName = 'Dialog'

export default Dialog
