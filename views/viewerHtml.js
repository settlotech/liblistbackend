function get3dViewerHtml() {
  return String.rawapp.get('/3dviewer', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Australian Banking Vector DB — Standalone 3D Viewer & TensorFlow Projector</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #070b14;
      color: #e2e8f0;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      overflow: hidden;
      height: 100vh;
      width: 100vw;
      user-select: none;
    }
    #canvas3d {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 1;
      cursor: grab;
    }
    #canvas3d:active { cursor: grabbing; }

    /* Top Bar */
    .topbar {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 60px;
      background: rgba(11, 17, 32, 0.88);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid rgba(59, 130, 246, 0.2);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 20px;
      z-index: 10;
    }
    .brand-section {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-badge {
      background: linear-gradient(135deg, #0057B8, #1e40af);
      color: #fff;
      font-weight: 700;
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 6px;
      letter-spacing: 0.5px;
      border: 1px solid rgba(255, 255, 255, 0.2);
    }
    .brand-title {
      font-size: 14px;
      font-weight: 700;
      color: #ffffff;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .brand-subtitle {
      font-size: 11px;
      color: #94a3b8;
      font-weight: 400;
    }

    .filter-pills {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .pill {
      background: rgba(30, 41, 59, 0.7);
      border: 1px solid rgba(71, 85, 105, 0.4);
      color: #94a3b8;
      font-size: 11.5px;
      font-weight: 600;
      padding: 5px 12px;
      border-radius: 20px;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .pill:hover { background: rgba(51, 65, 85, 0.9); color: #fff; }
    .pill.active {
      background: #0057B8;
      color: #fff;
      border-color: #3b82f6;
      box-shadow: 0 0 12px rgba(59, 130, 246, 0.4);
    }

    .action-group {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.15s ease;
      border: none;
    }
    .btn-tf {
      background: linear-gradient(135deg, #f97316, #ea580c);
      color: #fff;
      box-shadow: 0 2px 8px rgba(234, 88, 12, 0.35);
    }
    .btn-tf:hover { filter: brightness(1.1); transform: translateY(-1px); }
    .btn-portal {
      background: rgba(30, 41, 59, 0.8);
      color: #cbd5e1;
      border: 1px solid rgba(71, 85, 105, 0.5);
    }
    .btn-portal:hover { background: rgba(51, 65, 85, 0.9); color: #fff; }

    /* Floating Camera Toolbar */
    .camera-toolbar {
      position: absolute;
      bottom: 24px;
      left: 24px;
      background: rgba(11, 17, 32, 0.85);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(59, 130, 246, 0.25);
      border-radius: 12px;
      padding: 6px;
      display: flex;
      gap: 6px;
      z-index: 10;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
    }
    .tool-btn {
      background: rgba(30, 41, 59, 0.6);
      border: 1px solid rgba(71, 85, 105, 0.3);
      color: #94a3b8;
      padding: 6px 10px;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
    }
    .tool-btn:hover { background: #1e293b; color: #fff; }
    .tool-btn.active { background: #0057B8; color: #fff; border-color: #3b82f6; }

    /* Node Inspector Panel */
    .inspector-panel {
      position: absolute;
      top: 80px;
      right: 24px;
      width: 380px;
      max-height: calc(100vh - 110px);
      background: rgba(11, 17, 32, 0.92);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(59, 130, 246, 0.3);
      border-radius: 16px;
      padding: 20px;
      z-index: 10;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
      overflow-y: auto;
      transition: transform 0.25s ease, opacity 0.25s ease;
    }
    .inspector-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 12px;
      border-bottom: 1px solid rgba(51, 65, 85, 0.5);
      padding-bottom: 12px;
    }
    .inspector-title {
      font-size: 14px;
      font-weight: 700;
      color: #ffffff;
      line-height: 1.3;
    }
    .inspector-doc {
      font-size: 11px;
      color: #60a5fa;
      font-family: 'JetBrains Mono', monospace;
      margin-top: 4px;
    }
    .coords-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
      margin-bottom: 14px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      text-align: center;
    }
    .coord-box {
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid rgba(51, 65, 85, 0.5);
      border-radius: 8px;
      padding: 6px 4px;
    }
    .coord-label { color: #64748b; font-size: 9.5px; font-weight: 600; }
    .coord-val { color: #38bdf8; font-weight: 700; }

    .meta-box {
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(51, 65, 85, 0.4);
      border-radius: 8px;
      padding: 10px 12px;
      margin-bottom: 14px;
      font-size: 11.5px;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
    }
    .meta-row:last-child { margin-bottom: 0; }
    .meta-label { color: #64748b; }
    .meta-val { color: #e2e8f0; font-weight: 600; }

    .chunk-content-box {
      background: rgba(3, 7, 18, 0.9);
      border: 1px solid rgba(51, 65, 85, 0.6);
      border-radius: 10px;
      padding: 12px;
      font-size: 12px;
      line-height: 1.6;
      color: #cbd5e1;
      max-height: 220px;
      overflow-y: auto;
    }

    /* TensorFlow Projector Modal */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(8px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 100;
    }
    .modal-overlay.open { display: flex; }
    .modal-card {
      background: #0f172a;
      border: 1px solid #3b82f6;
      border-radius: 20px;
      width: 90%;
      max-width: 620px;
      padding: 26px;
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.8);
      position: relative;
    }
    .modal-close {
      position: absolute;
      top: 20px;
      right: 20px;
      background: transparent;
      border: none;
      color: #94a3b8;
      font-size: 20px;
      cursor: pointer;
    }
    .modal-close:hover { color: #fff; }
    .tf-badge {
      background: #ea580c;
      color: #fff;
      font-size: 10.5px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 6px;
      display: inline-block;
      margin-bottom: 8px;
    }
    .step-box {
      background: #090d16;
      border: 1px solid #1e293b;
      border-radius: 10px;
      padding: 12px 16px;
      margin: 10px 0;
      font-size: 12.5px;
      line-height: 1.5;
    }
    .step-num {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #3b82f6;
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      margin-right: 8px;
    }
    .download-links {
      display: flex;
      gap: 10px;
      margin-top: 16px;
    }
    .btn-download {
      flex: 1;
      padding: 10px;
      background: #1e293b;
      border: 1px solid #3b82f6;
      color: #fff;
      border-radius: 10px;
      font-size: 12px;
      font-weight: 600;
      text-align: center;
      text-decoration: none;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-download:hover { background: #2563eb; }
  </style>
</head>
<body>

  <!-- Topbar -->
  <header class="topbar">
    <div class="brand-section">
      <span class="brand-badge">APRA CPS 234</span>
      <div>
        <div class="brand-title">
          <span>Vector DB 3D Embedding Space</span>
        </div>
        <div class="brand-subtitle">Commonwealth Bank of Australia — Neon pgvector Engine</div>
      </div>
    </div>

    <!-- Department Filtering -->
    <div class="filter-pills">
      <button class="pill active" onclick="setDeptFilter('all', this)">All Partitions</button>
      <button class="pill" onclick="setDeptFilter('retail-lending', this)">Retail Lending</button>
      <button class="pill" onclick="setDeptFilter('onboarding', this)">Onboarding</button>
      <button class="pill" onclick="setDeptFilter('security', this)">Security</button>
      <button class="pill" onclick="setDeptFilter('legal-compliance', this)">Legal/APRA</button>
    </div>

    <!-- Actions -->
    <div class="action-group">
      <button class="btn btn-tf" onclick="openTfModal()">
        <span>TensorFlow Projector</span>
      </button>
      <a href="http://localhost:5173" class="btn btn-portal">
        <span>Back to Portal (Port 5173)</span>
      </a>
    </div>
  </header>

  <!-- 3D Canvas -->
  <canvas id="canvas3d"></canvas>

  <!-- Camera Controls -->
  <div class="camera-toolbar">
    <button class="tool-btn active" id="btnAutoRotate" onclick="toggleAutoRotate()">Auto Rotate</button>
    <button class="tool-btn" onclick="zoomIn()">Zoom In (+)</button>
    <button class="tool-btn" onclick="zoomOut()">Zoom Out (-)</button>
    <button class="tool-btn" onclick="resetCamera()">Reset View</button>
  </div>

  <!-- Inspector HUD -->
  <aside class="inspector-panel" id="inspectorPanel">
    <div class="inspector-header">
      <div>
        <div class="inspector-title" id="inspTitle">Select a node to inspect</div>
        <div class="inspector-doc" id="inspDoc">No node selected</div>
      </div>
    </div>

    <div class="coords-grid">
      <div class="coord-box">
        <div class="coord-label">X COORD</div>
        <div class="coord-val" id="inspX">0</div>
      </div>
      <div class="coord-box">
        <div class="coord-label">Y COORD</div>
        <div class="coord-val" id="inspY">0</div>
      </div>
      <div class="coord-box">
        <div class="coord-label">Z COORD</div>
        <div class="coord-val" id="inspZ">0</div>
      </div>
    </div>

    <div class="meta-box">
      <div class="meta-row">
        <span class="meta-label">Division:</span>
        <span class="meta-val" id="inspDept">-</span>
      </div>
      <div class="meta-row">
        <span class="meta-label">Turnaround SLA:</span>
        <span class="meta-val" id="inspSla">-</span>
      </div>
      <div class="meta-row">
        <span class="meta-label">Officer Approval Cap:</span>
        <span class="meta-val" id="inspCap">-</span>
      </div>
    </div>

    <div>
      <div style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px;">
        Verbatim Vector Chunk Content
      </div>
      <div class="chunk-content-box" id="inspContent">
        Click or hover on any glowing sphere in the 3D space to view its exact stored text.
      </div>
    </div>
  </aside>

  <!-- TensorFlow Projector Modal -->
  <div class="modal-overlay" id="tfModal">
    <div class="modal-card">
      <button class="modal-close" onclick="closeTfModal()">&times;</button>
      <span class="tf-badge">Open Source ML Visualizer</span>
      <h2 style="font-size: 18px; font-weight: 700; margin-bottom: 6px; color: #fff;">
        TensorFlow Embedding Projector Integration
      </h2>
      <p style="font-size: 12px; color: #94a3b8; margin-bottom: 16px;">
        Inspect your exact policy vector database embeddings in Google's official TensorFlow Projector (<code style="color: #60a5fa;">projector.tensorflow.org</code>) using UMAP, t-SNE, or PCA dimensionality reduction.
      </p>

      <div class="step-box">
        <span class="step-num">1</span>
        <strong>Download Vectors & Metadata</strong>: Click below to download the two tab-separated files (<code style="color: #fbbf24;">vectors.tsv</code> and <code style="color: #fbbf24;">metadata.tsv</code>) generated directly from your Neon PostgreSQL database.
      </div>

      <div class="download-links">
        <a href="/api/projector/vectors.tsv" download="vectors.tsv" class="btn-download">
          Download vectors.tsv (Tensors)
        </a>
        <a href="/api/projector/metadata.tsv" download="metadata.tsv" class="btn-download">
          Download metadata.tsv (Labels)
        </a>
      </div>

      <div class="step-box" style="margin-top: 14px;">
        <span class="step-num">2</span>
        <strong>Open TensorFlow Projector</strong>: Click "Load Data" in the top-left of the TensorFlow Projector, then select <code style="color: #fbbf24;">vectors.tsv</code> for Step 1, and <code style="color: #fbbf24;">metadata.tsv</code> for Step 2.
      </div>

      <div style="margin-top: 16px; text-align: center;">
        <a href="https://projector.tensorflow.org/" target="_blank" class="btn btn-tf" style="padding: 10px 20px; font-size: 13px;">
          Launch projector.tensorflow.org in New Tab &rarr;
        </a>
      </div>
    </div>
  </div>

  <script>
    const canvas = document.getElementById('canvas3d');
    const ctx = canvas.getContext('2d');

    const DEPT_COLORS = {
      'retail-lending': { hex: '#0057B8', light: '#60a5fa', name: 'Retail Lending' },
      'credit-cards': { hex: '#0057B8', light: '#60a5fa', name: 'Credit Cards' },
      'onboarding': { hex: '#7c3aed', light: '#a78bfa', name: 'Onboarding & KYC' },
      'security': { hex: '#d97706', light: '#fbbf24', name: 'Security & InfoSec' },
      'legal-compliance': { hex: '#e11d48', light: '#fb7185', name: 'Legal & APRA' },
      'other': { hex: '#475569', light: '#94a3b8', name: 'General Governance' }
    };

    let nodes = [];
    let selectedDept = 'all';
    let autoRotate = true;
    let hoveredNode = null;
    let selectedNode = null;

    // Camera state
    const camera = {
      yaw: 0.45,
      pitch: 0.28,
      distance: 680,
      targetYaw: 0.45,
      targetPitch: 0.28,
      targetDistance: 680
    };

    let isDragging = false;
    let lastMouse = { x: 0, y: 0 };

    function resizeCanvas() {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.scale(dpr, dpr);
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // 40 Ambient Stars
    const stars = Array.from({ length: 45 }, (_, i) => ({
      x: Math.sin(i * 1.5) * 650,
      y: Math.cos(i * 2.3) * 450,
      z: Math.sin(i * 3.1) * 650,
      alpha: 0.15 + (i % 5) * 0.08
    }));

    // Fetch live vectors from DB
    async function loadVectors() {
      try {
        const res = await fetch('/api/vectors');
        const dbRows = await res.json();
        processNodes(dbRows);
      } catch (err) {
        console.warn('Vector fetch fallback:', err);
      }
    }

    function getDeptAngle(dept) {
      switch (dept) {
        case 'retail-lending':
        case 'credit-cards': return 0;
        case 'onboarding': return (Math.PI * 2) * (1 / 4);
        case 'security': return (Math.PI * 2) * (2 / 4);
        case 'legal-compliance': return (Math.PI * 2) * (3 / 4);
        default: return 0.5;
      }
    }

    function processNodes(dbRows) {
      nodes = dbRows.map((row, idx) => {
        const dept = row.department_id || 'other';
        const baseAngle = getDeptAngle(dept);
        const radius = 190 + (idx % 4) * 45;
        const angle = baseAngle + ((idx % 6) - 2.5) * 0.25;
        const height = ((idx % 5) - 2) * 55;
        const meta = row.metadata || {};

        return {
          id: 'vec-' + (row.id || idx),
          policyId: row.policy_id,
          title: row.section_title || ('Clause ' + (idx + 1)),
          documentName: row.document_name || 'Policy-Document.pdf',
          department: dept,
          type: row.section_type || 'Operational Clause',
          preview: row.preview || 'No excerpt available.',
          sla: meta.turnaround_sla || '24 Hours',
          officerCap: meta.officer_cap || '$5,000',
          x: Math.cos(angle) * radius + (Math.sin(idx * 3) * 20),
          y: height + (Math.cos(idx * 2) * 25),
          z: Math.sin(angle) * radius + (Math.sin(idx * 5) * 20),
          size: 7.5 + (idx % 3) * 2,
          color: (DEPT_COLORS[dept] || DEPT_COLORS.other).hex,
          lightColor: (DEPT_COLORS[dept] || DEPT_COLORS.other).light
        };
      });

      if (nodes.length > 0) {
        selectNode(nodes[0]);
      }
    }

    function selectNode(n) {
      selectedNode = n;
      document.getElementById('inspTitle').textContent = n.title;
      document.getElementById('inspDoc').textContent = n.documentName;
      document.getElementById('inspX').textContent = Math.round(n.x);
      document.getElementById('inspY').textContent = Math.round(n.y);
      document.getElementById('inspZ').textContent = Math.round(n.z);
      document.getElementById('inspDept').textContent = (DEPT_COLORS[n.department] || DEPT_COLORS.other).name;
      document.getElementById('inspSla').textContent = n.sla;
      document.getElementById('inspCap').textContent = n.officerCap;
      document.getElementById('inspContent').textContent = n.preview;
    }

    function setDeptFilter(dept, btn) {
      selectedDept = dept;
      document.querySelectorAll('.filter-pills .pill').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
    }

    function toggleAutoRotate() {
      autoRotate = !autoRotate;
      document.getElementById('btnAutoRotate').classList.toggle('active', autoRotate);
    }
    function zoomIn() { camera.targetDistance = Math.max(260, camera.targetDistance - 100); }
    function zoomOut() { camera.targetDistance = Math.min(1300, camera.targetDistance + 100); }
    function resetCamera() {
      camera.targetYaw = 0.45;
      camera.targetPitch = 0.28;
      camera.targetDistance = 680;
    }

    function openTfModal() { document.getElementById('tfModal').classList.add('open'); }
    function closeTfModal() { document.getElementById('tfModal').classList.remove('open'); }

    // 3D Rendering Engine Loop
    function render() {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const cx = width / 2;
      const cy = height / 2;

      if (autoRotate && !isDragging) {
        camera.targetYaw += 0.0022;
      }
      camera.yaw += (camera.targetYaw - camera.yaw) * 0.1;
      camera.pitch += (camera.targetPitch - camera.pitch) * 0.1;
      camera.distance += (camera.targetDistance - camera.distance) * 0.1;

      const fov = 420;
      const { yaw, pitch, distance } = camera;

      ctx.clearRect(0, 0, width, height);

      // Deep radial navy gradient
      const bg = ctx.createRadialGradient(cx, cy, 50, cx, cy, width * 0.8);
      bg.addColorStop(0, '#0f172a');
      bg.addColorStop(0.7, '#080d1a');
      bg.addColorStop(1, '#030712');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      const project = (x, y, z) => {
        const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
        const x1 = x * cosY + z * sinY;
        const z1 = -x * sinY + z * cosY;

        const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
        const y1 = y * cosP - z1 * sinP;
        const z2 = y * sinP + z1 * cosP;

        const scale = fov / (fov + z2 + distance);
        return {
          sx: cx + x1 * scale,
          sy: cy + y1 * scale,
          scale: scale,
          zDepth: z2
        };
      };

      // Floor Grid
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.22)';
      ctx.lineWidth = 1;
      const gridSize = 380, steps = 8, step = gridSize / steps, floorY = 160;
      for (let i = -steps; i <= steps; i++) {
        const p1 = project(i * step, floorY, -gridSize);
        const p2 = project(i * step, floorY, gridSize);
        if (p1.scale > 0 && p2.scale > 0) {
          ctx.beginPath();
          ctx.moveTo(p1.sx, p1.sy);
          ctx.lineTo(p2.sx, p2.sy);
          ctx.stroke();
        }
        const p3 = project(-gridSize, floorY, i * step);
        const p4 = project(gridSize, floorY, i * step);
        if (p3.scale > 0 && p4.scale > 0) {
          ctx.beginPath();
          ctx.moveTo(p3.sx, p3.sy);
          ctx.lineTo(p4.sx, p4.sy);
          ctx.stroke();
        }
      }

      // Ambient Stars
      stars.forEach(s => {
        const p = project(s.x, s.y, s.z);
        if (p.scale > 0) {
          ctx.fillStyle = 'rgba(148, 163, 184, ' + (s.alpha * Math.min(p.scale * 1.5, 1)) + ')';
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, Math.max(1, 1.5 * p.scale), 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // Filter and project nodes
      const activeNodes = nodes.filter(n => selectedDept === 'all' || n.department === selectedDept);
      const projected = activeNodes.map(n => {
        const p = project(n.x, n.y, n.z);
        return { ...n, sx: p.sx, sy: p.sy, scale: p.scale, zDepth: p.zDepth };
      }).filter(p => p.scale > 0);

      projected.sort((a, b) => b.zDepth - a.zDepth);

      // Synaptic Edges
      for (let i = 0; i < projected.length; i++) {
        for (let j = i + 1; j < projected.length; j++) {
          const n1 = projected[i], n2 = projected[j];
          if (n1.policyId && n1.policyId === n2.policyId) {
            const dx = n1.sx - n2.sx, dy = n1.sy - n2.sy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 260) {
              ctx.strokeStyle = 'rgba(96, 165, 250, ' + Math.max(0.08, (1 - dist / 260) * 0.35) + ')';
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(n1.sx, n1.sy);
              ctx.lineTo(n2.sx, n2.sy);
              ctx.stroke();
            }
          }
        }
      }

      // Render Nodes
      projected.forEach(n => {
        const r = Math.max(3.5, n.size * n.scale);
        const isHovered = hoveredNode && hoveredNode.id === n.id;
        const isSelected = selectedNode && selectedNode.id === n.id;

        ctx.save();
        if (isHovered || isSelected) {
          ctx.shadowBlur = 18;
          ctx.shadowColor = n.lightColor || '#60a5fa';
        }

        const grad = ctx.createRadialGradient(n.sx - r * 0.35, n.sy - r * 0.35, r * 0.1, n.sx, n.sy, r);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.3, n.lightColor || '#93c5fd');
        grad.addColorStop(1, n.color || '#2563eb');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(n.sx, n.sy, r, 0, Math.PI * 2);
        ctx.fill();

        if (isSelected) {
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(n.sx, n.sy, r + 4, 0, Math.PI * 2);
          ctx.stroke();
        } else if (isHovered) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(n.sx, n.sy, r + 3, 0, Math.PI * 2);
          ctx.stroke();
        }

        if (isHovered || isSelected) {
          ctx.fillStyle = isSelected ? '#38bdf8' : '#e2e8f0';
          ctx.font = Math.max(10, Math.round(11 * n.scale)) + 'px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(n.title.slice(0, 26), n.sx, n.sy + r + 14);
        }
        ctx.restore();
      });

      requestAnimationFrame(render);
    }

    // Mouse Listeners
    canvas.addEventListener('mousedown', e => {
      isDragging = true;
      lastMouse = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mouseup', () => { isDragging = false; });

    canvas.addEventListener('mousemove', e => {
      if (isDragging) {
        const dx = e.clientX - lastMouse.x;
        const dy = e.clientY - lastMouse.y;
        camera.targetYaw += dx * 0.007;
        camera.targetPitch = Math.max(-1.1, Math.min(1.1, camera.targetPitch + dy * 0.007));
        lastMouse = { x: e.clientX, y: e.clientY };
        return;
      }

      // Hit testing
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const fov = 420;

      let hit = null;
      let minD = 9999;
      const activeNodes = nodes.filter(n => selectedDept === 'all' || n.department === selectedDept);

      activeNodes.forEach(n => {
        const cosY = Math.cos(camera.yaw), sinY = Math.sin(camera.yaw);
        const x1 = n.x * cosY + n.z * sinY;
        const z1 = -n.x * sinY + n.z * cosY;

        const cosP = Math.cos(camera.pitch), sinP = Math.sin(camera.pitch);
        const y1 = n.y * cosP - z1 * sinP;
        const z2 = n.y * sinP + z1 * cosP;

        const scale = fov / (fov + z2 + camera.distance);
        if (scale > 0) {
          const sx = cx + x1 * scale;
          const sy = cy + y1 * scale;
          const d = Math.hypot(mx - sx, my - sy);
          const r = Math.max(5, n.size * scale);
          if (d <= r + 8 && d < minD) {
            minD = d;
            hit = n;
          }
        }
      });

      hoveredNode = hit;
    });

    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      camera.targetDistance = Math.max(260, Math.min(1300, camera.targetDistance + e.deltaY * 0.65));
    }, { passive: false });

    canvas.addEventListener('click', () => {
      if (hoveredNode) {
        selectNode(hoveredNode);
      }
    });

    // Initialize
    loadVectors();
    render();
  </script>
</body>
</html>`);
});

// ------------------- AI DOCUMENT INGESTION & RAG SYSTEM (GROQ + PGVECTOR) -------------------;
}

module.exports = { get3dViewerHtml };
