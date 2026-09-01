import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayInit,
} from '@nestjs/websockets'
import { Server } from 'socket.io'
import type { NotificationRecord } from './notification.types'

@WebSocketGateway({
    namespace: '/notifications',
    cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        credentials: true,
    },
})
export class NotificationsGateway implements OnGatewayInit {
    @WebSocketServer()
    server!: Server

    afterInit() {
        console.log('Notifications WebSocket gateway initialized')
    }

    emitNotification(notification: NotificationRecord) {
        this.server.emit('notification:new', notification)
    }

    emitCount(count: number) {
        this.server.emit('notifications:count', { count })
    }
}
