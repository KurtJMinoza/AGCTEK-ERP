'use client'

import { useState } from 'react'
import Segment from '@/components/ui/Segment'
import { VehicleCompliancePanel } from './VehicleCompliancePanel'
import { VehicleMaintenancePanel } from '../VehicleDetailPanels'
import type { MaintenanceRecord } from '../../types'

type MaintPane = 'docs' | 'service'

type VehicleMaintenanceSectionProps = {
    vehicleId: string
    maintenanceRecords: MaintenanceRecord[]
    /** Prefer docs when vehicle has compliance alerts */
    defaultPane?: MaintPane
}

/**
 * Vehicle Maintenance tab body: Docs (OR/CR/insurance) | Service (work orders).
 */
export default function VehicleMaintenanceSection({
    vehicleId,
    maintenanceRecords,
    defaultPane = 'docs',
}: VehicleMaintenanceSectionProps) {
    const [pane, setPane] = useState<MaintPane>(defaultPane)

    return (
        <div className="space-y-4">
            <Segment
                value={pane}
                size="sm"
                onChange={(value) => setPane(value as MaintPane)}
            >
                <Segment.Item value="docs">Docs</Segment.Item>
                <Segment.Item value="service">Service</Segment.Item>
            </Segment>

            {pane === 'docs' ? (
                <VehicleCompliancePanel vehicleId={vehicleId} />
            ) : (
                <VehicleMaintenancePanel records={maintenanceRecords} />
            )}
        </div>
    )
}
