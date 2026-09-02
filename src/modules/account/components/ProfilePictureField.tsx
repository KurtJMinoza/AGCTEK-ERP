'use client'

import { useRef, useState, type ChangeEvent } from 'react'
import Avatar from '@/components/ui/Avatar'
import Button from '@/components/ui/Button'
import toast from '@/components/ui/toast'
import Notification from '@/components/ui/Notification'
import ProfilePictureCropDialog from '@/modules/account/components/ProfilePictureCropDialog'
import { loadImageFromFile } from '@/modules/account/utils/cropImage'
import { PiCameraDuotone, PiTrashDuotone, PiUserDuotone } from 'react-icons/pi'

const MAX_FILE_SIZE = 2 * 1024 * 1024
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

type ProfilePictureFieldProps = {
    value?: string
    userName?: string
    saving?: boolean
    onUpload: (avatar: string) => Promise<void>
    onRemove: () => Promise<void>
}

const ProfilePictureField = ({
    value,
    userName,
    saving = false,
    onUpload,
    onRemove,
}: ProfilePictureFieldProps) => {
    const inputRef = useRef<HTMLInputElement>(null)
    const [uploading, setUploading] = useState(false)
    const [cropOpen, setCropOpen] = useState(false)
    const [selectedImage, setSelectedImage] = useState<HTMLImageElement | null>(
        null,
    )

    const resetCropState = () => {
        setCropOpen(false)
        setSelectedImage(null)
    }

    const handleSelectFile = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]

        event.target.value = ''

        if (!file) {
            return
        }

        if (!ACCEPTED_TYPES.includes(file.type)) {
            toast.push(
                <Notification type="danger" title="Invalid file type">
                    Please upload a JPG, PNG, WEBP, or GIF image.
                </Notification>,
                { placement: 'top-center' },
            )
            return
        }

        if (file.size > MAX_FILE_SIZE) {
            toast.push(
                <Notification type="danger" title="File too large">
                    Profile pictures must be 2MB or smaller.
                </Notification>,
                { placement: 'top-center' },
            )
            return
        }

        try {
            const image = await loadImageFromFile(file)
            setSelectedImage(image)
            setCropOpen(true)
        } catch {
            toast.push(
                <Notification type="danger" title="Upload failed">
                    Unable to open the selected image.
                </Notification>,
                { placement: 'top-center' },
            )
        }
    }

    const handleApplyCrop = async (avatar: string) => {
        setUploading(true)

        try {
            await onUpload(avatar)
            resetCropState()
        } catch {
            toast.push(
                <Notification type="danger" title="Upload failed">
                    Unable to upload profile picture.
                </Notification>,
                { placement: 'top-center' },
            )
        } finally {
            setUploading(false)
        }
    }

    const isBusy = saving || uploading

    return (
        <>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <Avatar
                    size={96}
                    shape="circle"
                    src={value || undefined}
                    icon={<PiUserDuotone />}
                />

                <div className="flex flex-col gap-3">
                    <div>
                        <h5 className="font-semibold heading-text">
                            Profile picture
                        </h5>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            Upload a photo for {userName || 'your account'}.
                            JPG, PNG, WEBP, or GIF up to 2MB.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <input
                            ref={inputRef}
                            type="file"
                            accept={ACCEPTED_TYPES.join(',')}
                            className="hidden"
                            onChange={handleSelectFile}
                        />
                        <Button
                            variant="solid"
                            size="sm"
                            icon={<PiCameraDuotone />}
                            loading={isBusy}
                            onClick={() => inputRef.current?.click()}
                        >
                            Upload photo
                        </Button>
                        {value ? (
                            <Button
                                variant="plain"
                                size="sm"
                                icon={<PiTrashDuotone />}
                                loading={isBusy}
                                onClick={onRemove}
                            >
                                Remove
                            </Button>
                        ) : null}
                    </div>
                </div>
            </div>

            <ProfilePictureCropDialog
                image={selectedImage}
                isOpen={cropOpen}
                applying={uploading}
                onClose={resetCropState}
                onApply={handleApplyCrop}
            />
        </>
    )
}

export default ProfilePictureField
