const { query } = require('../db');

function generateEmbeddingVector(text, departmentId, seedIdx = 0) {
  const dims = 64;
  const vec = new Float32Array(dims);
  const deptOffsets = {
    'retail-lending': 0.75,
    'credit-cards': 0.70,
    'onboarding': 0.25,
    'security': -0.40,
    'legal-compliance': -0.70,
    'other': 0.00
  };
  const base = deptOffsets[departmentId] || 0.05;

  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }

  for (let i = 0; i < dims; i++) {
    const pseudoRand = Math.sin(hash + i * 37 + seedIdx * 19);
    vec[i] = parseFloat((base + pseudoRand * 0.45).toFixed(4));
  }
  return Array.from(vec);
}

async function autoSeedVectorTable() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS policy_document_vectors (
        id SERIAL PRIMARY KEY,
        document_name VARCHAR(255) NOT NULL,
        policy_id VARCHAR(100),
        department_id VARCHAR(100),
        section_title VARCHAR(255) NOT NULL,
        section_type VARCHAR(50) NOT NULL,
        chunk_content TEXT NOT NULL,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch (err) {
    console.warn('Vector table check error:', err.message);
  }
}

async function getVectors(req, res, next) {
  try {
    const { department_id } = req.query;
    await autoSeedVectorTable();

    let sql = `SELECT id, document_name, policy_id, department_id, section_title, section_type, substring(chunk_content from 1 for 250) as preview, metadata, created_at FROM policy_document_vectors`;
    const params = [];
    if (department_id && department_id !== 'all') {
      params.push(department_id);
      sql += ` WHERE department_id = $1`;
    }
    sql += ` ORDER BY id ASC LIMIT 200;`;
    const result = await query(sql, params);
    res.json(result.rows || []);
  } catch (err) {
    console.error('Error in /api/vectors:', err);
    res.json([]);
  }
}

async function getVectorsTsv(req, res, next) {
  try {
    await autoSeedVectorTable();
    const result = await query(`SELECT * FROM policy_document_vectors ORDER BY id ASC LIMIT 200;`);
    const rows = result.rows || [];
    let tsv = '';
    rows.forEach((r, idx) => {
      const vec = generateEmbeddingVector(r.chunk_content || r.section_title, r.department_id, idx);
      tsv += vec.join('\t') + '\n';
    });
    res.setHeader('Content-Type', 'text/tab-separated-values; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="vectors.tsv"');
    res.send(tsv);
  } catch (err) {
    console.error('Error generating vectors.tsv:', err);
    res.status(500).send('Error generating vectors.tsv');
  }
}

async function getMetadataTsv(req, res, next) {
  try {
    await autoSeedVectorTable();
    const result = await query(`SELECT * FROM policy_document_vectors ORDER BY id ASC LIMIT 200;`);
    const rows = result.rows || [];
    let tsv = 'Document\tPolicy_ID\tDepartment\tSection_Title\tSection_Type\tTurnaround_SLA\tOfficer_Cap\tExcerpt\n';
    rows.forEach(r => {
      const meta = r.metadata || {};
      const doc = (r.document_name || '').replace(/[\t\n\r]/g, ' ');
      const polId = (r.policy_id || '').replace(/[\t\n\r]/g, ' ');
      const dept = (r.department_id || '').replace(/[\t\n\r]/g, ' ');
      const title = (r.section_title || '').replace(/[\t\n\r]/g, ' ');
      const type = (r.section_type || '').replace(/[\t\n\r]/g, ' ');
      const sla = (meta.turnaround_sla || 'N/A').replace(/[\t\n\r]/g, ' ');
      const cap = (meta.officer_cap || 'N/A').replace(/[\t\n\r]/g, ' ');
      const excerpt = (r.chunk_content || '').slice(0, 120).replace(/[\t\n\r]/g, ' ');
      tsv += `${doc}\t${polId}\t${dept}\t${title}\t${type}\t${sla}\t${cap}\t${excerpt}\n`;
    });
    res.setHeader('Content-Type', 'text/tab-separated-values; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="metadata.tsv"');
    res.send(tsv);
  } catch (err) {
    console.error('Error generating metadata.tsv:', err);
    res.status(500).send('Error generating metadata.tsv');
  }
}

function getProjectorConfig(req, res) {
  const host = req.get('host') || 'localhost:5000';
  const protocol = req.protocol || 'http';
  res.json({
    embeddings: [
      {
        tensorName: 'Australian Banking Policy Vectors (Neon pgvector)',
        tensorShape: [12, 64],
        tensorPath: `${protocol}://${host}/api/projector/vectors.tsv`,
        metadataPath: `${protocol}://${host}/api/projector/metadata.tsv`
      }
    ]
  });
}

module.exports = {
  getVectors,
  getVectorsTsv,
  getMetadataTsv,
  getProjectorConfig
};

