/**
 * TEMPORARY CRM sample for testing the Closed Won → SD Sales Order handoff.
 *
 *   npm run prisma:seed-crm-temp     → (re)create the sample (cleans first)
 *   npm run prisma:clean-crm-temp    → remove everything this script created
 *
 * Opportunities are never inserted as CLOSED_WON with an order: win them in the UI
 * (Opportunity → Close as won) so the real handoff (POST /crm/opportunities/:id/win)
 * creates the SD order. SD quotations are created through the real CRM/SD services
 * (create → send → accept / reject → revise), so numbering, pricing and status rules apply.
 * Test cases are prefixed in the opportunity name ([QUOTE SENT], [QUOTE DRAFT], …).
 *
 * Everything is tagged so cleanup touches nothing else:
 *   SdCustomer.customerNumber "TMP-CRM-*", SdProduct.sku "TMP-CRM-*", emails "@crm-temp.local",
 *   createdBy "seed-crm-temp", plus SD quotations / orders for these customers and opportunities.
 * The sample customers/products exist only because the handoff needs them; SD stays their owner.
 */
import type { INestApplicationContext } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const TAG = 'seed-crm-temp'
const CUSTOMER_PREFIX = 'TMP-CRM-'
const SKU_PREFIX = 'TMP-CRM-'
const PRODUCT_DIVISION = 'DIV_RETAIL'
const EMAIL_DOMAIN = '@crm-temp.local'
/** SD orders in these states have no MM / delivery effects and can be removed safely. */
const REMOVABLE_ORDER_STATUSES = ['DRAFT', 'CANCELLED']

function daysFromNow(days: number): Date {
    const d = new Date()
    d.setDate(d.getDate() + days)
    d.setHours(10, 0, 0, 0)
    return d
}

const CUSTOMERS = [
    { key: 'sunrisehotel', company: 'Sunrise Bay Hotel & Resort', contact: 'Carmela Aquino', phone: '+63 917 555 0201', creditLimit: 900000, tier: 'PLATINUM', churn: 0.06, notes: 'Boracay resort group — F&B and housekeeping supplies.' },
    { key: 'northpeak', company: 'North Peak Logistics Inc', contact: 'Daniel Mercado', phone: '+63 918 555 0202', creditLimit: 400000, tier: 'GOLD', churn: 0.15, notes: 'Clark-based 3PL; buys pallets and stretch film monthly.' },
    { key: 'cebutech', company: 'CebuTech Electronics Assembly', contact: 'Patricia Lim', phone: '+63 919 555 0203', creditLimit: 650000, tier: 'GOLD', churn: 0.21, notes: 'Mactan EPZ assembler; strict ESD packaging specs.' },
    { key: 'palawanfresh', company: 'Palawan Fresh Seafoods', contact: 'Rogelio Ventura', phone: '+63 920 555 0204', creditLimit: 120000, tier: 'SILVER', churn: 0.39, notes: 'Exporter; ice box demand peaks Nov–Feb.' },
    { key: 'tarlacmills', company: 'Tarlac Rice Mills Corp', contact: 'Evelyn Pascual', phone: '+63 921 555 0205', creditLimit: 60000, tier: 'BRONZE', churn: 0.71, notes: 'Credit hold — 90+ days overdue; SD will not take orders.', status: 'BLOCKED' },
] as const

type CustomerKey = (typeof CUSTOMERS)[number]['key']

const PRODUCTS = [
    { sku: 'LINEN-KS', name: 'King Bedsheet Set (300TC)', price: 1450, category: 'Hospitality' },
    { sku: 'TOWEL-BTH', name: 'Bath Towel 70x140cm', price: 320, category: 'Hospitality' },
    { sku: 'PALLET-HT', name: 'Heat-treated Wooden Pallet', price: 650, category: 'Logistics' },
    { sku: 'FILM-STR', name: 'Stretch Film Roll 20in x 1500ft', price: 540, category: 'Logistics' },
    { sku: 'BAG-ESD', name: 'Anti-static Shielding Bag 6x8in (100s)', price: 780, category: 'Electronics' },
    { sku: 'ICEBOX-50', name: 'Insulated Ice Box 50L', price: 2350, category: 'Cold Chain' },
    { sku: 'SACK-RICE', name: 'Laminated Rice Sack 25kg', price: 22, category: 'Packaging' },
] as const

