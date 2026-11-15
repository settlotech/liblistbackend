const { query } = require('../config/db');
(async () => {
  const sections = await query(`
    SELECT id, document_id, section_title, 
           substring(content::text, 1, 400) as content_preview,
           substring(draft_content::text, 1, 400) as draft_preview
    FROM document_management.document_sections
    WHERE content::text LIKE '%image%' OR draft_content::text LIKE '%image%'
       OR content::text LIKE '%blob:%' OR draft_content::text LIKE '%blob:%'
    LIMIT 5;
  `);
  console.log('Sections with image/blob:', JSON.stringify(sections.rows, null, 2));

  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
