ALTER TABLE "fico_company_accounting_settings"
    ADD COLUMN IF NOT EXISTS "mmResolutionMode" TEXT NOT NULL DEFAULT 'CENTRAL_WITH_LEGACY_FALLBACK';

ALTER TABLE "fico_company_accounting_settings"
    ADD COLUMN IF NOT EXISTS "mmLegacyFallbackUntil" TIMESTAMP(3);

ALTER TABLE "fico_company_accounting_settings"
    ADD CONSTRAINT "fico_company_accounting_settings_mm_resolution_mode_check"
    CHECK (
        "mmResolutionMode" IN (
            'CENTRAL_WITH_LEGACY_FALLBACK',
            'SHADOW_LEGACY_AUTHORITY',
            'SHADOW_CENTRAL_AUTHORITY',
            'CENTRAL_ONLY',
            'CENTRAL_WITH_TIMED_FALLBACK'
        )
    );