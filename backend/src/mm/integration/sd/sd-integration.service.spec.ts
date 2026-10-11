import { ReservationEngineService } from '../../inventory/reservation-allocation/reservation-engine.service'
import { AllocationEngineService } from '../../inventory/reservation-allocation/allocation-engine.service'
import { SdIntegrationService } from './sd-integration.service'

describe('SdIntegrationService warehouse release', () => {
    function setup() {
        const reservations = {
            createIdempotent: jest.fn(),
        }
        const allocations = {
            ensurePickTasksForHeader: jest
                .fn()
                .mockResolvedValue([{ id: 'pick-1' }]),
        }
        const service = new SdIntegrationService(
            {} as never,
            reservations as unknown as ReservationEngineService,
            undefined,
            allocations as unknown as AllocationEngineService,
        )
        jest.spyOn(service, 'reserveDemand').mockResolvedValue({
            reservationHeaderId: 'reservation-1',
            reservationNumber: 'RSV-1',
            status: 'RESERVED',
            lines: [],
        })
        return { service, allocations }
    }

    it('reserves then generates picking work for an e-commerce sales order', async () => {
        const { service, allocations } = setup()

        await service.reserveFromSalesOrderPayload({
            salesOrderId: 'so-1',
            companyId: 'company-1',
            warehouseId: 'warehouse-1',
            channel: 'ECOMMERCE',
            lines: [
                {
                    lineId: 'so-line-1',
                    materialId: 'material-1',
                    quantity: '3',
                },
            ],
        })

        expect(service.reserveDemand).toHaveBeenCalledWith(
            expect.objectContaining({
                sourceDocumentId: 'so-1',
                lines: [
                    expect.objectContaining({
                        materialId: 'material-1',
                        quantity: 3,
                        demandReferenceLineId: 'so-line-1',
                    }),
                ],
            }),
        )
        expect(allocations.ensurePickTasksForHeader).toHaveBeenCalledWith(
            'reservation-1',
            'FIFO',
        )
    })

    it('does not release POS counter sales into warehouse picking', async () => {
        const { service, allocations } = setup()

        await service.reserveFromSalesOrderPayload({
            salesOrderId: 'so-1',
            companyId: 'company-1',
            warehouseId: 'warehouse-1',
            channel: 'POS',
            lines: [],
        })

        expect(allocations.ensurePickTasksForHeader).not.toHaveBeenCalled()
    })

    it('surfaces allocation failures instead of silently leaving an order without a pick task', async () => {
        const { service, allocations } = setup()
        allocations.ensurePickTasksForHeader.mockRejectedValueOnce(
            new Error('No pickable source bin'),
        )

        await expect(
            service.reserveFromSalesOrderPayload({
                salesOrderId: 'so-1',
                companyId: 'company-1',
                warehouseId: 'warehouse-1',
                channel: 'ECOMMERCE',
                lines: [],
            }),
        ).rejects.toThrow('No pickable source bin')
    })

    it('fails the event when reservation succeeds but no picking task exists', async () => {
        const { service, allocations } = setup()
        allocations.ensurePickTasksForHeader.mockResolvedValueOnce([])

        await expect(
            service.reserveFromSalesOrderPayload({
                salesOrderId: 'so-1',
                companyId: 'company-1',
                warehouseId: 'warehouse-1',
                channel: 'ECOMMERCE',
                lines: [
                    {
                        lineId: 'so-line-1',
                        materialId: 'material-1',
                        quantity: '3',
                    },
                ],
            }),
        ).rejects.toThrow(
            'No picking tasks were created for reservation reservation-1',
        )
    })
})
