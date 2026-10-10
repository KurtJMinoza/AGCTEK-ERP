'use client'

import { useState, type ComponentProps } from 'react'
import Button from '@/components/ui/Button'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { HiOutlineDownload } from 'react-icons/hi'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'
import {
    downloadQuotationPdf,
    type Quotation,
} from '@/modules/sd/services/quotationService'

type DownloadQuotationPdfButtonProps = {
    quotation: Pick<Quotation, 'id' | 'quotationNumber' | 'revision'>
    size?: ComponentProps<typeof Button>['size']
}

/** Fetches the SD-generated quotation PDF and triggers a browser download. Never mutates the quotation. */
export default function DownloadQuotationPdfButton({
    quotation,
    size = 'sm',
}: DownloadQuotationPdfButtonProps) {
    const [loading, setLoading] = useState(false)

    const download = async () => {
        setLoading(true)
        try {
            const { blob, filename } = await downloadQuotationPdf(quotation.id)
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = filename ?? `${quotation.quotationNumber}_rev${quotation.revision}.pdf`
            link.click()
            URL.revokeObjectURL(url)
        } catch (err) {
            toast.push(
                <Notification type="danger" title="Download failed" closable duration={4000}>
                    {getApiErrorMessage(err, 'Could not download the quotation PDF')}
                </Notification>,
                { placement: 'top-end' },
            )
        } finally {
            setLoading(false)
        }
    }

    return (
        <Button size={size} icon={<HiOutlineDownload />} loading={loading} onClick={() => void download()}>
            Download PDF
        </Button>
    )
}