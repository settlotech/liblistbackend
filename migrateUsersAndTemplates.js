const { query } = require('./db');

async function migrate() {
  console.log('⚡ Starting database migration for Users & Dynamic Templates...');

  try {
    // 1. Create users table
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        role VARCHAR(100) NOT NULL,
        role_type VARCHAR(50) NOT NULL,      -- 'manager', 'employee', 'admin'
        department VARCHAR(255),
        avatar VARCHAR(10),
        bank_id VARCHAR(50) DEFAULT 'cba',
        is_active BOOLEAN DEFAULT TRUE,
        created_by VARCHAR(100) DEFAULT 'System Administrator',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Table `users` checked/created.');

    // 2. Create policy_templates table
    await query(`
      CREATE TABLE IF NOT EXISTS policy_templates (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        title VARCHAR(255) NOT NULL,
        department_id VARCHAR(100) REFERENCES departments(id) ON DELETE SET NULL,
        summary TEXT,
        sla VARCHAR(50) DEFAULT '4 Hours',
        daily_limit VARCHAR(50) DEFAULT '$25,000 AUD',
        officer_cap VARCHAR(50) DEFAULT '$100,000 AUD',
        sections JSONB DEFAULT '[]'::jsonb,
        phases JSONB DEFAULT '[]'::jsonb,
        is_active BOOLEAN DEFAULT TRUE,
        created_by VARCHAR(100) DEFAULT 'System Administrator',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Table `policy_templates` checked/created.');

    // 3. Seed initial users
    const defaultUsers = [
      {
        id: 'u_admin_ramesh',
        name: 'Ramesh',
        email: 'ramesh.platform@libtrak.gov.au',
        role: 'Platform Owner',
        role_type: 'admin',
        department: 'National Banking Oversight & APRA Audit',
        avatar: 'R',
        bank_id: 'cba'
      },
      {
        id: 'u_cba_marcus',
        name: 'Marcus Vance',
        email: 'marcus.vance@cba.com.au',
        role: 'Bank Owner',
        role_type: 'manager',
        department: 'Executive Governance & Retail Operations',
        avatar: 'MV',
        bank_id: 'cba'
      },
      {
        id: 'u_cba_sarah',
        name: 'Sarah Jenkins',
        email: 'sarah.jenkins@cba.com.au',
        role: 'Bank Employee (Maker)',
        role_type: 'employee',
        department: 'Credit Operations Squad',
        avatar: 'SJ',
        bank_id: 'cba'
      },
      {
        id: 'u_cba_david',
        name: 'David Miller',
        email: 'david.miller@cba.com.au',
        role: 'Bank Employee (Reviewer)',
        role_type: 'employee',
        department: 'InfoSec & Cyber Defense',
        avatar: 'DM',
        bank_id: 'cba'
      },
      {
        id: 'u_cba_emma',
        name: 'Emma Watson',
        email: 'emma.watson@cba.com.au',
        role: 'Bank Employee',
        role_type: 'employee',
        department: 'Regulatory Compliance Audit',
        avatar: 'EW',
        bank_id: 'cba'
      },
      {
        id: 'u_nab_rachel',
        name: 'Rachel Wong',
        email: 'rachel.wong@nab.com.au',
        role: 'NAB Regulatory Compliance Analyst',
        role_type: 'employee',
        department: 'Lending Solutions',
        avatar: 'RW',
        bank_id: 'nab'
      },
      {
        id: 'u_nab_james',
        name: 'James Harrison',
        email: 'james.harrison@nab.com.au',
        role: 'NAB GM of Regulatory Governance',
        role_type: 'manager',
        department: 'Executive Risk',
        avatar: 'JH',
        bank_id: 'nab'
      },
      {
        id: 'u_wbc_anthony',
        name: 'Anthony Clarke',
        email: 'anthony.clarke@westpac.com.au',
        role: 'Westpac Enterprise Risk Analyst',
        role_type: 'employee',
        department: 'Commercial Credit',
        avatar: 'AC',
        bank_id: 'wbc'
      },
      {
        id: 'u_wbc_claire',
        name: 'Claire Bennett',
        email: 'claire.bennett@westpac.com.au',
        role: 'Westpac Head of Enterprise Compliance',
        role_type: 'manager',
        department: 'Risk & Compliance',
        avatar: 'CB',
        bank_id: 'wbc'
      },
      {
        id: 'u_anz_elena',
        name: 'Elena Rossi',
        email: 'elena.rossi@anz.com.au',
        role: 'ANZ Lead AppSec Engineer',
        role_type: 'employee',
        department: 'Digital Security',
        avatar: 'ER',
        bank_id: 'anz'
      },
      {
        id: 'u_anz_alex',
        name: 'Alex Patel',
        email: 'alex.patel@anz.com.au',
        role: 'ANZ Chief Information Security Officer',
        role_type: 'manager',
        department: 'Cyber Command',
        avatar: 'AP',
        bank_id: 'anz'
      }
    ];

    for (const u of defaultUsers) {
      await query(`
        INSERT INTO users (id, name, email, role, role_type, department, avatar, bank_id, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
        ON CONFLICT (id) DO UPDATE
          SET name = EXCLUDED.name,
              email = EXCLUDED.email,
              role = EXCLUDED.role,
              role_type = EXCLUDED.role_type,
              department = EXCLUDED.department,
              avatar = EXCLUDED.avatar,
              bank_id = EXCLUDED.bank_id;
      `, [u.id, u.name, u.email, u.role, u.role_type, u.department, u.avatar, u.bank_id]);
    }
    console.log(`✅ Seeded ${defaultUsers.length} institutional users with full multi-bank roles.`);

    // 4. Seed dynamic starter policy templates
    const defaultTemplates = [
      {
        id: 'template-01-pdf',
        name: 'Policy Document',
        title: 'Credit Card Product Suite & Issuance Policy',
        department_id: 'company-policies',
        summary: 'Core institutional card governance, tiered underwriting criteria, and mandatory credit risk assessment.',
        sla: '4 Hours',
        daily: '$25,000 AUD',
        cap: '$100,000 AUD',
        sections: [
          {
            title: '1. Purpose & Scope',
            content: 'Defines the operational rules and risk parameters for retail card issuance across all customer segments.'
          },
          {
            title: '2. Underwriting Limits & Approvals',
            content: 'Automated decisioning threshold up to $15,000 AUD. Credit assessor review required for limits above $25,000 AUD.'
          },
          {
            title: '3. Compliance & Audit Verification',
            content: 'Full compliance with APRA APS 220 Credit Risk and National Consumer Credit Protection Act.'
          }
        ],
        phases: [
          {
            id: 'phase-1',
            phase_number: 1,
            title: 'Eligibility & Identity Assessment',
            summary: 'Pre-screening via DVS, income verification, and living expenses benchmark check.',
            key_rules: ['APRA DTI <= 6.0x', 'DVS 100-Point Match', 'HEM Benchmark Adopted']
          },
          {
            id: 'phase-2',
            phase_number: 2,
            title: 'Underwriting & Limit Decisioning',
            summary: 'Automated limit calculation or credit officer sign-off based on risk band.',
            key_rules: ['Turnaround SLA: 4 Hours', 'Officer Cap: $100,000 AUD', 'Maker-Checker on High Risk']
          },
          {
            id: 'phase-3',
            phase_number: 3,
            title: 'Fulfillment & Audit Archiving',
            summary: 'Instant digital card provisioning to digital wallet and archiving into immutable DMS.',
            key_rules: ['Digital Provisioning in 8 Mins', '7-Year Audit Trail', 'AUSTRAC Real-time Logging']
          }
        ]
      },
      {
        id: 'template-02-exec',
        name: 'Executive Summary',
        title: 'Executive Governance & Operational Risk Charter',
        department_id: 'company-policies',
        summary: 'High-level board summary capturing enterprise thresholds, capital reserve buffers, and APRA compliance.',
        sla: '24 Hours',
        daily: '$100,000 AUD',
        cap: '$500,000 AUD',
        sections: [
          {
            title: '1. Executive Mandate',
            content: 'Establishes risk appetite and boundary limits set by the Board Audit and Risk Committee.'
          },
          {
            title: '2. Capital Adequacy & Stress Test Ratios',
            content: 'Minimum Tier 1 Capital Ratio maintained at >= 10.5% with internal buffer of 1.5% above APRA baseline.'
          }
        ],
        phases: [
          {
            id: 'phase-1',
            phase_number: 1,
            title: 'Board Governance Framework',
            summary: 'Oversight cadence, quarterly review, and statutory reporting obligations.',
            key_rules: ['Quarterly Board Review', 'APRA Prudential Standards', 'CPS 234 Audit']
          },
          {
            id: 'phase-2',
            phase_number: 2,
            title: 'Escalation & Intervention Triggers',
            summary: 'Protocols for material risk notifications to APRA within 24 hours of breach detection.',
            key_rules: ['24h APRA Breach Notification', 'C-Suite Escalation Path', 'Capital Buffer Check']
          }
        ]
      },
      {
        id: 'template-03-sop',
        name: 'Operational Procedure (SOP)',
        title: 'Standard Operating Procedure: Loan Fulfillment',
        department_id: 'retail-lending',
        summary: 'Step-by-step procedural guide for branch and digital fulfillment teams managing loan documents.',
        sla: '4 Hours',
        daily: '$25,000 AUD',
        cap: '$100,000 AUD',
        sections: [
          {
            title: '1. Workflow Trigger',
            content: 'Triggered upon automated conditional approval from credit origination engine.'
          },
          {
            title: '2. Security Verification & Document Package',
            content: 'Mortgage / security document bundle generated and sent for electronic signature via PEXA.'
          }
        ],
        phases: [
          {
            id: 'phase-1',
            phase_number: 1,
            title: 'Verification & Package Generation',
            summary: 'Assembly of loan contracts, direct debit forms, and security registers.',
            key_rules: ['4h Fulfillment SLA', 'PEXA Electronic Signature', 'DVS Cross-match']
          },
          {
            id: 'phase-2',
            phase_number: 2,
            title: 'Disbursement & Settlement',
            summary: 'Funds transfer to settlement escrow following dual verification sign-off.',
            key_rules: ['Daily Limit: $25,000 AUD', 'Dual Authorizer Required', 'Real-time NPP Settlement']
          }
        ]
      },
      {
        id: 'template-04-h1',
        name: 'Statutory Standard',
        title: 'APRA CPS 234 Information Security & Cyber Resilience Standard',
        department_id: 'legal-compliance',
        summary: 'Enforces cyber defense controls, incident notification within 72h, and third-party security assurance.',
        sla: '72 Hours',
        daily: '$50,000 AUD',
        cap: '$250,000 AUD',
        sections: [
          {
            title: '1. Regulatory Mandate (APRA CPS 234)',
            content: 'Mandates defined information security roles, active threat hunting, and tested incident response plans.'
          },
          {
            title: '2. Incident Notification & Reporting',
            content: 'APRA must be formally notified no later than 72 hours after becoming aware of an information security incident.'
          }
        ],
        phases: [
          {
            id: 'phase-1',
            phase_number: 1,
            title: 'Threat Detection & Incident Triage',
            summary: '24/7 SIEM monitoring and initial severity scoring within 15 minutes of alert.',
            key_rules: ['15m Triage SLA', 'Severity 1-4 Classification', 'Zero Trust Isolation']
          },
          {
            id: 'phase-2',
            phase_number: 2,
            title: 'Containment & APRA Escalation',
            summary: 'Incident containment and regulatory notification to APRA within 72 hours.',
            key_rules: ['72h APRA Statutory SLA', 'Forensic Preservation', 'CISO Sign-off']
          }
        ]
      }
    ];

    for (const t of defaultTemplates) {
      await query(`
        INSERT INTO policy_templates 
          (id, name, title, department_id, summary, sla, daily_limit, officer_cap, sections, phases, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)
        ON CONFLICT (id) DO UPDATE
          SET name = EXCLUDED.name,
              title = EXCLUDED.title,
              department_id = EXCLUDED.department_id,
              summary = EXCLUDED.summary,
              sla = EXCLUDED.sla,
              daily_limit = EXCLUDED.daily_limit,
              officer_cap = EXCLUDED.officer_cap,
              sections = EXCLUDED.sections,
              phases = EXCLUDED.phases;
      `, [
        t.id,
        t.name,
        t.title,
        t.department_id,
        t.summary,
        t.sla,
        t.daily,
        t.cap,
        JSON.stringify(t.sections),
        JSON.stringify(t.phases)
      ]);
    }
    console.log(`✅ Seeded ${defaultTemplates.length} dynamic institutional starter templates.`);

    // 5. Query and display current tables list in database
    const tablesRes = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name ASC;
    `);

    console.log('\n📊 CURRENT DATABASE TABLES IN NEON POSTGRESQL:');
    tablesRes.rows.forEach((row, i) => {
      console.log(`  ${i + 1}. ${row.table_name}`);
    });

    console.log('\n🎉 Migration completed successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    throw err;
  }
}

if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { migrate };

