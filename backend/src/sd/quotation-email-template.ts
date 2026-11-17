/**
 * Pure rendering for SD quotation cover emails. Templates only substitute `{{placeholder}}` values
 * from the quotation, its customer, the rep and the company; the quotation PDF remains the
 * commercial source of truth and is always attached. No product tables, no marketing engine.
 */

/** Placeholders a quotation email template may use (v1). */
export const QUOTATION_EMAIL_PLACEHOLDERS = [
    'customerName',
    'contactName',
    'quotationNumber',
    'revision',
    'amount',
    'currency',
    'validUntil',
    'companyName',
    'repName',
    'opportunityName',
] as const

export type QuotationEmailPlaceholder = (typeof QUOTATION_EMAIL_PLACEHOLDERS)[number]
export type QuotationEmailVars = Record<QuotationEmailPlaceholder, string>

export const QUOTATION_EMAIL_TEMPLATE_KEYS = ['quotation_sent', 'quotation_resent'] as const
export type QuotationEmailTemplateKey = (typeof QUOTATION_EMAIL_TEMPLATE_KEYS)[number]

export const DEFAULT_QUOTATION_EMAIL_TEMPLATE: QuotationEmailTemplateKey = 'quotation_sent'
export const RESEND_QUOTATION_EMAIL_TEMPLATE: QuotationEmailTemplateKey = 'quotation_resent'

/** Custom templates are saved from the composer; keys stay lowercase/snake so they are URL-safe. */
export const QUOTATION_EMAIL_TEMPLATE_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,59}$/

export function isQuotationEmailTemplateKey(value: unknown): value is QuotationEmailTemplateKey {
    return typeof value === 'string' && (QUOTATION_EMAIL_TEMPLATE_KEYS as readonly string[]).includes(value)
}

/** Any usable template reference: a seeded key or a custom key saved from the composer. */
export function isQuotationEmailTemplateRef(value: unknown): value is string {
    return (
        typeof value === 'string' &&
        value.length <= 60 &&
        QUOTATION_EMAIL_TEMPLATE_KEY_PATTERN.test(value)
    )
}

/** Stable, readable key for a saved template; a numeric suffix is added if it is taken. */
export function quotationEmailTemplateKeyFromName(name: string): string {
    const slug = name
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40)
    return slug ? `custom_${slug}` : 'custom_template'
}

/**
 * Placeholders restored by exact value when a rep saves a rendered email as a new template.
 * `revision` and `currency` are too short for this and are restored contextually instead.
 */
const RESTORABLE_PLACEHOLDERS = new Set<QuotationEmailPlaceholder>([
    'customerName',
    'contactName',
    'quotationNumber',
    'amount',
    'validUntil',
    'companyName',
    'repName',
    'opportunityName',
])

/**
 * Turns values rendered for one quotation back into `{{placeholders}}`, so a template saved from a
 * real email keeps working for other customers instead of freezing this customer's details.
 * The current values must be reasonably distinctive (at least 4 characters).
 */
export function restoreQuotationEmailPlaceholders(
    text: string,
    vars: Partial<QuotationEmailVars>,
): string {
    let restored = text

    // Short values are restored only where the surrounding words make them unambiguous.
    const revision = (vars.revision ?? '').trim()
    if (revision) {
        restored = restored.replace(
            new RegExp(`(\\brev(?:ision)?\\s+)${escapeRegExp(revision)}\\b`, 'gi'),
            '$1{{revision}}',
        )
    }
    const currency = (vars.currency ?? '').trim()
    if (currency) {
        restored = restored.replace(
            new RegExp(`\\b${escapeRegExp(currency)}\\b`, 'gi'),
            '{{currency}}',
        )
    }

    const pairs = QUOTATION_EMAIL_PLACEHOLDERS.filter(
        (key) => RESTORABLE_PLACEHOLDERS.has(key) && (vars[key] ?? '').trim().length >= 4,
    )
        .map((key) => [key, (vars[key] as string).trim()] as const)
        .sort((a, b) => b[1].length - a[1].length)

    // Substitute through private-use sentinels so a restored placeholder can never be matched again.
    const tokens = pairs.map((_, index) => `\uE000${index}\uE001`)
    pairs.forEach(([, value], index) => {
        restored = restored.split(value).join(tokens[index])
    })
    pairs.forEach(([key], index) => {
        restored = restored.split(tokens[index]).join(`{{${key}}}`)
    })
    return restored
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Built-in copies, used only when the seeded row is missing (a fresh database whose migration has
 * not seeded yet, or a test double). Editing templates in the database takes precedence.
 */
export const BUILT_IN_QUOTATION_EMAIL_TEMPLATES: Record<
    QuotationEmailTemplateKey,
    { name: string; subject: string; bodyText: string }
> = {
    quotation_sent: {
        name: 'Quotation sent',
        subject: 'Quotation {{quotationNumber}} rev {{revision}} from {{companyName}}',
        bodyText: [
            'Dear {{customerName}},',
            '',
            'Thank you for the opportunity to quote. Please find our quotation {{quotationNumber}} rev {{revision}} attached.',
            '',
            'Quotation summary:',
            '- Total: {{amount}} {{currency}}',
            '- Valid until: {{validUntil}}',
            '',
            'If you have any questions, reply to this email and we will be glad to help.',
            '',
            'Best regards,',
            '{{repName}}',
            '{{companyName}}',
        ].join('\n'),
    },
    quotation_resent: {
        name: 'Quotation resent',
        subject: 'Updated copy: quotation {{quotationNumber}} rev {{revision}}',
        bodyText: [
            'Dear {{customerName}},',
            '',
            'As requested, we are resending quotation {{quotationNumber}} rev {{revision}}.',
            '',
            'Quotation summary:',
            '- Total: {{amount}} {{currency}}',
            '- Valid until: {{validUntil}}',
            '',
            'The PDF quotation is attached.',
            '',
            'Best regards,',
            '{{repName}}',
            '{{companyName}}',
        ].join('\n'),
    },
}

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

/**
 * Replaces known `{{placeholder}}` tokens. Unknown tokens are removed (empty), never echoed to the
 * customer, so a typo cannot leak the template syntax into a sent email.
 */
export function renderQuotationEmailTemplate(
    template: string,
    vars: Partial<QuotationEmailVars>,
): string {
    return template.replace(PLACEHOLDER, (_match, key: string) => {
        const value = vars[key as QuotationEmailPlaceholder]
        return value ?? ''
    })
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

/** Plain cover letter to simple safe HTML (paragraphs + line breaks). */
export function quotationEmailTextToHtml(text: string): string {
    return text
        .split(/\n{2,}/)
        .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`)
        .join('\n')
}
