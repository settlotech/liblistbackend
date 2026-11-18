const https = require('https');
const zlib = require('zlib');
const mammoth = require('mammoth');
require('dotenv').config();

const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.GROK_API;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function decodeXmlEntities(str) {
    return String(str || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function extractXmlElements(xml, tagName) {
    const results = [];
    if (!xml) return results;
    const openRe = new RegExp(`<${tagName}(?:[\\s>/])`, 'g');
    const closeToken = `</${tagName}>`;
    let searchFrom = 0;

    while (searchFrom < xml.length) {
        openRe.lastIndex = searchFrom;
        const m = openRe.exec(xml);
        if (!m) break;
        const start = m.index;
        const openEnd = xml.indexOf('>', start);
        if (openEnd < 0) break;
        if (xml[openEnd - 1] === '/') {
            results.push(xml.slice(start, openEnd + 1));
            searchFrom = openEnd + 1;
            continue;
        }

        let depth = 1;
        let cursor = openEnd + 1;
        const nextOpenRe = new RegExp(`<${tagName}(?:[\\s>/])`, 'g');
        while (depth > 0 && cursor < xml.length) {
            nextOpenRe.lastIndex = cursor;
            const nextOpen = nextOpenRe.exec(xml);
            const nextCloseIdx = xml.indexOf(closeToken, cursor);
            if (nextCloseIdx < 0) {
                cursor = xml.length;
                break;
            }
            if (nextOpen && nextOpen.index < nextCloseIdx) {
                const tagEnd = xml.indexOf('>', nextOpen.index);
                if (tagEnd >= 0 && xml[tagEnd - 1] === '/') {
                    cursor = tagEnd + 1;
                } else {
                    depth++;
                    cursor = (tagEnd >= 0 ? tagEnd : nextOpen.index) + 1;
                }
            } else {
                depth--;
                cursor = nextCloseIdx + closeToken.length;
            }
        }
        results.push(xml.slice(start, cursor));
        searchFrom = cursor;
    }
    return results;
}

function scanTopLevelWordBodyElements(xml) {
    const bodyMatch = xml.match(/<w:body(?:\s[^>]*)?>([\s\S]*)<\/w:body>/);
    const inner = bodyMatch ? bodyMatch[1] : xml;
    const blocks = [];
    let cursor = 0;
    const tokenRe = /<(w:p|w:tbl|w:sdt)(?=[\s>/])/g;

    while (cursor < inner.length) {
        tokenRe.lastIndex = cursor;
        const match = tokenRe.exec(inner);
        if (!match) break;
        const tag = match[1];
        const start = match.index;
        const extracted = extractXmlElements(inner.slice(start), tag);
        if (extracted.length === 0) {
            cursor = start + 1;
            continue;
        }
        const rawBlock = extracted[0];
        if (tag === 'w:sdt') {
            const sdtMatch = rawBlock.match(/<w:sdtContent(?:\s[^>]*)?>([\s\S]*)<\/w:sdtContent>/);
            if (sdtMatch) {
                blocks.push(...scanTopLevelWordBodyElements(`<w:body>${sdtMatch[1]}</w:body>`));
            }
        } else {
            blocks.push({ tag, xml: rawBlock });
        }
        cursor = start + rawBlock.length;
    }
    return blocks;
}

function buildHtmlTableFrom2DArray(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return '';
    let rowsHtml = '';
    rows.forEach((row, rIdx) => {
        if (!Array.isArray(row) || row.length === 0) return;
        const cellTag = rIdx === 0 ? 'th' : 'td';
        const cellsHtml = row
            .map((cellVal) => `<${cellTag}><p>${escapeHtml(String(cellVal || '').trim())}</p></${cellTag}>`)
            .join('');
        rowsHtml += `<tr>${cellsHtml}</tr>`;
    });
    return rowsHtml ? `<table><tbody>${rowsHtml}</tbody></table>` : '';
}

function parseDocxOrdered(buffer) {
    const files = {};
    let eocd = -1;
    for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
        if (buffer.readUInt32LE(i) === 0x06054b50) {
            eocd = i;
            break;
        }
    }
    if (eocd < 0) return null;

    const cdOffset = buffer.readUInt32LE(eocd + 16);
    const cdCount = buffer.readUInt16LE(eocd + 10);
    let cur = cdOffset;

    for (let i = 0; i < cdCount && cur < buffer.length - 46; i++) {
        if (buffer.readUInt32LE(cur) !== 0x02014b50) break;
        const compMethod = buffer.readUInt16LE(cur + 10);
        const compSize = buffer.readUInt32LE(cur + 20);
        const nameLen = buffer.readUInt16LE(cur + 28);
        const extraLen = buffer.readUInt16LE(cur + 30);
        const commentLen = buffer.readUInt16LE(cur + 32);
        const localOffset = buffer.readUInt32LE(cur + 42);

        if (cur + 46 + nameLen <= buffer.length) {
            const name = buffer.toString('utf8', cur + 46, cur + 46 + nameLen);
            if (localOffset + 30 <= buffer.length && buffer.readUInt32LE(localOffset) === 0x04034b50) {
                const localNameLen = buffer.readUInt16LE(localOffset + 26);
                const localExtraLen = buffer.readUInt16LE(localOffset + 28);
                const dataStart = localOffset + 30 + localNameLen + localExtraLen;
                if (compSize > 0 && dataStart + compSize <= buffer.length) {
                    const compData = buffer.subarray(dataStart, dataStart + compSize);
                    let data = null;
                    try {
                        if (compMethod === 0) data = compData;
                        else if (compMethod === 8) data = zlib.inflateRawSync(compData);
                    } catch (_) {}
                    if (data) files[name] = data;
                }
            }
        }
        cur += 46 + nameLen + extraLen + commentLen;
    }

    const numberingTypes = {};
    if (files['word/numbering.xml']) {
        const numXml = files['word/numbering.xml'].toString('utf8');
        const abstractFmt = {};
        const absBlocks = extractXmlElements(numXml, 'w:abstractNum');
        absBlocks.forEach((absXml) => {
            const absIdMatch = absXml.match(/\bw:abstractNumId=["'](\d+)["']/);
            if (!absIdMatch) return;
            const fmtMatch = absXml.match(/<w:numFmt\b[^>]*w:val=["']([^"']+)["']/);
            abstractFmt[absIdMatch[1]] = fmtMatch ? fmtMatch[1] : 'bullet';
        });
        const numBlocks = extractXmlElements(numXml, 'w:num');
        numBlocks.forEach((numBlock) => {
            const numIdMatch = numBlock.match(/\bw:numId=["'](\d+)["']/);
            const absRefMatch = numBlock.match(/<w:abstractNumId\b[^>]*w:val=["'](\d+)["']/);
            if (numIdMatch && absRefMatch) {
                const fmt = (abstractFmt[absRefMatch[1]] || 'bullet').toLowerCase();
                numberingTypes[numIdMatch[1]] = (fmt === 'bullet' || fmt === 'none') ? 'bullet' : 'ordered';
            }
        });
    }

    const mediaByEntry = {};
    for (const [name, data] of Object.entries(files)) {
        if (!name.startsWith('word/media/')) continue;
        const ext = name.split('.').pop().toLowerCase();
        const mime =
            ext === 'png' ? 'image/png' :
            (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' :
            ext === 'gif' ? 'image/gif' :
            ext === 'webp' ? 'image/webp' :
            ext === 'svg' ? 'image/svg+xml' :
            'application/octet-stream';
        mediaByEntry[name] = {
            entryName: name,
            name: name.replace('word/media/', ''),
            dataUrl: `data:${mime};base64,${data.toString('base64')}`,
        };
    }

    const relsMap = {};
    if (files['word/_rels/document.xml.rels']) {
        const relsXml = files['word/_rels/document.xml.rels'].toString('utf8');
        const relTagRe = /<Relationship\b([^>]+)\/?>/g;
        let rm;
        while ((rm = relTagRe.exec(relsXml)) !== null) {
            const attrs = rm[1];
            const idMatch = attrs.match(/\bId=["']([^"']+)["']/);
            const targetMatch = attrs.match(/\bTarget=["']([^"']+)["']/);
            if (idMatch && targetMatch) {
                const norm = targetMatch[1].replace(/^\/+/, '').replace(/^\.\.\//, '');
                relsMap[idMatch[1]] = norm.startsWith('word/') ? norm : `word/${norm}`;
            }
        }
    }

    const images = [];
    const tables = [];
    const placedMediaEntries = new Set();

    const registerMediaKey = (entryKey) => {
        const media = mediaByEntry[entryKey];
        if (!media) return null;
        placedMediaEntries.add(entryKey);
        const index = images.length;
        const token = `[[DOC_IMG_${index}]]`;
        images.push({ ...media, index, token });
        return token;
    };

    const detectParagraphMeta = (pXml) => {
        const pPrMatch = pXml.match(/<w:pPr\b[^>]*>([\s\S]*?)<\/w:pPr>/);
        const pPr = pPrMatch ? pPrMatch[1] : '';
        const styleMatch = pPr.match(/<w:pStyle\b[^>]*w:val=["']([^"']+)["']/i);
        const styleVal = styleMatch ? styleMatch[1] : '';
        const lowerStyle = styleVal.toLowerCase();

        let headingLevel = 0;
        if (/^title$/i.test(lowerStyle)) headingLevel = 1;
        else if (/^subtitle$/i.test(lowerStyle)) headingLevel = 2;
        else {
            const hMatch = lowerStyle.match(/heading\s*(\d+)/);
            if (hMatch) headingLevel = Math.min(4, Math.max(1, Number(hMatch[1])));
        }

        let listType = null;
        let listLevel = 0;
        const numPrMatch = pPr.match(/<w:numPr\b[^>]*>([\s\S]*?)<\/w:numPr>/);
        if (numPrMatch) {
            const numPrXml = numPrMatch[1];
            const numIdMatch = numPrXml.match(/<w:numId\b[^>]*w:val=["'](\d+)["']/);
            const ilvlMatch = numPrXml.match(/<w:ilvl\b[^>]*w:val=["'](\d+)["']/);
            if (!numIdMatch || numIdMatch[1] !== '0') {
                listType = (numIdMatch && numberingTypes[numIdMatch[1]]) || 'bullet';
                listLevel = ilvlMatch ? Math.min(3, Number(ilvlMatch[1]) || 0) : 0;
            }
        } else if (lowerStyle.includes('listbullet')) {
            listType = 'bullet';
        } else if (lowerStyle.includes('listnumber')) {
            listType = 'ordered';
        } else if (lowerStyle.includes('listparagraph')) {
            listType = 'bullet';
        }

        return { headingLevel, listType, listLevel };
    };

    const extractParaTextAndImageTokens = (pXml) => {
        // Strip VML/Drawing duplicate fallback blocks so AlternateContent does not double-count text or images
        const cleanParaXml = pXml.replace(/<mc:Fallback\b[^>]*>[\s\S]*?<\/mc:Fallback>/g, '');
        const text = (cleanParaXml.match(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g) || [])
            .map((t) => decodeXmlEntities(t.replace(/<[^>]+>/g, '')))
            .join('')
            .replace(/\s+/g, ' ')
            .trim();
        const imgTokens = [];
        const relIdRe = /(?:r:embed|r:id)=["']([^"']+)["']/g;
        let im;
        while ((im = relIdRe.exec(cleanParaXml)) !== null) {
            const targetEntry = relsMap[im[1]];
            if (targetEntry && mediaByEntry[targetEntry]) {
                const tok = registerMediaKey(targetEntry);
                if (tok) imgTokens.push(tok);
            }
        }
        return { text, imgTokens, ...detectParagraphMeta(cleanParaXml) };
    };

    const bodyBlocks = [];
    if (files['word/document.xml']) {
        const xml = files['word/document.xml'].toString('utf8');
        const topElements = scanTopLevelWordBodyElements(xml);
        let orderedCounter = 0;

        for (const block of topElements) {
            if (block.tag === 'w:p') {
                const { text, imgTokens, headingLevel, listType, listLevel } = extractParaTextAndImageTokens(block.xml);
                if (text) {
                    if (headingLevel > 0) {
                        orderedCounter = 0;
                        bodyBlocks.push(`${'#'.repeat(headingLevel)} ${text}`);
                    } else if (listType === 'ordered') {
                        orderedCounter += 1;
                        const indent = '  '.repeat(listLevel);
                        const cleaned = text.replace(/^\d+[.)]\s*/, '');
                        bodyBlocks.push(`${indent}${orderedCounter}. ${cleaned}`);
                    } else if (listType === 'bullet') {
                        orderedCounter = 0;
                        const indent = '  '.repeat(listLevel);
                        const cleaned = text.replace(/^[•●○▪▫–-]\s*/, '');
                        bodyBlocks.push(`${indent}- ${cleaned}`);
                    } else {
                        orderedCounter = 0;
                        bodyBlocks.push(text);
                    }
                } else if (!imgTokens.length) {
                    orderedCounter = 0;
                }
                imgTokens.forEach((tok) => bodyBlocks.push(tok));
            } else if (block.tag === 'w:tbl') {
                orderedCounter = 0;
                const trList = extractXmlElements(block.xml, 'w:tr');
                let rowsHtml = '';
                const previewRows = [];

                trList.forEach((trXml, rIdx) => {
                    const isHeaderRow = rIdx === 0 || /<w:tblHeader\b/.test(trXml);
                    const cellTag = isHeaderRow ? 'th' : 'td';
                    const tcList = extractXmlElements(trXml, 'w:tc');
                    let rowHtml = '';
                    const rowPreviewCells = [];

                    tcList.forEach((tcXml) => {
                        const spanMatch = tcXml.match(/<w:gridSpan\b[^>]*w:val=["'](\d+)["']/);
                        const colspan = spanMatch ? Math.max(1, Number(spanMatch[1]) || 1) : 1;
                        const innerParas = extractXmlElements(tcXml, 'w:p');
                        const cellParts = [];
                        let activeListTag = null;
                        const flushList = () => {
                            if (activeListTag) {
                                cellParts.push(`</${activeListTag}>`);
                                activeListTag = null;
                            }
                        };

                        innerParas.forEach((ip) => {
                            const res = extractParaTextAndImageTokens(ip);
                            if (res.text) {
                                rowPreviewCells.push(res.text);
                                if (res.listType && !isHeaderRow) {
                                    const tag = res.listType === 'ordered' ? 'ol' : 'ul';
                                    if (activeListTag !== tag) {
                                        flushList();
                                        activeListTag = tag;
                                        cellParts.push(`<${tag}>`);
                                    }
                                    const cleaned = res.text.replace(/^(?:[•●○▪▫–-]|\d+[.)])\s*/, '');
                                    cellParts.push(`<li><p>${escapeHtml(cleaned)}</p></li>`);
                                } else {
                                    flushList();
                                    cellParts.push(`<p>${escapeHtml(res.text)}</p>`);
                                }
                            }
                            res.imgTokens.forEach((tok) => {
                                flushList();
                                const idxNum = Number(tok.replace(/[^\d]/g, ''));
                                const imgObj = images[idxNum];
                                if (imgObj?.dataUrl) {
                                    cellParts.push(`<p><img src="${imgObj.dataUrl}" alt="${escapeHtml(imgObj.name || 'Table media')}" style="max-width: 100%; border-radius: 6px;" /></p>`);
                                }
                            });
                        });
                        flushList();

                        const innerHtml = cellParts.length > 0 ? cellParts.join('') : '<p></p>';
                        rowHtml += `<${cellTag}${colspan > 1 ? ` colspan="${colspan}"` : ''}>${innerHtml}</${cellTag}>`;
                    });
                    if (rowPreviewCells.length > 0 && previewRows.length < 1) {
                        previewRows.push(rowPreviewCells.join(' | ').slice(0, 90));
                    }
                    if (rowHtml) rowsHtml += `<tr>${rowHtml}</tr>`;
                });
                if (rowsHtml) {
                    const index = tables.length;
                    const token = `[[DOC_TABLE_${index}]]`;
                    const previewSummary = previewRows.join(' ; ').replace(/[\[\]]/g, '').slice(0, 90);
                    tables.push({
                        index,
                        token,
                        preview: previewSummary,
                        html: `<table class='editor-table' style='width: 100%; border-collapse: collapse; margin: 16px 0;'><tbody>${rowsHtml}</tbody></table>`,
                    });
                    bodyBlocks.push(previewSummary ? `${token} [Table summary: ${previewSummary}]` : token);
                }
            }
        }
    }

    for (const [entryName] of Object.entries(mediaByEntry)) {
        if (!placedMediaEntries.has(entryName)) {
            const tok = registerMediaKey(entryName);
            if (tok) bodyBlocks.push(tok);
        }
    }

    return { text: bodyBlocks.join('\n\n'), images, tables };
}

const extractRawTextFromFile = async (buffer, mimeType, originalName = '') => {
    const lowerName = (originalName || '').toLowerCase();

    if (mimeType === 'application/pdf' || lowerName.endsWith('.pdf')) {
        try {
            const { PDFParse } = require('pdf-parse');
            const parser = new PDFParse({ data: buffer });
            await parser.load();
            const [textResult, tableResult, imgResult] = await Promise.all([
                parser.getText().catch(() => null),
                typeof parser.getTable === 'function' ? parser.getTable().catch(() => null) : Promise.resolve(null),
                typeof parser.getImage === 'function'
                    ? parser.getImage({ imageDataUrl: true, imageThreshold: 32 }).catch(() => null)
                    : Promise.resolve(null),
            ]);

            const extractedTables = [];
            const tablesByPage = new Map();
            if (tableResult && Array.isArray(tableResult.pages)) {
                tableResult.pages.forEach((pg) => {
                    const pgNum = Number(pg.num) || 0;
                    (pg.tables || []).forEach((tblArray) => {
                        const html = buildHtmlTableFrom2DArray(tblArray);
                        if (!html) return;
                        const index = extractedTables.length;
                        const token = `[[DOC_TABLE_${index}]]`;
                        const entry = { index, token, html, pageNumber: pgNum };
                        extractedTables.push(entry);
                        if (!tablesByPage.has(pgNum)) tablesByPage.set(pgNum, []);
                        tablesByPage.get(pgNum).push(entry);
                    });
                });
            }

            const extractedImages = [];
            const imagesByPage = new Map();
            const seenDataUrls = new Set();
            if (imgResult && Array.isArray(imgResult.pages)) {
                imgResult.pages.forEach((p) => {
                    const pgNum = Number(p.pageNumber) || 0;
                    if (Array.isArray(p.images)) {
                        p.images.forEach((img, idx) => {
                            if (extractedImages.length >= 24) return;
                            if (!img.dataUrl || seenDataUrls.has(img.dataUrl)) return;
                            if (img.width > 20 || img.height > 20) {
                                seenDataUrls.add(img.dataUrl);
                                const index = extractedImages.length;
                                const token = `[[DOC_IMG_${index}]]`;
                                const entry = {
                                    index,
                                    token,
                                    page: pgNum,
                                    name: img.name || `Figure_Page${pgNum || 1}_${idx + 1}`,
                                    dataUrl: img.dataUrl,
                                    width: img.width,
                                    height: img.height,
                                };
                                extractedImages.push(entry);
                                if (!imagesByPage.has(pgNum)) imagesByPage.set(pgNum, []);
                                imagesByPage.get(pgNum).push(entry);
                            }
                        });
                    }
                });
            }

            let combinedText = '';
            if (textResult && Array.isArray(textResult.pages) && textResult.pages.length > 0) {
                const pageBlocks = [];
                textResult.pages.forEach((pg) => {
                    const pgNum = Number(pg.num) || 0;
                    const pgText = String(pg.text || '').trim();
                    if (pgText) pageBlocks.push(pgText);
                    (tablesByPage.get(pgNum) || []).forEach((t) => pageBlocks.push(t.token));
                    (imagesByPage.get(pgNum) || []).forEach((im) => pageBlocks.push(im.token));
                });
                combinedText = pageBlocks.join('\n\n');
            } else {
                combinedText = [
                    String(textResult?.text || '').trim(),
                    ...extractedTables.map((t) => t.token),
                    ...extractedImages.map((im) => im.token),
                ].filter(Boolean).join('\n\n');
            }

            await parser.destroy().catch(() => {});
            return {
                text: combinedText,
                html: null,
                images: extractedImages,
                tables: extractedTables,
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
            const orderedDocx = parseDocxOrdered(buffer);
            if (orderedDocx && (orderedDocx.text.trim().length > 0 || orderedDocx.tables.length > 0 || orderedDocx.images.length > 0)) {
                return {
                    text: orderedDocx.text,
                    html: null,
                    images: orderedDocx.images,
                    tables: orderedDocx.tables,
                    source_type: 'docx',
                };
            }

            const isZip = buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b;
            if (isZip) {
                let extractedImages = [];
                const textResult = await mammoth.extractRawText({ buffer });
                const htmlResult = await mammoth.convertToHtml(
                    { buffer },
                    {
                        convertImage: mammoth.images.imgElement((image) => {
                            return image.read('base64').then((imageBuffer) => {
                                const dataUrl = `data:${image.contentType};base64,${imageBuffer}`;
                                const index = extractedImages.length;
                                extractedImages.push({
                                    index,
                                    token: `[[DOC_IMG_${index}]]`,
                                    name: `Embedded_Figure_${index + 1}`,
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
                    tables: [],
                    source_type: 'docx',
                };
            }

            // Legacy non-ZIP Word / RTF / HTML-as-doc / plain text fallback
            const headLatin1 = buffer.subarray(0, Math.min(2048, buffer.length)).toString('latin1');
            let fallbackText = '';
            if (headLatin1.trimStart().startsWith('{\\rtf')) {
                fallbackText = buffer
                    .toString('latin1')
                    .replace(/\\par[d]?/g, '\n')
                    .replace(/\\line/g, '\n')
                    .replace(/\\tab/g, ' ')
                    .replace(/\\'[0-9a-fA-F]{2}/g, ' ')
                    .replace(/\{\\\*[^}]*\}/g, ' ')
                    .replace(/\\[a-zA-Z]+-?\d* ?/g, '')
                    .replace(/[{}]/g, '')
                    .replace(/\n{3,}/g, '\n\n')
                    .trim();
            } else if (/<(?:html|body|p|table|div)\b/i.test(headLatin1)) {
                fallbackText = buffer
                    .toString('utf8')
                    .replace(/<(?:script|style)[^>]*>[\s\S]*?<\/(?:script|style)>/gi, ' ')
                    .replace(/<\/(?:p|div|tr|li|h[1-6])>/gi, '\n')
                    .replace(/<br\s*\/?>/gi, '\n')
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/&nbsp;/gi, ' ')
                    .replace(/&amp;/gi, '&')
                    .replace(/&lt;/gi, '<')
                    .replace(/&gt;/gi, '>')
                    .replace(/[ \t]+\n/g, '\n')
                    .replace(/\n{3,}/g, '\n\n')
                    .trim();
            } else {
                // Binary OLE2 .doc or UTF-16LE/ASCII stream extraction
                const utf16Runs = buffer.toString('utf16le').match(/[\x20-\x7E\r\n\t]{16,}/g) || [];
                const asciiRuns = buffer.toString('latin1').match(/[\x20-\x7E\r\n\t]{16,}/g) || [];
                const candidates = (utf16Runs.join(' ').length > asciiRuns.join(' ').length ? utf16Runs : asciiRuns)
                    .map((s) => s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ' ').replace(/\s+/g, ' ').trim())
                    .filter((s) => !/^(?:Microsoft|WordDocument|SummaryInformation|Root Entry|Normal\.dotm|Times New Roman|Calibri|Arial|Cambria|HYPERLINK)/i.test(s));
                fallbackText = candidates.join('\n\n');
            }

            if (!fallbackText || fallbackText.length < 15) {
                throw new Error('Unsupported or empty legacy Word file. Please save as .docx or .pdf and retry.');
            }
            return {
                text: fallbackText,
                html: null,
                images: [],
                tables: [],
                source_type: 'doc',
            };
        } catch (docErr) {
            console.error('Word document parsing error:', docErr);
            throw new Error(`Failed to parse Word document: ${docErr.message}`);
        }
    }

    return {
        text: buffer.toString('utf-8'),
        html: null,
        images: [],
        tables: [],
        source_type: 'text',
    };
};

function extractPlainTextFromTipTap(node) {
    if (!node) return '';
    if (typeof node === 'string') return node.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (Array.isArray(node)) return node.map(extractPlainTextFromTipTap).filter(Boolean).join(' ');
    if (typeof node === 'object') {
        if (typeof node.text === 'string') return node.text;
        if (Array.isArray(node.content)) {
            return node.content.map(extractPlainTextFromTipTap).filter(Boolean).join(' ');
        }
    }
    return '';
}

function resolveTemplateSections(template) {
    const rawSections =
        (Array.isArray(template?.structure?.sections) && template.structure.sections.length > 0
            ? template.structure.sections
            : null) ||
        (Array.isArray(template?.structure_schema?.sections) && template.structure_schema.sections.length > 0
            ? template.structure_schema.sections
            : null);

    if (!rawSections) {
        return [
            { title: '1. Summary', order: 0, description: 'Mandatory Summary: gist of policy, applicability, max 3 paragraphs + key bullets.' },
            { title: '2. Details', order: 1, description: 'Mandatory Details: subsections, operational text, tables, matrices, and images.' },
            { title: '3. Scope', order: 2, description: 'Mandatory Scope: functional areas, departments, and applicability.' },
            { title: '4. Controls', order: 3, description: 'Optional Controls: control monitoring steps and checkpoints (or "No control steps defined").' },
            { title: '5. Dependencies', order: 4, description: 'Optional Dependencies: prerequisite requirements, cross-references, and regulatory citations.' },
            { title: '6. Reports', order: 5, description: 'Optional Reports: mapped compliance reports or associated report IDs.' },
        ];
    }

    return rawSections
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((s, idx) => ({
            title: s.title || s.section_title || `Section ${idx + 1}`,
            order: idx,
            description: s.description || extractPlainTextFromTipTap(s.content) || '',
        }));
}

function injectTablesAndImages(structuredDoc, extractedImages = [], extractedTables = [], templateSections = null, useTemplate = true) {
    let sections = Array.isArray(structuredDoc?.sections) ? structuredDoc.sections : [];

    // Ensure every section defined by the database template exists in exact order & title
    if (useTemplate && Array.isArray(templateSections) && templateSections.length > 0) {
        const remaining = sections.slice();
        const aligned = [];

        templateSections.forEach((tplSec, idx) => {
            const normTpl = tplSec.title.toLowerCase().replace(/^\d+\.?\s*/, '').replace(/[^a-z0-9]/g, '');
            let matchIdx = remaining.findIndex((s) => {
                const normS = String(s.section_title || s.title || '').toLowerCase().replace(/^\d+\.?\s*/, '').replace(/[^a-z0-9]/g, '');
                return normS === normTpl || normS.includes(normTpl) || normTpl.includes(normS);
            });
            if (matchIdx < 0 && remaining.length > 0 && idx < sections.length && sections.length === templateSections.length) {
                matchIdx = 0;
            }
            if (matchIdx >= 0) {
                const matched = remaining.splice(matchIdx, 1)[0];
                aligned.push({
                    section_title: tplSec.title,
                    section_order: idx + 1,
                    content: matched.content || '<p>No content specified.</p>',
                });
            } else {
                const isControls = normTpl.includes('control');
                aligned.push({
                    section_title: tplSec.title,
                    section_order: idx + 1,
                    content: isControls
                        ? '<p>No control steps defined.</p>'
                        : `<p>${escapeHtml(tplSec.description || `${tplSec.title} — review and populate details if applicable.`)}</p>`,
                });
            }
        });

        // Any leftover AI sections that weren't matched append cleanly into Details (or unmapped)
        if (remaining.length > 0) {
            const detailsTarget = aligned.find((s) => s.section_title.toLowerCase().includes('detail')) || aligned[aligned.length - 1];
            remaining.forEach((extra) => {
                if (extra?.content && detailsTarget) {
                    detailsTarget.content += `\n<h3>${escapeHtml(extra.section_title || extra.title || 'Additional Clauses')}</h3>\n${extra.content}`;
                }
            });
        }
        sections = aligned;
    }

    const usedTables = new Set();
    const usedImages = new Set();

    sections.forEach((sec) => {
        if (!sec.content) return;
        let html = String(sec.content);

        // Strip leaked [Table summary: ...] helper hints if echoed by the model
        html = html.replace(/\s*\[Table summary:[^\]]*\]/gi, '');

        // Unwrap <p>[[DOC_TABLE_n]]</p> so <table> is never nested inside <p> (TipTap/ProseMirror requirement)
        html = html.replace(/<p[^>]*>\s*\[\[DOC_TABLE_(\d+)\]\]\s*<\/p>/gi, (_, idxStr) => {
            const tbl = extractedTables[Number(idxStr)];
            if (tbl?.html) {
                usedTables.add(Number(idxStr));
                return tbl.html;
            }
            return '';
        });

        // Replace any remaining inline [[DOC_TABLE_n]] tokens
        html = html.replace(/\[\[DOC_TABLE_(\d+)\]\]/g, (_, idxStr) => {
            const tbl = extractedTables[Number(idxStr)];
            if (tbl?.html) {
                usedTables.add(Number(idxStr));
                return tbl.html;
            }
            return '';
        });

        // Replace [[DOC_IMG_n]] or legacy {{IMAGE_FIGURE_n}} tokens with TipTap-native <img /> tags
        const replaceImageToken = (dIdx, fIdx) => {
            const targetIdx = dIdx !== undefined ? Number(dIdx) : (fIdx !== undefined ? Number(fIdx) - 1 : -1);
            const img = extractedImages[targetIdx] || extractedImages.find((__, i) => !usedImages.has(i));
            if (img?.dataUrl) {
                const actualIdx = extractedImages.indexOf(img);
                if (actualIdx >= 0) usedImages.add(actualIdx);
                return `<p><img src="${img.dataUrl}" alt="${escapeHtml(img.name || 'Extracted Figure')}" style="max-width: 100%; border-radius: 6px;" /></p>`;
            }
            return '';
        };

        html = html.replace(
            /<p[^>]*>\s*(?:\[\[DOC_IMG_(\d+)\]\]|\{\{IMAGE_FIGURE_(\d+)\}\}|\{\{IMAGE_PLACEHOLDER[_\d]*\}\})\s*<\/p>/gi,
            (_, dIdx, fIdx) => replaceImageToken(dIdx, fIdx)
        );
        html = html.replace(
            /\[\[DOC_IMG_(\d+)\]\]|\{\{IMAGE_FIGURE_(\d+)\}\}|\{\{IMAGE_PLACEHOLDER[_\d]*\}\}/g,
            (_, dIdx, fIdx) => replaceImageToken(dIdx, fIdx)
        );

        // Final cleanup pass so tables/figures are never trapped inside <p> wrappers
        html = html.replace(/<p[^>]*>\s*(<table[\s\S]*?<\/table>)\s*<\/p>/gi, '$1');
        sec.content = html;
    });

    // Place any remaining unplaced tables/images into Details (or last section) so nothing is dropped
    const detailsTarget =
        sections.find((s) => String(s.section_title || '').toLowerCase().includes('detail')) ||
        sections[sections.length - 1];

    if (detailsTarget) {
        extractedTables.forEach((tbl, idx) => {
            if (!usedTables.has(idx) && tbl?.html) {
                detailsTarget.content += `\n<h4>Extracted Schedule / Table ${idx + 1}</h4>\n${tbl.html}`;
            }
        });
        extractedImages.forEach((img, idx) => {
            if (!usedImages.has(idx) && img?.dataUrl) {
                detailsTarget.content += `\n<p><img src="${img.dataUrl}" alt="${escapeHtml(img.name || `Figure ${idx + 1}`)}" style="max-width: 100%; border-radius: 6px;" /></p>\n<p><em>${escapeHtml(img.name || `Figure ${idx + 1}`)}</em></p>`;
            }
        });
    }

    return { ...structuredDoc, sections };
}

const transformTextWithTemplate = async (rawText, template, useTemplate = true, extractedImages = [], extractedTables = []) => {
    if (!GROQ_API_KEY) {
        throw new Error('Groq API Key (GROQ_API_KEY or GROK_API) is not configured in backend .env');
    }

    let systemPrompt = '';
    let userPrompt = '';
    const templateSections = useTemplate ? resolveTemplateSections(template) : null;

    const formattingGuidelines = `
CRITICAL EXTRACTION REQUIREMENTS (PRESERVE ALL CONTENT, LISTS, TABLES, TOKENS & FIGURES):
1. PLACEHOLDER TOKENS (CRITICAL — KEEP IN EXACT READING POSITION):
   - Source text may contain tokens like [[DOC_TABLE_0]] [Table summary: ...] or [[DOC_IMG_0]]. KEEP the exact token [[DOC_TABLE_n]] or [[DOC_IMG_n]] on its OWN line OUTSIDE <p> tags (do NOT copy the [Table summary: ...] note — only use it to place the table into the right section!).
2. TABLES (MANDATORY HTML <table>):
   - Any tabular data or schedules not already represented by [[DOC_TABLE_n]] MUST be formatted as clean semantic HTML directly (not inside <p>):
     <table class='editor-table' style='width: 100%; border-collapse: collapse; margin: 16px 0;'>
       <tbody><tr style='background-color: #f1f5f9;'><th>Column</th></tr><tr><td>Cell</td></tr></tbody>
     </table>
3. LISTS & BULLET POINTS (MANDATORY HTML <ul> / <ol> — NEVER FLATTEN LISTS INTO <p>):
   - Convert ALL Markdown bullet lines (- , * , •) into valid <ul><li>...</li></ul> and ALL numbered items (1. , 2. ) into <ol><li>...</li></ol>.
   - Convert stakeholder lists, feature lists, prerequisites, controls, metrics, and multi-item requirements into proper <ul><li>...</li></ul> lists instead of separate plain <p> paragraphs!
4. HEADINGS:
   - Convert Markdown headings (# / ## / ### / ####) into <h3> / <h4> inside section bodies so document hierarchy is clear.
5. COMPLETENESS (NO SUMMARIZATION LOSS):
   - Extract ALL policy provisions, requirements, thresholds, criteria, exceptions, dependencies, controls, reports, and RACI roles completely into their matching template sections.
6. PAGINATION:
   - Do NOT output page-break elements or markers.
`;

    if (useTemplate && templateSections) {
        const templateName = template?.template_name || 'Template 1: Policy Document';
        const templateCategory = template?.category || 'Company Policies';
        const templateSchemaPrompt = JSON.stringify(templateSections, null, 2);

        systemPrompt = `You are an expert Banking Regulatory Compliance & Document Architecture AI for an Australian Financial Institution (APRA / ASIC regulated).
Your task is to ingest uploaded policy/document text and map it STRICTLY into EVERY section of the selected template below.

Selected Template: "${templateName}" (Category: ${templateCategory})
Target Template Sections (MUST return all ${templateSections.length} sections in exact order with these exact titles):
${templateSchemaPrompt}

${formattingGuidelines}

RULES:
1. Extract an authoritative "document_name", "document_type" ('policy'), and concise "description" (2-3 sentences executive summary).
2. Return ALL ${templateSections.length} target sections from "${templateName}" in exact order using the exact "title" values as "section_title". Follow each section's description rule (for example if a template specifies max 3 paragraphs for Summary, full details/tables/images in Details, or "No control steps defined" when optional Controls have none).
3. Write comprehensive HTML content (using <h3>, <h4>, <p>, <ul>, <li>, <ol>, <table>, <thead>, <tbody>, <tr>, <th>, <td>, <strong>). Keep any [[DOC_TABLE_n]] / [[DOC_IMG_n]] tokens in the relevant section.
4. Any clauses/appendices that genuinely do not fit the template sections go in "unmapped_content" (with id, title, content, suggested_section, reason).
5. Return ONLY valid JSON (use single-quoted HTML attributes inside JSON strings, no markdown code fences):
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
  "unmapped_content": []
}`;
    } else {
        systemPrompt = `You are an expert Document Analysis and Extraction AI for banking policies and compliance documents.
Extract the document's NATURAL native sections, headings, clauses, bullet points, tables, and embedded images cleanly in exact sequential order without forcing any template.

${formattingGuidelines}

Return ONLY valid JSON (single-quoted HTML attributes inside JSON strings, no markdown fences):
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
  "unmapped_content": []
}`;
    }

    const buildUserPrompt = (charLimit) => {
        const slicedText = rawText.slice(0, charLimit);
        return useTemplate && templateSections
            ? `Source Document Raw Text:\n${slicedText}\n\nFormat and inherit this document completely into template "${template?.template_name || 'Template 1: Policy Document'}" returning all ${templateSections.length} sections. Return valid JSON only.`
            : `Source Document Raw Text:\n${slicedText}\n\nExtract all sections natively in reading order. Return valid JSON only.`;
    };

    const callGroqWithModel = (modelName, charLimit = 18000, maxTokens = 4096) => {
        const requestBody = JSON.stringify({
            model: modelName,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: buildUserPrompt(charLimit) },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.15,
            max_tokens: maxTokens,
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
                            let providerError = null;
                            try { providerError = JSON.parse(data)?.error; } catch (_) {}
                            console.error('Groq extraction request failed:', {
                                model: modelName,
                                statusCode: res.statusCode,
                                code: providerError?.code,
                                message: providerError?.message,
                            });
                            const message = providerError?.code === 'json_validate_failed'
                                ? 'The AI could not format the extracted document. Please retry extraction.'
                                : providerError?.message || 'The AI extraction service rejected the request.';
                            const err = new Error(`Groq API Error (${res.statusCode}): ${message}`);
                            err.statusCode = res.statusCode;
                            return reject(err);
                        }
                        try {
                            const parsed = JSON.parse(data);
                            let messageContent = parsed?.choices?.[0]?.message?.content;
                            if (!messageContent) {
                                return reject(new Error('Groq returned empty response content'));
                            }
                            messageContent = messageContent.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
                            const structuredDoc = JSON.parse(messageContent);
                            const finalDoc = injectTablesAndImages(
                                structuredDoc,
                                extractedImages,
                                extractedTables,
                                templateSections,
                                useTemplate
                            );
                            resolve(finalDoc);
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

    try {
        return await callGroqWithModel(GROQ_MODEL, 18000, 4096);
    } catch (err) {
        if (err.statusCode === 413) {
            console.warn(`Groq payload exceeded TPM ceiling on ${GROQ_MODEL}; retrying compact extraction window...`);
            return await callGroqWithModel(GROQ_MODEL, 9500, 3072);
        }
        if (err.statusCode === 429) {
            const match = String(err.message || '').match(/try again in\s+([\d.]+)s/i);
            const waitSec = match ? Number(match[1]) : 8;
            const delayMs = Math.min(Math.max(Math.ceil((waitSec + 1.5) * 1000), 2000), 30000);
            console.warn(`Groq rate limit hit on ${GROQ_MODEL}; waiting ${delayMs}ms before retry...`);
            await new Promise((r) => setTimeout(r, delayMs));
            try {
                return await callGroqWithModel(GROQ_MODEL, 15000, 4096);
            } catch (retryErr) {
                if (retryErr.statusCode === 413) {
                    return await callGroqWithModel(GROQ_MODEL, 9500, 3072);
                }
                throw retryErr;
            }
        }
        throw err;
    }
};

module.exports = {
    extractRawTextFromFile,
    transformTextWithTemplate,
};
