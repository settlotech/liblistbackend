const https = require('https');
const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');
require('dotenv').config();

const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.GROK_API;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

/**
 * Extract raw text, HTML structure, and embedded images from uploaded files
 */
const extractRawTextFromFile = async (buffer, mimeType, originalName = '') => {
    const lowerName = (originalName || '').toLowerCase();

    if (mimeType === 'application/pdf' || lowerName.endsWith('.pdf')) {
        try {
            const parser = new PDFParse({ data: buffer });
            await parser.load();
            const textResult = await parser.getText();

            // Extract embedded images from PDF (e.g. sample reports, figures, charts)
            let extractedImages = [];
            try {
                const imgResult = await parser.getImage({ imageDataUrl: true });
                if (imgResult && Array.isArray(imgResult.pages)) {
                    imgResult.pages.forEach((p) => {
                        if (Array.isArray(p.images)) {
                            p.images.forEach((img, idx) => {
                                if (img.dataUrl && (img.width > 20 || img.height > 20)) {
                                    extractedImages.push({
                                        page: p.pageNumber,
                                        name: img.name || `Figure_Page${p.pageNumber}_${idx + 1}`,
                                        dataUrl: img.dataUrl,
                                        width: img.width,
                                        height: img.height,
                                    });
                                }
                            });
                        }
                    });
                }
            } catch (imgErr) {
                console.warn('PDF image extraction note:', imgErr.message);
            }

            await parser.destroy();
            return {
                text: textResult?.text || '',
                html: null,
                images: extractedImages,
                source_type: 'pdf',
            };
        } catch (pdfErr) {
            console.error('PDF parsing error:', pdfErr);
            throw new Error(`Failed to parse PDF document: ${pdfErr.message}`);
        }
    }

    if (
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mimeType === 'application/msword' ||
        lowerName.endsWith('.docx') ||
        lowerName.endsWith('.doc')
    ) {
        try {
            let extractedImages = [];
            const textResult = await mammoth.extractRawText({ buffer });
            const htmlResult = await mammoth.convertToHtml(
                { buffer },
                {
                    convertImage: mammoth.images.imgElement((image) => {
                        return image.read('base64').then((imageBuffer) => {
                            const dataUrl = `data:${image.contentType};base64,${imageBuffer}`;
                            extractedImages.push({
                                name: 'Embedded Figure',
                                dataUrl,
                            });
                            return { src: dataUrl };
                        });
                    }),
                }
            );
            return {
                text: textResult?.value || '',
                html: htmlResult?.value || '',
                images: extractedImages,
                source_type: 'docx',
            };
        } catch (docErr) {
            console.error('Word document parsing error:', docErr);
            throw new Error(`Failed to parse Word document: ${docErr.message}`);
        }
    }

    // Default plain text fallback
    return {
        text: buffer.toString('utf-8'),
        html: null,
        images: [],
        source_type: 'text',
    };
};

/**
 * Call Groq Cloud LLM to extract full text, tables, bullet points, and figures
 */
