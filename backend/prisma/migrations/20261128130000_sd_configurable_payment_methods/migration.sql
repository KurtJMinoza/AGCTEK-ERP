-- Configurable payment methods for POS and external platform sales.
CREATE TABLE "sd_payment_methods" (
    "id"                  TEXT NOT NULL,
    "code"                TEXT NOT NULL,
    "name"                TEXT NOT NULL,
    "description"         TEXT,
    "icon"                TEXT,
    "origin"              TEXT NOT NULL DEFAULT 'USER',
    "isActive"            BOOLEAN NOT NULL DEFAULT true,
    "sortOrder"           INTEGER NOT NULL DEFAULT 0,
    "allowChange"         BOOLEAN NOT NULL DEFAULT false,
    "requiresReference"   BOOLEAN NOT NULL DEFAULT false,
    "requiresBank"        BOOLEAN NOT NULL DEFAULT false,
    "requiresDate"        BOOLEAN NOT NULL DEFAULT false,
    "requiresEmployee"    BOOLEAN NOT NULL DEFAULT false,
    "settlementType"      TEXT NOT NULL DEFAULT 'IMMEDIATE',
    "glAccountCode"       TEXT,
    "companyRestrictions"  JSONB,
    "createdBy"           TEXT,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sd_payment_methods_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sd_payment_methods_code_key" ON "sd_payment_methods"("code");
CREATE INDEX "sd_payment_methods_isActive_sortOrder_idx" ON "sd_payment_methods"("isActive", "sortOrder");

-- Seed the six built-in methods.
INSERT INTO "sd_payment_methods" ("id", "code", "name", "description", "icon", "origin", "isActive", "sortOrder", "allowChange", "requiresReference", "requiresBank", "requiresDate", "requiresEmployee", "settlementType", "glAccountCode", "createdAt", "updatedAt")
VALUES
    ('pm_cash',          'CASH',          'Cash',              'Cash payment with change',                    'HiOutlineCash',              'SYSTEM', true, 1,  true,  false, false, false, false, 'IMMEDIATE',  '1000', NOW(), NOW()),
    ('pm_gcash',         'GCASH',         'GCash',             'GCash e-wallet',                              'HiOutlineDeviceMobile',      'SYSTEM', true, 2,  false, true,  false, false, false, 'PENDING',    '1160', NOW(), NOW()),
    ('pm_bank_transfer', 'BANK_TRANSFER', 'Bank Transfer',     'Bank transfer with reference',                'HiOutlineOfficeBuilding',    'SYSTEM', true, 3,  false, true,  true,  true,  false, 'PENDING',    '1180', NOW(), NOW()),
    ('pm_card',          'CARD',          'Card',              'Credit or debit card',                        'HiOutlineCreditCard',         'SYSTEM', true, 4,  false, true,  false, false, false, 'IMMEDIATE',  '1170', NOW(), NOW()),
    ('pm_cheque',        'CHEQUE',        'Cheque',            'Bank cheque',                                 'HiOutlineDocumentText',       'SYSTEM', true, 5,  false, true,  false, false, false, 'PENDING',    '1190', NOW(), NOW()),
    ('pm_salary_loan',   'SALARY_LOAN',   'Salary Deduction',  'Employee salary deduction',                   'HiOutlineUser',               'SYSTEM', true, 6,  false, false, false, false, true,  'RECEIVABLE', '1110', NOW(), NOW());
