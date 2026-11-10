import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import { toApiError } from './apiError'

export type CustomerStatus = 'ACTIVE' | 'BLOCKED' | 'INACTIVE'
export type CustomerAccountType = 'NON_CREDIT' | 'CREDIT'
export type CustomerCategory = 'RETAIL' | 'CORPORATE' | 'EMPLOYEE' | 'WHOLESALE'
export type PaymentTerm = 'IMMEDIATE' | 'NET_30'
export type CreditStatus = 'NOT_APPLICABLE' | 'PENDING' | 'APPROVED' | 'SUSPENDED'

export type Customer = {
    id: string
    /** Business number, e.g. CUST-000001 */
    customerNumber: string
    companyName: string
    contactName: string
    email: string
    phone: string
    currency: string
    creditLimit: number
    /** Server-maintained; negative when the customer is over their limit. */
    availableCredit: number
    status: CustomerStatus
    /** NON_CREDIT (cash, no credit limit) | CREDIT (credit limit, approval workflow) */
    customerAccountType: CustomerAccountType
    /** RETAIL | CORPORATE | EMPLOYEE | WHOLESALE */
    customerCategory: CustomerCategory
    /** IMMEDIATE (pay now) | NET_30 (pay within terms) */
    paymentTerms: PaymentTerm
    /** NOT_APPLICABLE (non-credit) | PENDING | APPROVED | SUSPENDED */
    creditStatus: CreditStatus
    /** Linked Shop (storefront) account, when one was referenced. */
    retailClientId: string | null
    /** Shop account profile (present when the customer references a shop account). */
    retailClient: { email: string; fullName: string } | null
    createdAt: string
    updatedAt: string
}

export type CustomerListParams = {
    /** Customer number, company, contact or email. */
    search?: string
    status?: CustomerStatus
}

export type CreateCustomerInput = {
    companyName: string
    contactName: string
    email: string
    phone?: string
    /** Required for CREDIT account type; NON_CREDIT customers carry no credit. */
    creditLimit?: number
    status?: CustomerStatus
    customerAccountType?: CustomerAccountType
    customerCategory?: CustomerCategory
    paymentTerms?: PaymentTerm
    creditStatus?: CreditStatus
    /** RETAIL: link an existing shop login… */
    retailClientId?: string
    /** …or create one with the customer's email and this password. */
    password?: string
}

export type UpdateCustomerInput = Partial<
    Omit<
        CreateCustomerInput,
        'customerAccountType' | 'customerCategory' | 'retailClientId' | 'password'
    >
>

/** Shop (storefront) account shown in the Add New Customer reference picker. */
export type ShopAccount = {
    id: string
    email: string
    fullName: string
    phone: string
    addressLabel: string | null
    linkedCustomer: {
        id: string
        customerNumber: string
        companyName: string
    } | null
}

type DecimalString = string | number

type ApiCustomer = Omit<
    Customer,
    | 'creditLimit'
    | 'availableCredit'
    | 'status'
    | 'customerAccountType'
    | 'customerCategory'
    | 'paymentTerms'
    | 'creditStatus'
> & {
    creditLimit: DecimalString
    availableCredit: DecimalString
    status: string
    customerAccountType?: string
    customerCategory?: string
    paymentTerms?: string
    creditStatus?: string
}

const BASE_PATH = '/sd/customers'

const toCustomer = (row: ApiCustomer): Customer => ({
    ...row,
    creditLimit: Number(row.creditLimit),
    availableCredit: Number(row.availableCredit),
    status: row.status === 'BLOCKED' ? 'BLOCKED' : row.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    customerAccountType:
        row.customerAccountType === 'CREDIT' ? 'CREDIT' : 'NON_CREDIT',
    customerCategory:
        row.customerCategory === 'CORPORATE' ||
        row.customerCategory === 'EMPLOYEE' ||
        row.customerCategory === 'WHOLESALE'
            ? row.customerCategory
            : 'RETAIL',
    paymentTerms: row.paymentTerms === 'NET_30' ? 'NET_30' : 'IMMEDIATE',
    creditStatus:
        row.creditStatus === 'PENDING' ||
        row.creditStatus === 'APPROVED' ||
        row.creditStatus === 'SUSPENDED'
            ? row.creditStatus
            : 'NOT_APPLICABLE',
    retailClientId: row.retailClientId ?? null,
    retailClient: row.retailClient ?? null,
})

/** GET /sd/customers/shop-accounts — Shop accounts for the Add New Customer picker. */
export async function getShopAccounts(): Promise<ShopAccount[]> {
    try {
        const { data } = await ErpAxiosBase.get<ShopAccount[]>(
            `${BASE_PATH}/shop-accounts`,
        )
        return data
    } catch (error) {
        throw toApiError(error, 'Unable to load shop accounts')
    }
}

/** GET /sd/customers — sorted by company name. */
export async function getCustomers(
    params: CustomerListParams = {},
): Promise<Customer[]> {
    const search = params.search?.trim()
    try {
        const { data } = await ErpAxiosBase.get<ApiCustomer[]>(BASE_PATH, {
            params: { search: search || undefined, status: params.status },
        })
        return data.map(toCustomer)
    } catch (error) {
        throw toApiError(error, 'Unable to load customers')
    }
}

/** POST /sd/customers — available credit starts equal to the credit limit. */
export async function createCustomer(
    input: CreateCustomerInput,
): Promise<Customer> {
    try {
        const { data } = await ErpAxiosBase.post<ApiCustomer>(BASE_PATH, input)
        return toCustomer(data)
    } catch (error) {
        throw toApiError(error, 'Unable to create customer')
    }
}

/** PATCH /sd/customers/:id — changing the limit shifts available credit by the same delta. */
export async function updateCustomer(
    id: string,
    input: UpdateCustomerInput,
): Promise<Customer> {
    try {
        const { data } = await ErpAxiosBase.patch<ApiCustomer>(
            `${BASE_PATH}/${encodeURIComponent(id)}`,
            input,
        )
        return toCustomer(data)
    } catch (error) {
        throw toApiError(error, 'Unable to update customer')
    }
}
