import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets'
import { Logger } from '@nestjs/common'
import { Server } from 'socket.io'

export type VehiclePositionEvent = {
    vehicleId: string
    plateNumber: string
    telematicsDeviceId: string | null
    latitude: number
    longitude: number
    speedKmh: number
    heading: number | null
    recordedAt: string
    gpsLogId: string
    odometerKm?: number
}

@WebSocketGateway({
    namespace: '/scm-tracking',
    cors: {
        origin: (
            process.env.FRONTEND_URL || 'http://localhost:3000'
        )
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .concat(['http://localhost:3000', 'http://127.0.0.1:3000']),
        credentials: true,
        methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
})
export class TrackingGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    private readonly logger = new Logger(TrackingGateway.name)

    @WebSocketServer()
    server!: Server

    afterInit() {
        this.logger.log('SCM tracking WebSocket gateway initialized (/scm-tracking)')
    }

    handleConnection(client: { id: string }) {
        this.logger.log(`Client connected ${client.id}`)
    }

    handleDisconnect(client: { id: string }) {
        this.logger.log(`Client disconnected ${client.id}`)
    }

    emitVehiclePosition(payload: VehiclePositionEvent) {
        this.server?.emit('vehicle.position', payload)
    }

    emitGeofenceEvent(payload: {
        id: string
        geofenceId: string
        geofenceCode: string
        geofenceName: string
        vehicleId: string
        detect: string
        latitude: number
        longitude: number
        detectedAt: string
    }) {
        this.server?.emit('geofence.event', payload)
    }
}
