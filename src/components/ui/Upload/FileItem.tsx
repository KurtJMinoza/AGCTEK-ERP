import DocumentFileDisplay from '@/components/shared/DocumentFileDisplay'
import type { CommonProps } from '../@types/common'

export interface FileItemProps extends CommonProps {
    file: File
}

const FileItem = (props: FileItemProps) => {
    const { file, children, className } = props
    const { type, name, size } = file
    const isImageFile = type.split('/')[0] === 'image'
    const previewSrc = isImageFile ? URL.createObjectURL(file) : null

    return (
        <DocumentFileDisplay
            className={className}
            fileName={name}
            mimeType={type}
            sizeBytes={size}
            previewSrc={previewSrc}
        >
            {children}
        </DocumentFileDisplay>
    )
}

FileItem.displayName = 'UploadFileItem'

export default FileItem
