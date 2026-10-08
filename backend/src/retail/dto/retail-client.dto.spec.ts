import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { RetailRegisterDto } from './retail-client.dto'
import { RetailAddressUpsertDto } from './retail-address.dto'

describe('RetailRegisterDto', () => {
    it('accepts exactly the trimmed account-registration fields', async () => {
        const dto = plainToInstance(RetailRegisterDto, {
            email: ' Shopper@Example.com ',
            firstName: ' Juan ',
            password: 'StrongPass1',
        })

        await expect(validate(dto)).resolves.toEqual([])
        expect(dto.email).toBe('shopper@example.com')
        expect(dto.firstName).toBe('Juan')
    })

    it('does not require phone or delivery-address fields at registration', async () => {
        const dto = plainToInstance(RetailRegisterDto, {
            email: 'shopper@example.com',
            firstName: 'Juan',
            password: 'StrongPass1',
        })

        await expect(validate(dto)).resolves.toEqual([])
    })
})

describe('RetailAddressUpsertDto', () => {
    it('validates address type and final map coordinate bounds', async () => {
        const dto = plainToInstance(RetailAddressUpsertDto, {
            addressType: 'HOME',
            latitude: 7.0731,
            longitude: 125.6128,
        })
        await expect(validate(dto)).resolves.toEqual([])

        const invalid = plainToInstance(RetailAddressUpsertDto, {
            ...dto,
            latitude: 91,
            longitude: -181,
        })
        const errors = await validate(invalid)
        expect(errors.map((error) => error.property)).toEqual(
            expect.arrayContaining(['latitude', 'longitude']),
        )
    })
})