type ProductSku = (typeof PRODUCTS)[number]['sku']
type QuoteLines = Array<[ProductSku, number]>
type QuoteSeed = {
    /** Final state of the quotation, reached through the real SD service transitions. */
    flow: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REVISED' | 'EXPIRED'
    lines: QuoteLines
    /** REVISED only: rev 1 is rejected, rev 2 gets these lines and is sent. */
    revisedLines?: QuoteLines
}
type OppSeed = {
    customer: CustomerKey
    name: string
    amount: number | null
    stage: string
    close: number
    closed?: number
    lead?: string
    lostReason?: string
    hint: string
    quote?: QuoteSeed
}

async function clean() {
    const [customers, opportunities] = await Promise.all([
        prisma.sdCustomer.findMany({ where: { customerNumber: { startsWith: CUSTOMER_PREFIX } }, select: { id: true } }),
        prisma.crmOpportunity.findMany({ where: { createdBy: TAG }, select: { id: true } }),
    ])
    const customerIds = customers.map((c) => c.id)
    const orderWhere = {
        OR: [
            { customerId: { in: customerIds } },
            { crmOpportunityId: { in: opportunities.map((o) => o.id) } },
        ],
    }

    const blocking = await prisma.sdSalesOrder.findMany({
        where: { ...orderWhere, status: { notIn: REMOVABLE_ORDER_STATUSES } },
        select: { orderNumber: true, status: true },
    })
    if (blocking.length) {
        throw new Error(
            `Cancel these SD orders in SD before cleaning (they may have MM/delivery effects): ` +
                blocking.map((o) => `${o.orderNumber} (${o.status})`).join(', '),
        )
    }

    const accountIds = (
        await prisma.crmLoyaltyAccount.findMany({ where: { customerId: { in: customerIds } }, select: { id: true } })
    ).map((a) => a.id)

    return prisma.$transaction(async (tx) => {
        const salesOrders = await tx.sdSalesOrder.deleteMany({ where: orderWhere })
        // Revisions point at their predecessor (Restrict): unlink before deleting.
        await tx.sdQuotation.updateMany({ where: orderWhere, data: { previousRevisionId: null } })
        const quotations = await tx.sdQuotation.deleteMany({ where: orderWhere })
        const products = await tx.sdProduct.deleteMany({ where: { divisionId: PRODUCT_DIVISION, sku: { startsWith: SKU_PREFIX } } })
        await tx.crmLoyaltyTransaction.deleteMany({ where: { loyaltyAccountId: { in: accountIds } } })
        const loyalty = await tx.crmLoyaltyAccount.deleteMany({ where: { id: { in: accountIds } } })
        const byTag = { OR: [{ customerId: { in: customerIds } }, { createdBy: TAG }] }
        const tickets = await tx.crmTicket.deleteMany({ where: byTag })
        const opps = await tx.crmOpportunity.deleteMany({ where: byTag })
        const leads = await tx.crmLead.deleteMany({ where: byTag })
        await tx.crmActivity.deleteMany({ where: { createdBy: TAG } })
        const profiles = await tx.crmProfile.deleteMany({ where: { customerId: { in: customerIds } } })
        const sdCustomers = await tx.sdCustomer.deleteMany({ where: { id: { in: customerIds } } })
        return {
            customers: sdCustomers.count,
            profiles: profiles.count,
            leads: leads.count,
            opportunities: opps.count,
            tickets: tickets.count,
            loyaltyAccounts: loyalty.count,
            sdProducts: products.count,
            sdQuotations: quotations.count,
            sdSalesOrders: salesOrders.count,
        }
    })
}

