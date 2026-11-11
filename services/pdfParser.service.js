const { PDFParse } = require('pdf-parse');


function cleanLine(line) {
  if (!line) return '';
  return line.replace(/\r/g, '').trim();
}

// Filter out common PDF headers, footers, and page counters
function isPageArtifact(line) {
  if (!line) return true;
  if (/^page\s+\d+(\s+of\s+\d+)?$/i.test(line)) return true;
  if (/^--\s*\d+\s*(of\s*\d+\s*)?--$/i.test(line)) return true;
  if (/^\d+\s*\/\s*\d+$/.test(line)) return true;
  return false;
}

/**
 * Detect if a line is a Heading and determine its level and parts
 */
function detectHeading(line) {
  if (!line || line.length > 120) return null;

  // 1. Numbered Heading (e.g. 1.0 Executive Summary, 1.1 Scope, 1.1.1 Details, 1. Introduction)
  const numMatch = line.match(/^(\d+(?:\.\d+)*)[:\.\-\s]\s*(.+)$/);
  if (numMatch) {
    const num = numMatch[1];
    const text = numMatch[2].trim();
    if (/^[A-Za-z]/.test(text)) {
      const parts = num.split('.');
      if (parts.length === 1 || (parts.length === 2 && parts[1] === '0')) {
        return {
          level: 1,
          number: num,
          title: `${num} ${text}`,
          rawTitle: text,
        };
      } else if (parts.length === 2) {
        return {
          level: 2,
          number: num,
          title: `${num} ${text}`,
          rawTitle: text,
        };
      } else {
        return {
          level: 3,
          number: num,
          title: `${num} ${text}`,
          rawTitle: text,
        };
      }
    }
  }

  // 2. Section/Part/Chapter Prefix (e.g. Section 1: Overview, Part A: Policy)
  const secMatch = line.match(/^(SECTION|PART|CHAPTER|ARTICLE)\s+([0-9A-ZIVX]+)[:\.\-\s]+(.+)$/i);
  if (secMatch) {
    return {
      level: 1,
      number: `${secMatch[1]} ${secMatch[2]}`,
      title: `${secMatch[1]} ${secMatch[2]}: ${secMatch[3].trim()}`,
      rawTitle: secMatch[3].trim(),
    };
  }

  // 3. Markdown Style Headings (# Heading 1, ## Heading 2)
  const mdMatch = line.match(/^(#{1,4})\s+(.+)$/);
  if (mdMatch) {
    return {
      level: mdMatch[1].length,
      number: null,
      title: mdMatch[2].trim(),
      rawTitle: mdMatch[2].trim(),
    };
  }

  // 4. ALL-CAPS Titles (under 70 chars, not a sentence ending in period)
  if (
    line.length >= 4 &&
    line.length <= 70 &&
    /^[A-Z0-9\s\/\-_&,()]+$/.test(line) &&
    !/[\.,;:]$/.test(line) &&
    !isPageArtifact(line)
  ) {
    if (/[A-Z]{3,}/.test(line)) {
      return {
        level: 1,
        number: null,
        title: line,
        rawTitle: line,
      };
    }
  }

  return null;
}

/**
 * Format a list of paragraphs into a TipTap / ProseMirror compatible JSON document
 */
function buildTipTapDocument(title, level, paragraphs) {
  const content = [];

  if (title) {
    content.push({
      type: 'heading',
      attrs: { level: Math.min(Math.max(level || 1, 1), 6) },
      content: [{ type: 'text', text: title }],
    });
  }

  for (const p of paragraphs) {
    const trimmed = p.trim();
    if (!trimmed) continue;

    if (/^[•\-\*]\s+/.test(trimmed)) {
      content.push({
        type: 'paragraph',
        content: [{ type: 'text', text: trimmed }],
      });
    } else {
      content.push({
        type: 'paragraph',
        content: [{ type: 'text', text: trimmed }],
      });
    }
  }

  if (content.length === 0) {
    content.push({
      type: 'paragraph',
      content: [{ type: 'text', text: '' }],
    });
  }

  return { type: 'doc', content };
}

/**
 * Extract raw pages and metadata from a PDF buffer using pdf-parse
 */
async function extractPdfPages(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    await parser.load();
    const textData = await parser.getText();
    const infoData = await parser.getInfo().catch(() => null);

    const totalPages = textData.total || (infoData && infoData.total) || textData.pages?.length || 1;
    const pages = (textData.pages || []).map((p, idx) => ({
      pageNumber: p.num || idx + 1,
      text: p.text || '',
    }));

    return {
      totalPages,
      pages,
      rawText: textData.text || '',
      metadata: infoData?.info || {},
    };
  } finally {
    await parser.destroy().catch(() => {});
  }
}

/**
 * Parse an uploaded PDF buffer into a structured document hierarchy with TipTap JSON.
 * @param {Buffer} buffer - PDF binary buffer
 * @param {string} fileName - Original uploaded file name
 * @returns {Promise<object>} Structured document hierarchy ready for TipTap
 */
async function parsePdfToDocumentStructure(buffer, fileName = 'document.pdf') {
  const { totalPages, pages, metadata } = await extractPdfPages(buffer);
  const fileNameBase = fileName.replace(/\.[^/.]+$/, '');

  const sections = [];
  let currentSection = null;
  let currentSubsection = null;
  let currentParagraphLines = [];

  const flushParagraph = () => {
    if (currentParagraphLines.length === 0) return;
    const text = currentParagraphLines.join(' ').replace(/\s+/g, ' ').trim();
    currentParagraphLines = [];
    if (!text) return;

    if (currentSubsection) {
      currentSubsection.paragraphs.push(text);
    } else if (currentSection) {
      currentSection.paragraphs.push(text);
    } else {
      currentSection = {
        title: `${fileNameBase} - Overview`,
        section_number: '0.0',
        order: 0,
        page_start: 1,
        page_end: 1,
        paragraphs: [text],
        subsections: [],
      };
      sections.push(currentSection);
    }
  };

  for (const page of pages) {
    const pageNum = page.pageNumber;
    const lines = page.text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = cleanLine(lines[i]);
      if (!line) {
        flushParagraph();
        continue;
      }

      if (isPageArtifact(line)) continue;

      const heading = detectHeading(line);
      if (heading) {
        flushParagraph();

        if (heading.level === 1) {
          currentSubsection = null;
          currentSection = {
            title: heading.title,
            section_number: heading.number,
            order: sections.length,
            page_start: pageNum,
            page_end: pageNum,
            paragraphs: [],
            subsections: [],
          };
          sections.push(currentSection);
        } else {
          if (!currentSection) {
            currentSection = {
              title: `${fileNameBase} - Section 1`,
              section_number: '1.0',
              order: sections.length,
              page_start: pageNum,
              page_end: pageNum,
              paragraphs: [],
              subsections: [],
            };
            sections.push(currentSection);
          }

          currentSubsection = {
            title: heading.title,
            section_number: heading.number,
            order: currentSection.subsections.length,
            page_start: pageNum,
            page_end: pageNum,
            paragraphs: [],
          };
          currentSection.subsections.push(currentSubsection);
        }
      } else {
        currentParagraphLines.push(line);
        if (currentSubsection) {
          currentSubsection.page_end = Math.max(currentSubsection.page_end, pageNum);
        }
        if (currentSection) {
          currentSection.page_end = Math.max(currentSection.page_end, pageNum);
        }
      }
    }

    flushParagraph();
  }

  if (sections.length === 0) {
    for (const page of pages) {
      const pageText = page.text.replace(/\r/g, '').trim();
      const paras = pageText
        .split(/\n\s*\n/)
        .map((p) => p.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim())
        .filter((p) => p && !isPageArtifact(p));

      sections.push({
        title: `${fileNameBase} - Page ${page.pageNumber}`,
        section_number: `${page.pageNumber}.0`,
        order: sections.length,
        page_start: page.pageNumber,
        page_end: page.pageNumber,
        paragraphs: paras.length > 0 ? paras : ['[Empty Page Content]'],
        subsections: [],
      });
    }
  }

  const materializedSections = sections.map((sec, idx) => {
    const content = buildTipTapDocument(sec.title, 1, sec.paragraphs);
    const subsections = (sec.subsections || []).map((sub, subIdx) => ({
      title: sub.title,
      section_number: sub.section_number,
      order: subIdx,
      page_start: sub.page_start,
      page_end: sub.page_end,
      content: buildTipTapDocument(sub.title, 2, sub.paragraphs),
      subsections: [],
    }));

    return {
      title: sec.title,
      section_number: sec.section_number || `${idx + 1}.0`,
      order: idx,
      page_start: sec.page_start,
      page_end: sec.page_end,
      content,
      subsections,
    };
  });

  return {
    source_file: fileName,
    total_pages_detected: totalPages,
    metadata,
    sections: materializedSections,
  };
}

module.exports = {
  extractPdfPages,
  parsePdfToDocumentStructure,
};
