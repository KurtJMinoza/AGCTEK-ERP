import {
    BUILT_IN_QUOTATION_EMAIL_TEMPLATES,
    quotationEmailTemplateKeyFromName,
    quotationEmailTextToHtml,
    renderQuotationEmailTemplate,
    restoreQuotationEmailPlaceholders,
    type QuotationEmailVars,
} from './quotation-email-template'

const vars: QuotationEmailVars = {
    customerName: 'Acme Trading',
    contactName: 'Ann Cruz',
    quotationNumber: 'Q-000012',
    revision: '3',
    amount: '2,350.00',
    currency: 'PHP',
    validUntil: '2026-12-15',
    companyName: 'AGCTEK',
    repName: 'Rita Rep',
    opportunityName: 'Icebox rollout',
}

describe('renderQuotationEmailTemplate', () => {
    it('replaces every known placeholder, with or without inner spaces', () => {
        expect(
            renderQuotationEmailTemplate(
                'Hi {{ customerName }} — {{quotationNumber}} rev {{revision}}: {{amount}} {{currency}} until {{validUntil}}.',
                vars,
            ),
        ).toBe('Hi Acme Trading — Q-000012 rev 3: 2,350.00 PHP until 2026-12-15.')
    })

    it('removes unknown placeholders instead of leaking template syntax to the customer', () => {
        expect(renderQuotationEmailTemplate('Hello {{customerName}}{{notAVariable}}', vars)).toBe(
            'Hello Acme Trading',
        )
    })

    it('leaves text without placeholders unchanged', () => {
        expect(renderQuotationEmailTemplate('Plain cover letter.', vars)).toBe('Plain cover letter.')
    })

    it('renders the built-in sent template with quotation values', () => {
        const rendered = renderQuotationEmailTemplate(
            BUILT_IN_QUOTATION_EMAIL_TEMPLATES.quotation_sent.bodyText,
            vars,
        )
        expect(rendered).toContain('Dear Acme Trading,')
        expect(rendered).toContain('Q-000012 rev 3')
        expect(rendered).toContain('Total: 2,350.00 PHP')
        expect(rendered).toContain('Rita Rep')
        expect(rendered).not.toContain('{{')
    })
})

describe('quotationEmailTemplateKeyFromName', () => {
    it('builds a readable, prefixed snake_case key', () => {
        expect(quotationEmailTemplateKeyFromName('Follow-up: pricing 2026')).toBe(
            'custom_follow_up_pricing_2026',
        )
    })

    it('falls back when the name has no latin characters', () => {
        expect(quotationEmailTemplateKeyFromName('报价')).toBe('custom_template')
    })

    it('keeps keys inside the 60 character limit', () => {
        const key = quotationEmailTemplateKeyFromName('a'.repeat(200))
        expect(key.length).toBeLessThanOrEqual(60)
        expect(key.startsWith('custom_')).toBe(true)
    })
})

describe('restoreQuotationEmailPlaceholders', () => {
    it('turns a rendered built-in email back into its template', () => {
        const rendered = renderQuotationEmailTemplate(
            BUILT_IN_QUOTATION_EMAIL_TEMPLATES.quotation_sent.bodyText,
            vars,
        )

        const restored = restoreQuotationEmailPlaceholders(rendered, vars)

        expect(restored).toBe(BUILT_IN_QUOTATION_EMAIL_TEMPLATES.quotation_sent.bodyText)
    })

    it('restores the revision only when it follows rev/revision', () => {
        expect(restoreQuotationEmailPlaceholders('Quotation Q-000012 rev 3', vars)).toBe(
            "Quotation {{quotationNumber}} rev {{revision}}",
        )
        expect(restoreQuotationEmailPlaceholders('We have 3 units left', vars)).toBe(
            'We have 3 units left',
        )
    })

    it('restores the currency code wherever it appears', () => {
        expect(restoreQuotationEmailPlaceholders('All prices are in PHP.', vars)).toBe(
            'All prices are in {{currency}}.',
        )
    })

    it('keeps text the rep typed outside the rendered values', () => {
        expect(
            restoreQuotationEmailPlaceholders('Hi Acme Trading, one extra note for you.', vars),
        ).toBe('Hi {{customerName}}, one extra note for you.')
    })
})

describe('quotationEmailTextToHtml', () => {
    it('turns blank lines into paragraphs and keeps single line breaks', () => {
        expect(quotationEmailTextToHtml('Dear Ann,\nThank you.\n\nRegards,\nRita')).toBe(
            '<p>Dear Ann,<br />Thank you.</p>\n<p>Regards,<br />Rita</p>',
        )
    })

    it('escapes content so an edited cover letter cannot inject markup', () => {
        expect(quotationEmailTextToHtml('<script>alert("x")</script>')).toBe(
            '<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>',
        )
    })
})