async function seed() {
    const removed = await clean()
    console.log('Cleaned previous sample:', JSON.stringify(removed))

    const owner = await prisma.user.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' }, select: { id: true } })

    const ids = {} as Record<CustomerKey, string>
    for (const [i, c] of CUSTOMERS.entries()) {
        const row = await prisma.sdCustomer.create({
            data: {
                customerNumber: `${CUSTOMER_PREFIX}${String(i + 1).padStart(4, '0')}`,
                companyName: c.company,
                contactName: c.contact,
                email: `${c.key}${EMAIL_DOMAIN}`,
                phone: c.phone,
                currency: 'PHP',
                creditLimit: c.creditLimit,
                availableCredit: c.creditLimit,
                status: 'status' in c ? c.status : 'ACTIVE',
                createdBy: TAG,
            },
        })
        ids[c.key] = row.id
        await prisma.crmProfile.create({
            data: { customerId: row.id, tier: c.tier, churnScore: c.churn, notes: c.notes, createdBy: TAG },
        })
    }

    // ── SD catalog products for the handoff lines (one division, PHP prices) ──
    const productIds = {} as Record<ProductSku, string>
    for (const [i, p] of PRODUCTS.entries()) {
        productIds[p.sku] = (await prisma.sdProduct.create({
            data: {
                divisionId: PRODUCT_DIVISION,
                sku: `${SKU_PREFIX}${p.sku}`,
                name: `${p.name} (CRM test)`,
                description: 'Temporary product for CRM → SD handoff testing.',
                price: p.price,
                category: p.category,
                productType: 'NON_STOCK_ITEM',
                sortOrder: 900 + i,
                createdBy: TAG,
            },
        })).id
    }

    // ── Leads ───────────────────────────────────────────────────────────
    const leadRows = [
        { name: 'Carmela Aquino (Sunrise Bay)', email: 'caquino.lead', source: 'EVENT', status: 'CONVERTED', score: 90, customer: 'sunrisehotel' as CustomerKey },
        { name: 'Patricia Lim (CebuTech)', email: 'plim.lead', source: 'WEBSITE', status: 'CONVERTED', score: 84, customer: 'cebutech' as CustomerKey },
        { name: 'Subic Bay Shipyard Services', email: 'subicshipyard', source: 'REFERRAL', status: 'QUALIFIED', score: 70 },
        { name: 'Laguna Dairy Farms', email: 'lagunadairy', source: 'CAMPAIGN', status: 'CONTACTED', score: 52 },
        { name: 'Bohol Craft Exports', email: 'boholcraft', source: 'WALK_IN', status: 'NEW', score: 34 },
        { name: 'Quezon City Print Hub', email: 'qcprinthub', source: 'COLD_CALL', status: 'UNQUALIFIED', score: 15 },
    ]
    const leadIds: Record<string, string> = {}
    for (const l of leadRows) {
        const row = await prisma.crmLead.create({
            data: {
                name: l.name,
                email: `${l.email}${EMAIL_DOMAIN}`,
                phone: '+63 900 555 0199',
                source: l.source,
                status: l.status,
                score: l.score,
                customerId: l.customer ? ids[l.customer] : null,
                createdBy: TAG,
            },
        })
        leadIds[l.email] = row.id
    }

    // ── Opportunities: quotation scenarios + failure / retry cases ─────
    const opps: OppSeed[] = [
        { customer: 'sunrisehotel', name: '[QUOTE SENT] Room linen refresh — 120 rooms', amount: 250800, stage: 'NEGOTIATION', close: 6, lead: 'caquino.lead',
            hint: 'Quotation is SENT. Close as won without adding lines: the SD order is built from the quotation (quotation → CONVERTED).',
            quote: { flow: 'SENT', lines: [['LINEN-KS', 120], ['TOWEL-BTH', 240]] } },
        { customer: 'northpeak', name: '[QUOTE ACCEPTED] Q4 pallets & stretch film', amount: 379000, stage: 'NEGOTIATION', close: 9,
            hint: 'Customer ACCEPTED the quotation. Close as won: the order uses the accepted quotation.',
            quote: { flow: 'ACCEPTED', lines: [['PALLET-HT', 500], ['FILM-STR', 100]] } },
        { customer: 'cebutech', name: '[QUOTE DRAFT] ESD packaging annual supply', amount: 156000, stage: 'PROPOSAL', close: 12, lead: 'plim.lead',
            hint: 'Quotation is still a DRAFT: Close as won must be refused until it is sent (or cancelled).',
            quote: { flow: 'DRAFT', lines: [['BAG-ESD', 200]] } },
        { customer: 'palawanfresh', name: '[QUOTE REVISED] Peak-season ice boxes', amount: 94000, stage: 'NEGOTIATION', close: 4,
            hint: 'Rev 1 (50 boxes) was REJECTED on price; rev 2 (40 boxes) is SENT. Close as won uses rev 2.',
            quote: { flow: 'REVISED', lines: [['ICEBOX-50', 50]], revisedLines: [['ICEBOX-50', 40]] } },
        { customer: 'sunrisehotel', name: '[QUOTE EXPIRED] Spa towel program', amount: 96000, stage: 'NEGOTIATION', close: 3,
            hint: 'Quotation validity has passed (EXPIRED). Close as won needs product lines (e.g. 300 Bath Towel), or revise the quotation first.',
            quote: { flow: 'EXPIRED', lines: [['TOWEL-BTH', 300]] } },
        { customer: 'cebutech', name: '[NO QUOTE] Reel & tray packaging trial', amount: 78000, stage: 'PROPOSAL', close: 20,
            hint: 'No quotation: Close as won with product lines (e.g. 100 Anti-static Shielding Bag packs), or create a quotation first.' },
        { customer: 'tarlacmills', name: '[SHOULD FAIL] Rice sacks — customer on credit hold', amount: 44000, stage: 'NEGOTIATION', close: 2,
            hint: 'Customer is BLOCKED in SD: winning must be rejected and the stage must stay NEGOTIATION.' },
        { customer: 'northpeak', name: '[RETRY] Forklift pallet racks (won before handoff)', amount: 310000, stage: 'CLOSED_WON', close: -25, closed: -25,
            hint: 'Closed Won without an SD order: use "Retry ERP handoff" (e.g. 300 Heat-treated Pallet).' },
        { customer: 'northpeak', name: 'Cold-storage pallet wrap', amount: 185000, stage: 'QUALIFICATION', close: 40, hint: 'Early stage.' },
        { customer: 'palawanfresh', name: 'Dockside ice machine', amount: null, stage: 'PROSPECTING', close: 75, hint: 'Early stage, no amount yet.' },
        { customer: 'palawanfresh', name: 'Styro box replacement', amount: 128000, stage: 'CLOSED_LOST', close: -12, closed: -12, lostReason: 'COMPETITOR', hint: 'Lost to a local competitor.' },
    ]
    const probability: Record<string, number> = { PROSPECTING: 10, QUALIFICATION: 25, PROPOSAL: 50, NEGOTIATION: 75, CLOSED_WON: 100, CLOSED_LOST: 0 }
    const quoted: Array<{ opportunityId: string; quote: QuoteSeed }> = []
    for (const o of opps) {
        const row = await prisma.crmOpportunity.create({
            data: {
                customerId: ids[o.customer],
                leadId: o.lead ? leadIds[o.lead] : null,
                name: o.name,
                description: o.hint,
                amount: o.amount,
                currency: 'PHP',
                stage: o.stage,
                probability: probability[o.stage],
                expectedCloseDate: daysFromNow(o.close),
                closedAt: o.closed !== undefined ? daysFromNow(o.closed) : null,
                lostReason: o.lostReason ?? null,
                assignedTo: owner?.id ?? null,
                createdBy: TAG,
            },
        })
        if (o.quote) quoted.push({ opportunityId: row.id, quote: o.quote })
        if (owner && o.stage === 'NEGOTIATION') {
            await prisma.crmActivity.create({
                data: {
                    opportunityId: row.id,
                    type: 'CALL',
                    summary: 'Final terms call before closing',
                    dueAt: daysFromNow(1),
                    assignedTo: owner.id,
                    createdBy: TAG,
                },
            })
        }
    }

    // ── Tickets ─────────────────────────────────────────────────────────
    const tickets = [
        { customer: 'sunrisehotel', subject: 'Towel color does not match sample', status: 'IN_PROGRESS', priority: 'MEDIUM', category: 'PRODUCT', comments: ['Customer sent photos — shade is off-white.', 'Requested replacement swatch from supplier.'] },
        { customer: 'northpeak', subject: 'Pallets delivered without ISPM-15 stamp', status: 'OPEN', priority: 'URGENT', category: 'DELIVERY', comments: ['Export shipment on hold at port.'] },
        { customer: 'cebutech', subject: 'Request for updated ESD test certificate', status: 'RESOLVED', priority: 'LOW', category: 'PRODUCT', comments: ['Certificate emailed.', 'Customer confirmed receipt.'] },
        { customer: 'tarlacmills', subject: 'Payment plan for overdue balance', status: 'WAITING_CUSTOMER', priority: 'HIGH', category: 'BILLING', comments: ['Proposed 3-month installment.'] },
    ] as const
    for (const t of tickets) {
        await prisma.crmTicket.create({
            data: {
                customerId: ids[t.customer],
                subject: t.subject,
                description: `Sample ticket — ${t.subject.toLowerCase()}.`,
                status: t.status,
                priority: t.priority,
                category: t.category,
                createdBy: TAG,
                comments: { create: t.comments.map((body) => ({ body })) },
            },
        })
    }

    // ── Loyalty; balance = sum of the append-only ledger ────────────────
    const loyalty: Array<{ customer: CustomerKey; tier: string; txns: Array<[string, number, string]> }> = [
        { customer: 'sunrisehotel', tier: 'PLATINUM', txns: [['EARN', 18200, 'Q2 purchases'], ['EARN', 21000, 'Q3 purchases'], ['REDEEM', -10000, 'Linen upgrade voucher']] },
        { customer: 'northpeak', tier: 'GOLD', txns: [['EARN', 7600, 'Q3 purchases'], ['REDEEM', -2500, 'Free delivery voucher']] },
        { customer: 'palawanfresh', tier: 'SILVER', txns: [['EARN', 2800, 'Q3 purchases'], ['EXPIRE', -300, 'Points expired (12 months)'], ['ADJUSTMENT', 200, 'Goodwill credit']] },
    ]
    for (const acct of loyalty) {
        await prisma.crmLoyaltyAccount.create({
            data: {
                customerId: ids[acct.customer],
                tier: acct.tier,
                pointsBalance: acct.txns.reduce((sum, [, pts]) => sum + pts, 0),
                transactions: {
                    create: acct.txns.map(([type, points, note], i) => ({
                        type,
                        points,
                        note,
                        referenceType: 'SEED',
                        createdBy: TAG,
                        createdAt: daysFromNow(-90 + i * 30),
                    })),
                },
            },
        })
    }

    const quotations = await seedQuotations(quoted, productIds, owner?.id ?? TAG)

    console.log(
        `Seeded CRM handoff sample: ${CUSTOMERS.length} customers, ${PRODUCTS.length} SD products, ` +
            `${leadRows.length} leads, ${opps.length} opportunities, ${tickets.length} tickets, ${loyalty.length} loyalty accounts.`,
    )
    for (const q of quotations) console.log(`  ${q}`)
    console.log('Remove with: npm run prisma:clean-crm-temp')
}

