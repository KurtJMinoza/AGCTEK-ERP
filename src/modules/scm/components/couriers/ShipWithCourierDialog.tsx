'use client'

import { useEffect, useState } from 'react'
import Alert from '@/components/ui/Alert'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { Form, FormItem } from '@/components/ui/Form'
import FormDialog from '@/components/shared/FormDialog'
import { apiBookConsignment, apiGetCarriers } from '../../services/scmApi'
import { getApiErrorMessage } from '../../utils/apiError'
import type { Carrier, Shipment } from '../../types'

type Option = { value: string; label: string }

type Props = {
    shipment: Shipment | null
    onClose: () => void
    onBooked: () => void
}

/**
 * Ship with courier: hand a READY shipment to a third-party courier instead of a trip.
 * The courier's tracking number (AWB) is entered by hand until a courier API exists.
 */
export default function ShipWithCourierDialog({ shipment, onClose, onBooked }: Props) {
    const [carriers, setCarriers] = useState<Carrier[]>([])
    const [carrierId, setCarrierId] = useState('')
    const [trackingNumber, setTrackingNumber] = useState('')
    const [notes, setNotes] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!shipment) return
        setCarrierId('')
        setTrackingNumber('')
        setNotes('')
        setError(null)
        apiGetCarriers({ isActive: true, pageSize: 100 })
            .then((res) => setCarriers(res.data))
            .catch((err) =>
                setError(getApiErrorMessage(err, 'Failed to load couriers')),
            )
    }, [shipment])

    const options: Option[] = carriers.map((c) => ({
        value: c.id,
        label: `${c.name} (${c.code})`,
    }))

    const submit = async () => {
        if (!shipment) return
        if (!carrierId) {
            setError('Choose a courier.')
            return
        }
        if (!trackingNumber.trim()) {
            setError(
                'Enter the tracking number from the courier waybill — book the parcel with the courier first.',
            )
            return
        }
        setSaving(true)
        setError(null)
        try {
            await apiBookConsignment({
                shipmentId: shipment.id,
                carrierId,
                trackingNumber: trackingNumber.trim(),
                notes: notes.trim() || undefined,
            })
            onBooked()
            onClose()
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to book courier'))
        } finally {
            setSaving(false)
        }
    }

    return (
        <FormDialog
            isOpen={Boolean(shipment)}
            onClose={onClose}
            title={`Ship with courier — ${shipment?.reference ?? ''}`}
            description={
                shipment
                    ? `${shipment.customerName || 'Customer'} · ${shipment.destAddress}`
                    : undefined
            }
            confirmText="Book courier"
            confirmLoading={saving}
            onSubmit={() => void submit()}
        >
            {error ? (
                <Alert showIcon type="danger" className="mb-4">
                    {error}
                </Alert>
            ) : null}
            <Form
                onSubmit={(e) => {
                    e.preventDefault()
                    void submit()
                }}
            >
                <FormItem label="Courier">
                    <Select<Option>
                        placeholder="Select a courier"
                        options={options}
                        value={options.find((o) => o.value === carrierId) ?? null}
                        onChange={(option) => setCarrierId(option?.value ?? '')}
                    />
                </FormItem>
                <FormItem label="Tracking number (AWB)">
                    <Input
                        value={trackingNumber}
                        placeholder="As printed on the courier waybill"
                        onChange={(e) => setTrackingNumber(e.target.value)}
                    />
                </FormItem>
                <FormItem label="Notes">
                    <Input
                        textArea
                        rows={2}
                        value={notes}
                        placeholder="Optional"
                        onChange={(e) => setNotes(e.target.value)}
                    />
                </FormItem>
            </Form>
            <p className="text-xs text-gray-500">
                The shipment leaves load building and trip planning. Stock is
                issued when you mark the parcel Picked Up. Cash on Delivery orders
                cannot ship with a courier yet.
            </p>
        </FormDialog>
    )
}
