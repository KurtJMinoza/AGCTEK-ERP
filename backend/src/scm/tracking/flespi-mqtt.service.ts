import {
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common'
import mqtt, { type MqttClient } from 'mqtt'
import { TrackingService } from './tracking.service'

/**
 * Outbound MQTT consumer for flespi cloud (no inbound tunnel required).
 * Topic: flespi/message/gw/channels/{FLESPI_CHANNEL_ID}/+
 */
@Injectable()
export class FlespiMqttService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(FlespiMqttService.name)
    private client: MqttClient | null = null
    private intentionalClose = false

    constructor(private readonly trackingService: TrackingService) {}

    onModuleInit() {
        const token = process.env.FLESPI_TOKEN?.trim()
        const channelId = process.env.FLESPI_CHANNEL_ID?.trim()
        if (!token || !channelId) {
            this.logger.warn(
                'Flespi MQTT disabled — set FLESPI_TOKEN and FLESPI_CHANNEL_ID (see docs/SCM_FLESPI_VL502.md)',
            )
            return
        }

        // Defer connect so Nest boot is never blocked by MQTT handshake
        setImmediate(() => {
            try {
                this.connect(token, channelId)
            } catch (err) {
                this.logger.error(
                    `Flespi MQTT connect failed (API stays up): ${err instanceof Error ? err.message : err}`,
                )
            }
        })
    }

    onModuleDestroy() {
        this.intentionalClose = true
        if (this.client) {
            try {
                this.client.end(true)
            } catch {
                /* ignore */
            }
            this.client = null
        }
    }

    private connect(token: string, channelIdRaw: string) {
        const channelId = normalizeFlespiChannelId(channelIdRaw)
        if (!channelId) {
            this.logger.error(
                `Invalid FLESPI_CHANNEL_ID="${channelIdRaw}". Use the numeric id (e.g. 1438873), not ch….flespi.gw:port`,
            )
            return
        }

        const host = process.env.FLESPI_MQTT_HOST?.trim() || 'mqtt.flespi.io'
        const port = Number(process.env.FLESPI_MQTT_PORT) || 8883
        const topic = `flespi/message/gw/channels/${channelId}/+`
        const url = `mqtts://${host}:${port}`

        this.logger.log(`Connecting flespi MQTT ${url} topic=${topic}`)

        const client = mqtt.connect(url, {
            username: token,
            password: '',
            clientId: `agctek-scm-${channelId}-${process.pid}`,
            clean: true,
            reconnectPeriod: 5_000,
            connectTimeout: 30_000,
            protocolVersion: 4,
        })

        this.client = client

        client.on('connect', () => {
            this.logger.log('Flespi MQTT connected')
            client.subscribe(topic, { qos: 0 }, (err) => {
                if (err) {
                    this.logger.error(`Flespi subscribe failed: ${err.message}`)
                    return
                }
                this.logger.log(`Subscribed ${topic}`)
            })
        })

        client.on('reconnect', () => {
            if (!this.intentionalClose) {
                this.logger.warn('Flespi MQTT reconnecting…')
            }
        })

        client.on('error', (err) => {
            // Do not rethrow — keep Nest process alive
            this.logger.error(`Flespi MQTT error: ${err.message}`)
        })

        client.on('close', () => {
            if (!this.intentionalClose) {
                this.logger.warn('Flespi MQTT connection closed')
            }
        })

        client.on('message', (msgTopic, payload) => {
            void this.onMessage(msgTopic, payload)
        })
    }

    private async onMessage(topic: string, payload: Buffer) {
        try {
            const text = payload.toString('utf8')
            let parsed: unknown
            try {
                parsed = JSON.parse(text)
            } catch {
                this.logger.warn(
                    `Flespi MQTT non-JSON on ${topic} (${text.slice(0, 80)}…)`,
                )
                return
            }

            const result = await this.trackingService.ingest(parsed)
            if (
                result &&
                typeof result === 'object' &&
                'ignored' in result &&
                (result as { ignored?: boolean }).ignored
            ) {
                // already logged inside ingest for unknown devices
                return
            }
        } catch (err) {
            this.logger.error(
                `Flespi MQTT message handling failed: ${err instanceof Error ? err.message : err}`,
            )
        }
    }
}

/** Accept "1438873" or accidental "ch1438873.flespi.gw:37179". */
function normalizeFlespiChannelId(raw: string): string | null {
    const trimmed = raw.trim()
    if (/^\d+$/.test(trimmed)) return trimmed
    const fromHost = trimmed.match(/ch(\d+)\.flespi\.gw/i)
    if (fromHost?.[1]) return fromHost[1]
    const digits = trimmed.match(/(\d{4,})/)
    return digits?.[1] ?? null
}
