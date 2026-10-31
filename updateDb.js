const { query } = require('./db');

async function updateDb() {
  console.log('Updating Neon DB with Australian Banking policies, PDF templates, drafts, and structured phases...');

  try {
    // 1. Ensure departments table has all primary partitions in order
    await query(`
      INSERT INTO departments (id, name, icon, hierarchy_level, sort_order)
      VALUES 
        ('credit-cards', 'Credit Cards', 'credit-card', 'section', 1),
        ('retail-lending', 'Retail Lending', 'piggy-bank', 'section', 2),
        ('onboarding', 'Onboarding', 'user-check', 'section', 3),
        ('security', 'Security & InfoSec', 'shield', 'section', 4),
        ('legal-compliance', 'Legal & Compliance', 'scale', 'section', 5)
      ON CONFLICT (id) DO UPDATE 
        SET name = EXCLUDED.name, 
            icon = EXCLUDED.icon, 
            sort_order = EXCLUDED.sort_order;
    `);

    await query("UPDATE departments SET sort_order = 15 WHERE id = 'company-policies'");

    // 2. Structured Policies (with phases-wise data, PDF templates, and role drafts)
    const policies = [
      // ----------------- 1. CREDIT CARDS LIBRARY -----------------
      {
        id: 'credit-card-limits-policy',
        department_id: 'credit-cards',
        title: 'Credit Card Issuance & Daily Limit Policy',
        summary: 'Defines tiered approval thresholds, mandatory KYC/credit score verification, and turnaround SLAs for consumer card issuance.',
        version: '1.2',
        status: 'active',
        is_masked: false,
        content: `### Phase 1: Purpose & Authorization Scope
This operational policy outlines the mandatory criteria and authorization limits for underwriting, approving, and activating consumer credit cards for Commonwealth Bank of Australia (CBA).

### Phase 2: Operational Rules & Mandatory Verifications
1. **Applicant Eligibility**: Minimum age 18 years, Australian resident, minimum ongoing gross income of $35,000 per annum.
2. **Comprehensive Credit Check**: Credit report verification via Equifax. Applications with credit scores below 620 require Level 2 supervisory review.
3. **Identity Verification (KYC)**: Biometric digital ID or 100-point physical verification before card issuance.

### Phase 3: Tiered Approval Limits & Caps
- Tier 1 Standard Card: Maximum single credit limit of $5,000 (automated approval eligible).
- Tier 2 Gold/Platinum Card: Up to $15,000 (Requires Credit Officer sign-off).
- Tier 3 Diamond / Executive: Up to $50,000 (Requires Department Manager approval).

### Phase 4: Turnaround SLA & Compliance Monitoring
All standard consumer applications must be adjudicated within 24 hours of document submission. Escalated applications must resolve within 48 business hours.`,
        parameters: {
          approval_limits: { officer_cap: '$5,000', manager_cap: '$15,000', executive_cap: '$50,000' },
          turnaround_sla: '24 Hours',
          daily_limit: '$5,000',
          verification_steps: [
            'Digital KYC 100-Point Identity Verification',
            'Equifax Comprehensive Credit History Score >= 620',
            '30-Day Pay Slip & Bank Account Income Verification',
            'Serviceability Buffer Calculation (+3.0% over active rate)'
          ],
          compliance_tags: ['National Consumer Credit Protection Act', 'APRA APS 220', 'Equifax CCR'],
          phases: [
            {
              id: 'phase-1',
              phase_number: 1,
              title: 'Purpose & Authorization Scope',
              summary: 'Mandatory criteria and authorization limits for underwriting consumer cards for Commonwealth Bank.',
              key_rules: ['Minimum gross annual income $35,000', 'Australian residency mandatory'],
              content: 'This operational policy outlines the mandatory criteria and authorization limits for underwriting, approving, and activating consumer credit cards for Commonwealth Bank of Australia (CBA).'
            },
            {
              id: 'phase-2',
              phase_number: 2,
              title: 'Operational Rules & Verifications',
              summary: 'Equifax comprehensive credit score verification, biometric digital ID, and serviceability checks.',
              key_rules: ['Equifax score >= 620 required for auto-approval', 'Biometric 100-point identity match'],
              content: '1. Applicant Eligibility: Minimum age 18 years, Australian resident, minimum ongoing gross income of $35,000 per annum.\n2. Comprehensive Credit Check: Credit report verification via Equifax. Applications with credit scores below 620 require Level 2 supervisory review.\n3. Identity Verification (KYC): Biometric digital ID or 100-point physical verification before card issuance.'
            },
            {
              id: 'phase-3',
              phase_number: 3,
              title: 'Tiered Approval Limits & Caps',
              summary: 'Three-tier delegated authority matrix from $5,000 automated to $50,000 Department Manager.',
              key_rules: ['Tier 1 Standard: $5,000 cap', 'Tier 2 Gold/Platinum: $15,000 cap', 'Tier 3 Executive: $50,000 cap'],
              content: '- Tier 1 Standard Card: Maximum single credit limit of $5,000 (automated approval eligible).\n- Tier 2 Gold/Platinum Card: Up to $15,000 (Requires Credit Officer sign-off).\n- Tier 3 Diamond / Executive: Up to $50,000 (Requires Department Manager approval).'
            },
            {
              id: 'phase-4',
              phase_number: 4,
              title: 'Turnaround SLA & Monitoring',
              summary: 'Standard 24-hour adjudication SLA; 48 hours for supervisory escalations.',
              key_rules: ['24-hour standard SLA', '48-hour escalated resolution SLA'],
              content: 'All standard consumer applications must be adjudicated within 24 hours of document submission. Escalated applications must resolve within 48 business hours.'
            }
          ]
        },
        created_by: 'Sarah Jenkins (Bank Employee)'
      },
      {
        id: 'credit-card-rewards-sop',
        department_id: 'credit-cards',
        title: 'Revolving Credit Line & Card Activation Standard',
        summary: 'Procedures for digital wallet tokenization, revolving balance risk buffers, and instant credit limit adjustments.',
        version: '1.1',
        status: 'active',
        is_masked: false,
        content: `### Phase 1: Card Activation & Tokenization
Governs instant card provisioning into Apple Wallet, Google Pay, and physical chip card PIN generation.

### Phase 2: Revolving Credit Facility Guidelines
1. **Automated Risk Monitoring**: Daily review of revolving credit utilization (>85% triggers early warning flags).
2. **Limit Increase Requests**: Require 6 months on-time payment track record before eligibility.
3. **Emergency Limit Blocks**: Suspicious transactions trigger automated SMS confirmation and transient card lock.`,
        parameters: {
          approval_limits: { officer_cap: '$10,000', manager_cap: '$25,000' },
          turnaround_sla: '4 Hours',
          daily_limit: '$10,000',
          verification_steps: [
            'Automated 3-Factor Digital Device Binding',
            'NPP Real-time PayID Activation Check',
            'SMS One-Time Passcode Authorization'
          ],
          compliance_tags: ['Apple Pay / Google Pay Security', 'NPP Payments', 'Card Tokenization'],
          phases: [
            {
              id: 'phase-1',
              phase_number: 1,
              title: 'Card Activation & Tokenization',
              summary: 'Instant tokenization into Apple Wallet and Google Pay with cryptographically bound hardware tokens.',
              key_rules: ['Device hardware binding verified', 'Real-time NPP activation check'],
              content: 'Governs instant card provisioning into Apple Wallet, Google Pay, and physical chip card PIN generation.'
            },
            {
              id: 'phase-2',
              phase_number: 2,
              title: 'Revolving Risk & Limit Adjustments',
              summary: 'Utilization monitoring over 85% and minimum 6 months payment history for limit extensions.',
              key_rules: ['Revolving utilization cap 85%', 'Suspicious transactions trigger transient lock'],
              content: '1. Automated Risk Monitoring: Daily review of revolving credit utilization (>85% triggers early warning flags).\n2. Limit Increase Requests: Require 6 months on-time payment track record before eligibility.\n3. Emergency Limit Blocks: Suspicious transactions trigger automated SMS confirmation.'
            }
          ]
        },
        created_by: 'Marcus Vance (Bank Owner)'
      },

      // ----------------- 2. RETAIL LENDING LIBRARY (INCLUDING PDF TEMPLATE & DRAFT) -----------------
      // AUTHORITATIVE PDF TEMPLATE: Home Loan Valuations Policy (from docks/hl_valuation.pdf)
      {
        id: 'hl-valuation-policy',
        department_id: 'retail-lending',
        title: 'Home Loan Valuations Policy',
        summary: 'Establishes a consistent and prudent framework for the valuation of residential properties used as security for home loans to assess lending risk, ensure APRA APS 220 compliance, and protect the interests of both the lender and borrowers.',
        version: '1.0',
        status: 'active',
        is_masked: false,
        content: `### Phase 1: Purpose & Governance Scope
Valuation is a critical step in mortgage lending. Accurate assessment of the collateral value determines the risk coverage. The purpose of this policy is to establish a consistent and prudent framework for the valuation of residential properties used as security for home loans under APRA APS 220 prudential governance.

#### Operational Scope
This policy applies to:
- All residential home loan applications and consumer mortgage originations.
- New property purchases (off-the-plan, existing residential, and vacant land).
- Refinancing transactions from other accredited Authorized Deposit-taking Institutions (ADIs).
- Construction and renovation loans requiring progress draws.
- Loan variations, top-up applications, and equity release facilities.
- Portfolio reviews and ongoing prudential risk monitoring.

### Phase 2: Underwriting Principles & Prudence Rules
All residential properties offered as security for a home loan must be independently valued to ensure that the property's market value adequately supports the proposed lending exposure.

#### 1. Independence Principle
Valuers must be completely independent of the borrower, mortgage broker, loan assessor, and approving credit authority. Borrowers and intermediaries must never influence the valuation outcome or select individual valuers directly.

#### 2. Objectivity & Market Evidence
Valuation assessments must be based strictly on market evidence, verified comparable sales, and professional certified valuer judgment. Unsupported assumptions or subjective personal opinions are strictly prohibited.

#### 3. Prudence Rule (Lowest-Value Standard)
Lending decisions and Loan-to-Value Ratio (LVR) determinations must strictly be based on the lower of:
1. The negotiated Purchase Price; or
2. The Assessed Fair Market Value from the independent valuation.

### Phase 3: Approved Valuation Methods & Thresholds
The bank authorizes four distinct valuation tiers based on property complexity, exposure, and risk profile:

#### 1. Full Valuation (Physical Internal & External Inspection)
Carried out by an approved panel valuer with comprehensive internal and external physical property inspection. Mandatory under the following conditions:
- Loan-to-Value Ratio (LVR) exceeds 80%.
- Construction or development loans requiring staged progress drawdowns.
- Unique, high-end, or specialized properties (acreage, rural residential, heritage).
- High-value properties exceeding delegated officer caps (> $2,000,000 AUD).
- Heightened risk indicators or adverse environmental/zoning flags.

#### 2. Desktop Valuation
Conducted using external mapping, digital imagery, and recent market transactions without physical entry. Permitted subject to Credit Team sign-off for:
- Low-to-medium risk residential lending.
- Established residential properties in metropolitan and high-liquidity suburbs.
- Refinancing applications with LVR <= 80%.

#### 3. Automated Valuation Models (AVM)
Algorithmic statistical assessment via CoreLogic / EVR. Permitted only where:
- Property value is below institution cap ($1,500,000 AUD).
- Property type is standard detached residential or low-density strata.
- LVR does not exceed 75% with zero negative credit marks.

#### 4. Drive-thru / Kerbside Valuation
External roadside inspection used when limited internal inspection is considered acceptable and additional physical assurance is required beyond a desktop valuation.

### Phase 4: Validity Periods & Turnaround SLAs
Credit assessments and loan documentation can only rely on valuations within their statutory validity shelf-life:

| Valuation Type | Validity in Days | Turnaround SLA |
| :--- | :--- | :--- |
| **Full Valuation** | **90 Calendar Days** | 48 Business Hours |
| **Desktop Valuation** | **90 Calendar Days** | 24 Business Hours |
| **Automated Valuation Models (AVM)** | **30 Calendar Days** | Real-time (Instant) |
| **Drive-thru / Kerbside** | **60 Calendar Days** | 24 Business Hours |

#### Mandatory Re-valuation Triggers
A new or updated valuation is automatically triggered and required before settlement if:
1. The statutory validity period (90 days for full/desktop, 30 days for AVM) expires prior to loan settlement.
2. Macroeconomic property market conditions deteriorate significantly (> 5% suburb-level decline).
3. Material physical changes, severe weather damage, or unauthorized alterations occur to the security property.
4. Additional lending or loan variation is requested after initial credit approval.

### Phase 5: Verification Checklist & System Event Telemetry
Standardized reporting format and system workflow event triggers:

#### Standardized Report Requirements
- Standard usage clause with authorized mortgage insurer responsibility extension.
- Main improvement dimensions, site dimensions, and Land Description verified against Title Registry.
- Recommended Replacement Cost calculation for mandatory building insurance coverage.
- Minimum 3 comparable sales within 6 months of valuation date, with at least 2 sales within 10% of subject property's value.
- Capitalization methodology mandatory for blocks of units or multi-dwelling lots.
- General valuer commentary on environmental, zoning, and adverse marketability factors.

#### Operational Workflow Lifecycle Events
1. **Loan Origination Trigger**: Receipt of home loan application initiates security collateral validation.
2. **Valuer Panel Assignment**: System dispatches instruction to independent accredited panel valuer.
3. **Inspection & Report Ingestion**: Standardized EVR report ingested with title check and comparable sales analysis.
4. **Credit Decisioning Event**: Underwriting engine enforces the lowest-value prudence rule (lower of price vs valuation).
5. **Discrepancy Escalation**: Valuation shortfall > 10% automatically escalates to Level 3 Senior Credit Officer.
6. **Expiry Sentinel**: 90-day threshold countdown triggers automated renewal alert and blocks drawdown upon expiration.
7. **APRA CPS 234 Audit Logging**: Cryptographically signed event telemetry recorded to audit logs with valuer accreditation ID.`,
        parameters: {
          approval_limits: {
            officer_cap: '$2,000,000 AUD',
            manager_cap: '$5,000,000 AUD',
            executive_cap: '$10,000,000 AUD'
          },
          turnaround_sla: '90 Days Validity (Full/Desktop), 30 Days (AVM)',
          daily_limit: 'Lower of Purchase Price or Assessed Market Value',
          verification_steps: [
            'Full internal/external inspection mandatory if LVR > 80% or loan > $2M',
            'Panel Valuer API Registration & conflict-of-interest check',
            'Minimum 3 comparable sales within 6 months (at least 2 within 10%)',
            'Recommended Replacement Cost for insurance calculation',
            'Serviceability buffer calculation (+3.0% over active mortgage reference rate)'
          ],
          compliance_tags: ['APRA APS 220', 'Independent Valuers', 'LVR Limits', 'AVM Standard', 'CoreLogic EVR'],
          phases: [
            {
              id: 'phase-1',
              phase_number: 1,
              title: 'Purpose & Governance Scope',
              summary: 'Consistent and prudent framework for residential property security valuations complying with APRA APS 220.',
              key_rules: [
                'Applies to all residential home loans, new purchases, refinances, and construction draws',
                'APRA APS 220 regulatory compliance for credit risk governance'
              ],
              content: 'Valuation is a critical step in mortgage lending. Accurate assessment of the collateral value determines the risk coverage. The purpose of this policy is to establish a consistent and prudent framework for the valuation of residential properties used as security for home loans under APRA APS 220 prudential governance.'
            },
            {
              id: 'phase-2',
              phase_number: 2,
              title: 'Underwriting Principles & Prudence Rules',
              summary: 'Core prudence mandate ensuring lending decisions adopt the lower of purchase price or assessed market value.',
              key_rules: [
                'Independence: Valuers must be independent of borrower, broker, and assessor',
                'Objectivity: Based strictly on verified market evidence and comparable sales',
                'Prudence Rule: Decisions must be based on lower of purchase price or market value'
              ],
              content: 'All residential properties offered as security for a home loan must be independently valued to ensure that the propertys market value adequately supports the proposed lending exposure.'
            },
            {
              id: 'phase-3',
              phase_number: 3,
              title: 'Approved Valuation Methods & Thresholds',
              summary: 'Four distinct valuation tiers: Full Physical Inspection, Desktop Valuation, AVM, and Kerbside.',
              key_rules: [
                'Full Valuation: Mandatory when LVR > 80%, construction loans, or high-value loans > $2M AUD',
                'Desktop: Low-to-medium risk residential lending with LVR <= 80%',
                'AVM: Standard residential below $1.5M with LVR <= 75%',
                'Drive-thru / Kerbside: Roadside inspection when additional physical assurance is needed'
              ],
              content: 'The bank authorizes four distinct valuation tiers based on property complexity, exposure, and risk profile.'
            },
            {
              id: 'phase-4',
              phase_number: 4,
              title: 'Validity Periods & Turnaround SLAs',
              summary: 'Statutory validity shelf-life: Full/Desktop 90 calendar days; AVM 30 calendar days.',
              key_rules: [
                'Full Valuation: 90 calendar days validity, 48-hour SLA',
                'Desktop Valuation: 90 calendar days validity, 24-hour SLA',
                'AVM: 30 calendar days validity, instant SLA',
                'Re-valuation triggers: Expiry, severe market drop (>5%), property damage, top-up request'
              ],
              content: 'Credit assessments and loan documentation can only rely on valuations within their statutory validity shelf-life.'
            },
            {
              id: 'phase-5',
              phase_number: 5,
              title: 'Verification Checklist & Event Telemetry',
              summary: 'Standardized report requirements, comparable sales rules, and end-to-end event triggers.',
              key_rules: [
                'Standardized Report: Min 3 comparable sales within 6 months (2 within 10%)',
                'Insurance replacement cost calculation included in report',
                'Discrepancy > 10% escalates to Level 3 Senior Credit Officer',
                'APRA CPS 234 event telemetry logged with valuer accreditation ID'
              ],
              content: 'Standardized reporting format and system workflow event triggers from origination to settlement and audit logging.'
            }
          ]
        },
        created_by: 'Marcus Vance (Bank Owner)'
      },

      // BANK EMPLOYEE DRAFT POLICY: Demonstrates Maker-Checker draft workflow
      {
        id: 'commercial-equipment-finance-draft',
        department_id: 'retail-lending',
        title: 'Commercial Equipment Finance & Asset Lending SOP',
        summary: 'Draft guidelines authored by Operations Squad for heavy machinery, medical devices, and commercial vehicle chattel mortgages.',
        version: '0.9',
        status: 'draft',
        is_masked: false,
        content: `### Phase 1: Purpose & Product Scope
Draft operational SOP for underwriting commercial chattel mortgages, hire purchase contracts, and equipment lease facilities up to $500,000 AUD.

### Phase 2: Asset Valuation & Depreciation Benchmarks
1. **Asset Classes**: Heavy haulage transport, earthmoving equipment, agricultural machinery, and specialized medical imaging systems.
2. **Depreciation Schedule**: Standard Australian Taxation Office (ATO) diminishing value schedule verified before financing term approval.
3. **PPSR Registration**: Mandatory Personal Property Securities Register (PPSR) charge registration within 24 hours of loan agreement signing.

### Phase 3: Delegated Limits & Turnaround SLAs
- Bank Employee (Maker) Assessment Cap: $50,000 AUD.
- Credit Officer Sign-off Cap: $150,000 AUD.
- Executive Risk Committee: > $500,000 AUD.
- Turnaround SLA: 36 business hours.`,
        parameters: {
          approval_limits: {
            officer_cap: '$50,000 AUD',
            manager_cap: '$150,000 AUD',
            executive_cap: '$500,000 AUD'
          },
          turnaround_sla: '36 Hours',
          daily_limit: '$100,000 AUD',
          verification_steps: [
            'PPSR Security Charge Registration Verification',
            'ATO Asset Depreciation Benchmark Audit',
            '2-Year Audited Business Tax Returns & BAS Statements',
            'Director Personal Guarantee & Comprehensive Credit Check'
          ],
          compliance_tags: ['PPSR Act 2009', 'Commercial Asset Lending', 'ATO Depreciation'],
          phases: [
            {
              id: 'phase-1',
              phase_number: 1,
              title: 'Purpose & Product Scope',
              summary: 'Commercial chattel mortgages, hire purchase contracts, and equipment lease facilities up to $500,000 AUD.',
              key_rules: ['Draft guidelines authored by Operations Squad', 'Covers equipment up to $500,000 AUD'],
              content: 'Draft operational SOP for underwriting commercial chattel mortgages, hire purchase contracts, and equipment lease facilities up to $500,000 AUD.'
            },
            {
              id: 'phase-2',
              phase_number: 2,
              title: 'Asset Valuation & Depreciation Benchmarks',
              summary: 'Asset classes, ATO diminishing value schedules, and mandatory PPSR registration.',
              key_rules: ['ATO diminishing value schedule verified', 'PPSR charge registration within 24 hours'],
              content: 'Asset classes: Heavy haulage transport, earthmoving equipment, agricultural machinery, and specialized medical imaging systems.'
            },
            {
              id: 'phase-3',
              phase_number: 3,
              title: 'Delegated Limits & Turnaround SLAs',
              summary: 'Approval tiers and turnaround SLA of 36 business hours.',
              key_rules: ['Bank Employee (Maker) assessment cap: $50,000 AUD', 'Credit Officer sign-off cap: $150,000 AUD'],
              content: 'Approval thresholds and SLAs for commercial chattel mortgages.'
            }
          ]
        },
        created_by: 'Sarah Jenkins (Bank Employee)'
      },

      {
        id: 'personal-loans-assessment-sop',
        department_id: 'retail-lending',
        title: 'Personal Loans & Overdraft Assessment Procedure',
        summary: 'Standard underwriting guidelines for unsecured personal loans, car loans, and revolving overdraft lines.',
        version: '1.1',
        status: 'active',
        is_masked: false,
        content: `### Phase 1: Underwriting Principles
Governs credit assessment for unsecured personal loans up to $75,000 AUD, vehicle loans, and overdraft limits across retail branch networks.

### Phase 2: Mandatory Key Criteria
1. **Employment Stability**: Minimum 6 months continuous employment with current employer.
2. **Debt-to-Income (DTI)**: Maximum aggregate DTI of 6.0x across all credit liabilities.
3. **HEM Benchmark**: Living expense verification comparing declared customer expenses against Household Expenditure Measure (HEM).`,
        parameters: {
          approval_limits: { officer_cap: '$10,000', manager_cap: '$30,000', executive_cap: '$75,000' },
          turnaround_sla: '48 Hours',
          daily_limit: '$10,000',
          verification_steps: [
            'Employment & 2-Month Proof of Continuous Income',
            'Comprehensive Credit Report Check (CCR)',
            'Debt-to-Income (DTI) Ratio <= 6x Benchmark',
            'Living Expense Assessment via Transaction Categorization'
          ],
          compliance_tags: ['Consumer Credit Protection', 'HEM Benchmark', 'DTI Cap 6.0x'],
          phases: [
            {
              id: 'phase-1',
              phase_number: 1,
              title: 'Underwriting Principles',
              summary: 'Credit assessment rules for unsecured personal loans up to $75,000 AUD and vehicle finance.',
              key_rules: ['Unsecured limit up to $75,000', 'Vehicle loans & overdraft limits'],
              content: 'Governs credit assessment for unsecured personal loans up to $75,000 AUD, vehicle loans, and overdraft limits across retail branch networks.'
            },
            {
              id: 'phase-2',
              phase_number: 2,
              title: 'Mandatory Key Criteria',
              summary: 'Employment stability, Debt-to-Income ratio capped at 6.0x, and HEM expense cross-check.',
              key_rules: ['Min 6 months continuous employment', 'DTI capped at 6.0x', 'HEM living expense cross-check'],
              content: '1. Employment Stability: Minimum 6 months continuous employment with current employer.\n2. Debt-to-Income (DTI): Maximum aggregate DTI of 6.0x across all credit liabilities.\n3. HEM Benchmark: Living expense verification comparing declared expenses against Household Expenditure Measure.'
            }
          ]
        },
        created_by: 'Marcus Vance (Bank Owner)'
      },
      {
        id: 'mortgage-underwriting-standard',
        department_id: 'retail-lending',
        title: 'Residential Mortgages & Tier-1 Home Loan Assessment Standard',
        summary: 'Regulatory assessment benchmarks for owner-occupied and investor residential mortgages under APRA APS 220 directives.',
        version: '2.0',
        status: 'active',
        is_masked: false,
        content: `### Phase 1: Scope & Prudential Mandate
Applies to all retail mortgage originations across branch, online, and broker channels adhering to APRA APS 220 credit risk standards.

### Phase 2: Mandatory Underwriting Thresholds
1. **Serviceability Buffer**: Mandatory minimum +3.00% interest rate buffer applied over the standard variable rate.
2. **Loan-to-Value Ratio (LVR)**: LVR exceeding 80% requires Lenders Mortgage Insurance (LMI) validation.
3. **Genuine Savings**: Minimum 5% verified genuine savings held for at least 3 continuous months.`,
        parameters: {
          approval_limits: { officer_cap: '$500,000', manager_cap: '$1,200,000', executive_cap: '$2,500,000' },
          turnaround_sla: '72 Hours',
          daily_limit: '$500,000',
          verification_steps: [
            '3-Month Genuine Savings Bank Statement Verification',
            'Valuation Report via CoreLogic Electronic Valuation (EVR)',
            'HEM Living Expense Cross-Verification',
            'Title Deed & Encumbrance Check via PEXA'
          ],
          compliance_tags: ['APRA APS 220', 'LMI Insurance', 'PEXA Title Check'],
          phases: [
            {
              id: 'phase-1',
              phase_number: 1,
              title: 'Scope & Prudential Mandate',
              summary: 'Mandatory APRA APS 220 credit risk governance across all consumer mortgage channels.',
              key_rules: ['Applies to branch, broker, and digital channels', 'APRA APS 220 compliance'],
              content: 'Applies to all retail mortgage originations across branch, online, and broker channels adhering to APRA APS 220 credit risk standards.'
            },
            {
              id: 'phase-2',
              phase_number: 2,
              title: 'Mandatory Underwriting Thresholds',
              summary: '+3.00% serviceability rate buffer, LMI validation over 80% LVR, and genuine savings verification.',
              key_rules: ['+3.00% serviceability buffer', 'LMI required for LVR > 80%', 'Min 5% genuine savings for 3 months'],
              content: '1. Serviceability Buffer: Mandatory minimum +3.00% interest rate buffer applied over the standard variable rate.\n2. Loan-to-Value Ratio (LVR): LVR exceeding 80% requires Lenders Mortgage Insurance (LMI) validation.\n3. Genuine Savings: Minimum 5% verified genuine savings held for at least 3 continuous months.'
            }
          ]
        },
        created_by: 'Sarah Jenkins (Bank Employee)'
      },

      // ----------------- 3. ONBOARDING LIBRARY -----------------
      {
        id: 'customer-onboarding-sop',
        department_id: 'onboarding',
        title: 'Digital Customer Onboarding & Identity Verification SOP',
        summary: 'Standard operating procedure for fast-track mobile and web digital banking customer onboarding.',
        version: '1.0',
        status: 'active',
        is_masked: false,
        content: `### Phase 1: Operational Overview
Ensures frictionless retail account opening while maintaining strict compliance with AUSTRAC customer identification and AML/CTF standards.

### Phase 2: Verification Flow & Biometrics
1. **Document Verification**: Real-time cross-match against Australian Document Verification Service (DVS) for Passport or Driver Licence.
2. **Biometric Face Match**: Active liveness detection score >= 92%.
3. **PEP & Sanctions**: Instantaneous screening against DFAT and international sanctions databases.`,
        parameters: {
          approval_limits: { initial_funding_cap: '$2,500' },
          turnaround_sla: '5 Minutes (Automated Digital)',
          daily_limit: '$2,500',
          verification_steps: [
            'Document Verification Service (DVS) National Check',
            'Biometric Face Liveness Score >= 92%',
            'Sanctions & Politically Exposed Persons (PEP) Screening',
            'Mobile Number Verification via One-Time Security PIN'
          ],
          compliance_tags: ['DVS National Check', 'Biometric Liveness', 'AUSTRAC CDD'],
          phases: [
            {
              id: 'phase-1',
              phase_number: 1,
              title: 'Operational Overview',
              summary: 'Frictionless digital onboarding adhering to AUSTRAC customer identification directives.',
              key_rules: ['Retail mobile and web account creation', 'Instantaneous identity verification'],
              content: 'Ensures frictionless retail account opening while maintaining strict compliance with AUSTRAC customer identification and AML/CTF standards.'
            },
            {
              id: 'phase-2',
              phase_number: 2,
              title: 'Verification Flow & Biometrics',
              summary: 'Real-time DVS verification, 92% biometric liveness threshold, and automated PEP screening.',
              key_rules: ['DVS national match', 'Biometric liveness score >= 92%', 'Instant PEP/Sanctions screening'],
              content: '1. Document Verification: Real-time cross-match against Australian Document Verification Service (DVS).\n2. Biometric Face Match: Active liveness detection score >= 92%.\n3. PEP & Sanctions: Instantaneous screening against DFAT and international sanctions databases.'
            }
          ]
        },
        created_by: 'Sarah Jenkins (Bank Employee)'
      },
      {
        id: 'commercial-kyc-sop',
        department_id: 'onboarding',
        title: 'Commercial Entity KYC & Beneficial Ownership Guideline',
        summary: 'Verification workflow for corporate accounts, trusts, partnerships, and ultimate beneficial owners (UBO >= 25%).',
        version: '1.3',
        status: 'active',
        is_masked: false,
        content: `### Phase 1: Corporate Customer Due Diligence
Mandatory verification steps before activating commercial deposit or merchant accounts for Australian registered entities.

### Phase 2: Governance & Beneficial Ownership (UBO)
1. **ASIC Validation**: Live extract confirming company status, registered office, and current directors.
2. **Beneficial Ownership (UBO)**: Identification of all natural persons holding 25% or more equity or effective control.
3. **Signatory Mandate**: Formal board resolution authorizing named operators.`,
        parameters: {
          approval_limits: { operating_account_ceiling: '$250,000' },
          turnaround_sla: '3 Business Days',
          daily_limit: '$250,000',
          verification_steps: [
            'ASIC Company Extract & Certificate of Registration',
            'Ultimate Beneficial Ownership (UBO >= 25%) Identification',
            'Authorized Signatory ID & Board Resolution Mandate',
            'Industry Risk Categorization & Source of Wealth Review'
          ],
          compliance_tags: ['ASIC Registry', 'UBO 25% Rule', 'Board Resolution'],
          phases: [
            {
              id: 'phase-1',
              phase_number: 1,
              title: 'Corporate Due Diligence',
              summary: 'Mandatory verification steps before activating commercial deposit or merchant facilities.',
              key_rules: ['Applies to Pty Ltd, Public Companies, Trusts, and Partnerships', 'ASIC live registry match'],
              content: 'Mandatory verification steps before activating commercial deposit or merchant accounts for Australian registered entities.'
            },
            {
              id: 'phase-2',
              phase_number: 2,
              title: 'Beneficial Ownership & Mandate',
              summary: 'Identification of 25%+ beneficial owners and board signatory verification.',
              key_rules: ['Natural person identification for 25%+ equity', 'Formal board signatory resolution required'],
              content: '1. ASIC Validation: Live extract confirming company status, registered office, and directors.\n2. Beneficial Ownership: Identification of natural persons holding 25% or more equity.\n3. Signatory Mandate: Formal board resolution authorizing named operators.'
            }
          ]
        },
        created_by: 'Marcus Vance (Bank Owner)'
      },

      // ----------------- 4. SECURITY & INFOSEC LIBRARY -----------------
      {
        id: 'remote-access-security-policy',
        department_id: 'security',
        title: 'Remote Workplace Access & Multi-Factor Protocol',
        summary: 'Mandatory technical standards for bank employees accessing internal banking systems and customer databases remotely.',
        version: '1.1',
        status: 'active',
        is_masked: false,
        content: `### Phase 1: Access Controls & Encryption
1. **VPN & Encryption**: All remote access must route through Commonwealth Bank enterprise VPN with TLS 1.3 encryption.
2. **Multi-Factor Authentication**: Hardware FIDO2 token or enterprise push notification with number matching required on every session.

### Phase 2: Endpoint Health & Inactivity Safeguards
1. **Device Health**: Active endpoint detection and response (EDR) agent running with zero pending security updates.
2. **Session Lock**: Workstations must enforce automatic screen lock after 5 minutes of inactivity.`,
        parameters: {
          approval_limits: { access_clearance: 'Standard Clearance' },
          turnaround_sla: 'Immediate / Continuous',
          daily_limit: 'Continuous Monitoring',
          verification_steps: [
            'FIDO2 / Hardware Token Authentication',
            'Device Health & MDM Encryption Check',
            'Geo-location Velocity Anomaly Detection',
            'Automatic Inactivity Screen Lock (5 Minutes)'
          ],
          compliance_tags: ['APRA CPS 234', 'TLS 1.3', 'FIDO2 Passwordless'],
          phases: [
            {
              id: 'phase-1',
              phase_number: 1,
              title: 'Access Controls & Encryption',
              summary: 'TLS 1.3 encrypted VPN tunnel and FIDO2 hardware token verification.',
              key_rules: ['Enterprise VPN mandatory', 'FIDO2 number-matching MFA'],
              content: '1. VPN & Encryption: All remote access must route through Commonwealth Bank enterprise VPN with TLS 1.3 encryption.\n2. Multi-Factor Authentication: Hardware FIDO2 token required on every session.'
            },
            {
              id: 'phase-2',
              phase_number: 2,
              title: 'Endpoint Health & Safeguards',
              summary: 'Mandatory EDR agent verification and automatic 5-minute inactivity lock.',
              key_rules: ['Zero pending security patches', 'Automatic screen lock after 5 mins'],
              content: '1. Device Health: Active endpoint detection and response (EDR) agent running.\n2. Session Lock: Workstations must enforce automatic screen lock after 5 minutes of inactivity.'
            }
          ]
        },
        created_by: 'Marcus Vance (Bank Owner)'
      },
      {
        id: 'privileged-access-sop',
        department_id: 'security',
        title: 'Privileged Access Management & Session Termination Standard',
        summary: 'Governance protocol for administrator access, database root access, cryptographic keys, and automated session auditing.',
        version: '2.0',
        status: 'active',
        is_masked: false,
        content: `### Phase 1: Privileged Scope & Roles
Applies to all database administrators, cloud infrastructure operators, and core banking systems engineers handling production databases.

### Phase 2: Safeguards & Dual-Approval
1. **Just-In-Time Elevation**: Elevated rights expire after a maximum 4-hour lease window.
2. **Dual Approval**: Production modifications require secondary approver sign-off.
3. **Audit Logging**: All privileged terminal sessions are keystroke-indexed and cryptographically hashed.`,
        parameters: {
          approval_limits: { authorization_mode: 'Dual-Admin Required' },
          turnaround_sla: '1 Hour Emergency Escalation',
          daily_limit: '4-Hour Maximum Lease',
          verification_steps: [
            'Just-In-Time (JIT) Elevated Credential Provisioning',
            'Keystroke & Session Video Recording for Core DB Access',
            'Mandatory 4-Eye Principle for Production Changes',
            'Maximum 4-Hour Privileged Lease Window'
          ],
          compliance_tags: ['APRA CPS 234', 'Privileged Access Management', '4-Eyes Principle'],
          phases: [
            {
              id: 'phase-1',
              phase_number: 1,
              title: 'Privileged Scope & Roles',
              summary: 'Strict boundaries for core banking DBA and infrastructure privileges.',
              key_rules: ['Core database access strictly isolated', 'Named operator authentication only'],
              content: 'Applies to all database administrators, cloud infrastructure operators, and core banking systems engineers handling production databases.'
            },
            {
              id: 'phase-2',
              phase_number: 2,
              title: 'Safeguards & Dual-Approval',
              summary: 'Maximum 4-hour lease window, secondary sign-off, and keystroke session recording.',
              key_rules: ['4-hour maximum lease window', 'Mandatory 4-eyes secondary sign-off', 'Immutable keystroke telemetry'],
              content: '1. Just-In-Time Elevation: Elevated rights expire after a maximum 4-hour lease window.\n2. Dual Approval: Production modifications require secondary approver sign-off.\n3. Audit Logging: All privileged terminal sessions are keystroke-indexed.'
            }
          ]
        },
        created_by: 'David Miller (Bank Employee)'
      },

      // ----------------- 5. LEGAL & COMPLIANCE LIBRARY -----------------
      {
        id: 'aml-ctf-screening-policy',
        department_id: 'legal-compliance',
        title: 'Anti-Money Laundering & Sanctions Screening Standard',
        summary: 'Operational rules for AUSTRAC transaction reporting, real-time sanctions screening, and suspicious matter reports (SMR).',
        version: '2.1',
        status: 'active',
        is_masked: false,
        content: `### Phase 1: AUSTRAC Regulatory Reporting Mandates
Mandatory compliance standards aligned with the Anti-Money Laundering and Counter-Terrorism Financing Act 2006.

### Phase 2: Operational Reporting Obligations
1. **Threshold Transaction Reports (TTR)**: Cash transfers >= $10,000 AUD reported within 10 business days.
2. **Suspicious Matter Reports (SMR)**: Suspicious activity notifications submitted within 24 hours (terrorism financing) or 3 business days (money laundering).
3. **Automated Sanctions Filtering**: Real-time screening of inbound and outbound SWIFT / NPP payments against DFAT lists.`,
        parameters: {
          approval_limits: { reporting_threshold: '$10,000 AUD TTR' },
          turnaround_sla: '24 Hours for SMR Submission',
          daily_limit: '$10,000 AUD Threshold',
          verification_steps: [
            'Real-time DFAT & UN Sanctions List Cross-matching',
            'Significant Cash Transaction Reporting (SCTR) Thresholds',
            'Automated Transaction Monitoring for Smurfing & Layering',
            '24-Hour Regulatory AUSTRAC Notification Escalation'
          ],
          compliance_tags: ['AML/CTF Act 2006', 'AUSTRAC TTR/SMR', 'DFAT Sanctions'],
          phases: [
            {
              id: 'phase-1',
              phase_number: 1,
              title: 'Regulatory Reporting Mandates',
              summary: 'Statutory compliance aligned with the Anti-Money Laundering and Counter-Terrorism Financing Act 2006.',
              key_rules: ['AUSTRAC reporting obligations', 'Zero-tolerance sanctions breach threshold'],
              content: 'Mandatory compliance standards aligned with the Anti-Money Laundering and Counter-Terrorism Financing Act 2006.'
            },
            {
              id: 'phase-2',
              phase_number: 2,
              title: 'Operational Reporting Obligations',
              summary: 'Threshold transaction reporting ($10k+), 24h/72h suspicious matter filings, and real-time sanctions filtering.',
              key_rules: ['TTR cash >= $10k reported in 10 days', 'SMR filed within 24h for terrorism financing', 'SWIFT/NPP real-time DFAT check'],
              content: '1. Threshold Transaction Reports: Cash transfers >= $10,000 AUD reported within 10 business days.\n2. Suspicious Matter Reports: Suspicious activity notifications submitted within 24 hours.\n3. Automated Sanctions Filtering: Real-time screening against DFAT lists.'
            }
          ]
        },
        created_by: 'Marcus Vance (Bank Owner)'
      },
      {
        id: 'cdr-privacy-policy',
        department_id: 'legal-compliance',
        title: 'Consumer Data Right (CDR) & Privacy Disclosures Policy',
        summary: 'Requirements for open banking data sharing, customer consent capture, revocation protocols, and APRA CPS 234 privacy adherence.',
        version: '1.4',
        status: 'active',
        is_masked: false,
        content: `### Phase 1: Open Banking Architecture & Consent
Governs secure customer-directed sharing of banking transaction data with Accredited Data Recipients (ADRs) under the Consumer Data Right.

### Phase 2: Customer Consent Rules & Governance
1. **Consent Management**: Explicit, unbundled, time-limited consumer consents.
2. **Instant Revocation**: Ability for customers to revoke data-sharing access in single click via mobile banking app.
3. **Data Redaction**: Strict masking of joint account non-consenting parties' details.`,
        parameters: {
          approval_limits: { scope: 'Accredited Data Recipient (ADR) Scope' },
          turnaround_sla: 'Real-time API Consent Sync',
          daily_limit: 'Real-time Sync',
          verification_steps: [
            'Explicit & Unbundled Consumer Consent Verification',
            'End-to-End TLS 1.3 Encryption & MTLS for API Transfers',
            'Instantaneous Consent Revocation & Data Deletion Mechanism',
            'Annual Independent CDR Security Audit Review'
          ],
          compliance_tags: ['CDR Open Banking', 'Privacy Act 1988', 'APRA CPS 234'],
          phases: [
            {
              id: 'phase-1',
              phase_number: 1,
              title: 'Open Banking & Consent',
              summary: 'Customer-directed transaction sharing with Accredited Data Recipients under CDR rules.',
              key_rules: ['Explicit unbundled consent mandatory', 'MTLS encrypted API transfers'],
              content: 'Governs secure customer-directed sharing of banking transaction data with Accredited Data Recipients (ADRs) under the Consumer Data Right.'
            },
            {
              id: 'phase-2',
              phase_number: 2,
              title: 'Consent Governance & Redaction',
              summary: 'One-click instantaneous revocation and strict redaction of non-consenting joint account holders.',
              key_rules: ['Instant one-click revocation in app', 'Redaction of joint non-consenting data'],
              content: '1. Consent Management: Explicit, unbundled, time-limited consumer consents.\n2. Instant Revocation: Ability for customers to revoke data-sharing access in single click.\n3. Data Redaction: Strict masking of joint account details.'
            }
          ]
        },
        created_by: 'Sarah Jenkins (Bank Employee)'
      }
    ];

    // 3. Upsert policies preserving draft/active status
    for (const p of policies) {
      await query(`
        INSERT INTO policies (id, department_id, title, summary, version, status, is_masked, content, parameters, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE 
        SET department_id = EXCLUDED.department_id,
            title = EXCLUDED.title,
            summary = EXCLUDED.summary,
            version = EXCLUDED.version,
            status = EXCLUDED.status,
            is_masked = EXCLUDED.is_masked,
            content = EXCLUDED.content,
            parameters = EXCLUDED.parameters,
            created_by = EXCLUDED.created_by,
            updated_at = CURRENT_TIMESTAMP;
      `, [p.id, p.department_id, p.title, p.summary, p.version, p.status, p.is_masked, p.content, JSON.stringify(p.parameters), p.created_by]);

      // Seed version
      await query(`
        INSERT INTO policy_versions (policy_id, version_number, content, parameters, changed_by, change_summary)
        VALUES ($1, $2, $3, $4, $5, 'Updated structured phases and operational limits')
        ON CONFLICT DO NOTHING;
      `, [p.id, p.version, p.content, JSON.stringify(p.parameters), p.created_by]);
    }

    console.log('✅ Successfully updated database with Home Loan Valuations PDF policy, Bank Employee draft, and structured phases across all policies!');
  } catch (err) {
    console.error('❌ Error updating DB:', err);
  } finally {
    process.exit(0);
  }
}

if (require.main === module) {
  updateDb();
}

module.exports = { updateDb };