/**
 * Builds each quotation through the real services (same path as the CRM UI) so numbering,
 * catalog pricing and status transitions are SD's. Only EXPIRED backdates `validUntil`,
 * standing in for the validity period running out.
 */
async function seedQuotations(
    quoted: Array<{ opportunityId: string; quote: QuoteSeed }>,
    productIds: Record<ProductSku, string>,
    userId: string,
) {
    if (!quoted.length) return []
    const { NestFactory } = await import('@nestjs/core')
    const { AppModule } = await import('../src/app.module')
    const { QuotationService } = await import('../src/sd/quotation.service')
    const { CrmOpportunityQuotationsService } = await import('../src/crm/opportunities/opportunity-quotations.service')
    const { USER_ROLES } = await import('../src/auth/auth.constants')

    const app: INestApplicationContext = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] })
    try {
        const sd = app.get(QuotationService)
        const crm = app.get(CrmOpportunityQuotationsService)
        const user = { id: userId, role: USER_ROLES.SUPER_ADMIN }
        const toLines = (lines: QuoteLines) => lines.map(([sku, quantity]) => ({ productId: productIds[sku], quantity }))
        const summary: string[] = []

        for (const { opportunityId, quote } of quoted) {
            let q = await crm.create(opportunityId, { lines: toLines(quote.lines), notes: 'Temporary CRM test quotation.' }, user)
            if (quote.flow !== 'DRAFT') q = await sd.send(q.id, {}, userId)
            if (quote.flow === 'ACCEPTED') q = await sd.accept(q.id, { note: 'Approved by customer purchasing.' }, userId)
            if (quote.flow === 'REVISED') {
                await sd.reject(q.id, { reason: 'Price too high for 50 units; customer asked for 40.' }, userId)
                q = await sd.revise(q.id, { reason: 'CUSTOMER_REQUEST', notes: 'Reduced to 40 units.' }, userId)
                q = await sd.updateDraft(q.id, { lines: toLines(quote.revisedLines ?? quote.lines) }, userId)
                q = await sd.send(q.id, {}, userId)
            }
            if (quote.flow === 'EXPIRED') {
                await prisma.sdQuotation.update({ where: { id: q.id }, data: { validUntil: daysFromNow(-1) } })
                q = await sd.findOne(q.id)
            }
            summary.push(`${q.quotationNumber} rev ${q.revision} · ${q.effectiveStatus} · PHP ${q.totalAmount.toFixed(2)}`)
        }
        return summary
    } finally {
        await app.close()
    }
}

const run = process.argv.includes('--clean')
    ? clean().then((c) => console.log('Removed temporary CRM sample:', JSON.stringify(c)))
    : seed()

run.catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
}).finally(() => prisma.$disconnect())