const transformTextWithTemplate = async (rawText, template, useTemplate = true, extractedImages = []) => {
    if (!GROQ_API_KEY) {
        throw new Error('Groq API Key (GROQ_API_KEY or GROK_API) is not configured in backend .env');
    }

    let systemPrompt = '';
    let userPrompt = '';

    const formattingGuidelines = `
CRITICAL EXTRACTION REQUIREMENTS (PRESERVE ALL CONTENT, TABLES, POINTS & FIGURES):
1. TABLES (MANDATORY HTML <table>):
   - You MUST detect all tables, tabular data, authority matrices, approval matrices, and criteria schedules (such as "Valuation Table", "Attributes Criteria", "Credit Approval Authority Matrix", etc.).
   - Format each table in clean semantic HTML:
     <table class="editor-table" style="width: 100%; border-collapse: collapse; margin: 16px 0;">
       <thead>
         <tr style="background-color: #f1f5f9;">
           <th style="border: 1px solid #cbd5e1; padding: 8px 12px; font-weight: 600; text-align: left;">Column Header</th>
         </tr>
       </thead>
       <tbody>
         <tr>
           <td style="border: 1px solid #cbd5e1; padding: 8px 12px;">Cell Content</td>
         </tr>
       </tbody>
     </table>
   - If a table cell contains bullet points, render them as <ul><li>...</li></ul> inside that <td>.
   - NEVER output tables as ASCII pipes, tabs, or flat inline text.

2. LISTS & BULLET POINTS (MANDATORY HTML <ul> / <ol>):
   - You MUST detect all bullet points (e.g. ●, •, ˆ, -) and format them as <ul><li>Point text</li></ul>.
   - You MUST detect all numbered/lettered lists (1., 2., a., i.) and format them as <ol><li>Numbered item text</li></ol>.
   - Preserve sub-bullet points as nested <ul><li>...</li></ul>.
   - NEVER flatten lists into comma-separated text paragraphs.

3. IMAGES & FIGURES:
   - If the document references a figure, chart, diagram, or sample report (e.g. "Figure 1: Sample Report"), include:
     <figure style="margin: 20px 0; text-align: center;">
       {{IMAGE_FIGURE_1}}
       <figcaption style="font-size: 12px; color: #64748b; margin-top: 6px; font-style: italic;">Figure: Sample Report</figcaption>
     </figure>

4. COMPLETENESS (NO SUMMARIZATION):
   - Extract ALL policy provisions, requirements, thresholds, criteria, exceptions, and RACI roles completely.
   - Do NOT summarize or shorten detailed operational clauses.

5. PAGE BREAKS (WORD & PDF STYLE):
   - For multi-page documents (PDF / Word), insert a clean page break between document pages or major sections:
     <div data-type="page-break" class="document-page-break"></div>
   - Page breaks must sit strictly between discrete blocks (never inside a table row or across headings).
`;

    if (useTemplate && template) {
        const templateName = template?.template_name || 'Standard Bank Operational Policy';
        const templateCategory = template?.category || 'Operational Risk';
        const templateSections = Array.isArray(template?.structure_schema?.sections)
            ? template.structure_schema.sections
            : [
                  { title: '1. Purpose & Scope', description: 'Objectives, scope of application, and regulatory context' },
                  { title: '2. Governance & Responsibilities', description: 'RACI roles, oversight committees, and accountabilities' },
                  { title: '3. Policy Statements & Operational Rules', description: 'Mandatory controls, principles, and procedures' },
                  { title: '4. Monitoring, Compliance & Controls', description: 'KRI metrics, audit testing, and compliance attestations' },
                  { title: '5. Policy Exceptions & Escalations', description: 'Exception approval pathways and breach reporting' },
              ];

        const templateSchemaPrompt = JSON.stringify(templateSections, null, 2);

        systemPrompt = `You are an expert Banking Regulatory Compliance & Document Architecture AI for an Australian Financial Institution (APRA / ASIC regulated).
Your task is to ingest unstructured policy text extracted from an uploaded circular/policy document, and intelligently map and re-format it into a structured Operational Policy matching the target bank template.

Target Template: "${templateName}" (Category: ${templateCategory})
Required Target Sections:
${templateSchemaPrompt}

${formattingGuidelines}

RULES:
1. Extract or determine an authoritative "document_name", "document_type" (typically 'policy'), and a concise "description" (2-3 sentences executive summary).
2. For each required target section in the template, map and synthesize relevant clauses from the source text. Write comprehensive, professional bank policy content in semantic HTML (using <h3>, <h4>, <p>, <ul>, <li>, <ol>, <table>, <thead>, <tbody>, <tr>, <th>, <td>, <strong>).
3. If source text contains content, appendices, historical tables, or clauses that do NOT fit cleanly into the template's required sections, extract them into "unmapped_content".
4. Each item in "unmapped_content" must have:
   - "id": string (e.g. "unmapped-1")
   - "title": short descriptive title
   - "content": the text / HTML (preserving any tables or lists)
   - "suggested_section": which template section this might optionally belong to
   - "reason": why it wasn't placed in the main sections
5. You MUST return ONLY valid JSON matching this exact structure:
{
  "document_name": "string",
  "document_type": "policy",
  "description": "string",
  "sections": [
    {
      "section_title": "string",
      "section_order": 1,
      "content": "string with HTML formatting"
    }
  ],
  "unmapped_content": [
    {
      "id": "string",
      "title": "string",
      "content": "string",
      "suggested_section": "string",
      "reason": "string"
    }
  ]
}
No conversational text, no markdown codeblocks, only pure JSON.`;

        userPrompt = `Source Document Raw Text:
${rawText.slice(0, 35000)}

Ingest and format this document according to the template "${templateName}". Return the structured JSON.`;
    } else {
        // Natural Document Structure Extraction (No Template Formatting)
        systemPrompt = `You are an expert Document Analysis and Extraction AI for banking policies and regulatory compliance documents.
Your task is to ingest the raw text of an uploaded document and extract its NATURAL native sections, headings, clauses, bullet points, tables, and figures exactly as authored in the source document, preserving its original structure, order, and complete text without forcing it into any specific template.

${formattingGuidelines}

RULES:
1. Extract the authoritative "document_name", "document_type" (e.g. 'policy', 'procedure', 'framework'), and a concise "description" (executive summary of the document).
2. Extract each native section/heading in the document in its natural sequential order ("section_title", "section_order", "content").
3. Format each section's content in clean semantic HTML (using <h3>, <h4>, <p>, <ul>, <li>, <ol>, <table>, <thead>, <tbody>, <tr>, <th>, <td>, <strong>).
4. If there are miscellaneous notes, preamble, or trailing appendices that don't belong to a section, place them in "unmapped_content" (otherwise "unmapped_content" can be []).
5. You MUST return ONLY valid JSON matching this exact structure:
{
  "document_name": "string",
  "document_type": "policy",
  "description": "string",
  "sections": [
    {
      "section_title": "string",
      "section_order": 1,
      "content": "string with HTML formatting"
    }
  ],
  "unmapped_content": [
    {
      "id": "string",
      "title": "string",
      "content": "string",
      "suggested_section": "string",
      "reason": "string"
    }
  ]
}
No conversational text, no markdown codeblocks, only pure JSON.`;

        userPrompt = `Source Document Raw Text:
${rawText.slice(0, 35000)}

Extract the document's native sections, headings, bullet points, and tables in their complete natural structure. Return the structured JSON.`;
    }

    const requestBody = JSON.stringify({
        model: GROQ_MODEL,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.15,
        max_tokens: 6144,
    });

    return new Promise((resolve, reject) => {
        const req = https.request(
            {
                hostname: 'api.groq.com',
                path: '/openai/v1/chat/completions',
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(requestBody),
                },
                timeout: 90000,
            },
            (res) => {
                let data = '';
                res.on('data', (chunk) => (data += chunk));
                res.on('end', () => {
                    if (res.statusCode >= 400) {
                        return reject(new Error(`Groq API Error (${res.statusCode}): ${data}`));
                    }
                    try {
                        const parsed = JSON.parse(data);
                        const messageContent = parsed?.choices?.[0]?.message?.content;
                        if (!messageContent) {
                            return reject(new Error('Groq returned empty response content'));
                        }
                        const structuredDoc = JSON.parse(messageContent);

                        // Inject extracted images into HTML sections
                        if (Array.isArray(extractedImages) && extractedImages.length > 0 && Array.isArray(structuredDoc.sections)) {
                            let imgIdx = 0;
                            structuredDoc.sections.forEach((sec) => {
                                if (sec.content) {
                                    // Replace placeholder tags like {{IMAGE_FIGURE_1}}
                                    const placeholderRegex = /\{\{IMAGE_FIGURE_\d+\}\}|\{\{IMAGE_PLACEHOLDER[_\d]*\}\}/g;
                                    if (placeholderRegex.test(sec.content) && imgIdx < extractedImages.length) {
                                        sec.content = sec.content.replace(placeholderRegex, () => {
                                            if (imgIdx < extractedImages.length) {
                                                const img = extractedImages[imgIdx++];
                                                return `<img src="${img.dataUrl}" alt="${img.name}" style="max-width: 100%; border-radius: 8px; border: 1px solid #cbd5e1; box-shadow: 0 2px 8px rgba(0,0,0,0.08); margin: 12px 0;" />`;
                                            }
                                            return '';
                                        });
                                    }
                                }
                            });

                            // If there are still images not placed, and a section mentions "Figure" or "Report"
                            if (imgIdx < extractedImages.length) {
                                structuredDoc.sections.forEach((sec) => {
                                    if (imgIdx < extractedImages.length) {
                                        const secText = ((sec.section_title || '') + ' ' + (sec.content || '')).toLowerCase();
                                        if (secText.includes('figure') || secText.includes('sample report') || secText.includes('valuation report') || secText.includes('matrix')) {
                                            const img = extractedImages[imgIdx++];
                                            sec.content += `\n<div style="margin: 18px 0; text-align: center;"><img src="${img.dataUrl}" alt="${img.name}" style="max-width: 100%; border-radius: 8px; border: 1px solid #cbd5e1; box-shadow: 0 2px 8px rgba(0,0,0,0.08);" /><p style="font-size: 12px; color: #64748b; margin-top: 6px; font-style: italic;">${img.name || 'Extracted Figure'}</p></div>`;
                                        }
                                    }
                                });
                            }
                        }

                        resolve(structuredDoc);
                    } catch (parseErr) {
                        console.error('Failed to parse Groq response JSON:', parseErr, data);
                        reject(new Error(`AI response was not valid JSON: ${parseErr.message}`));
                    }
                });
            }
        );

        req.on('error', (err) => {
            console.error('Groq request network error:', err);
            reject(new Error(`Network error calling AI engine: ${err.message}`));
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('AI transformation timed out after 90 seconds'));
        });

        req.write(requestBody);
        req.end();
    });
};

module.exports = {
    extractRawTextFromFile,
    transformTextWithTemplate,
};
