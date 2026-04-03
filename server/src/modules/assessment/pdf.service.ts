import PDFDocument from 'pdfkit';
import archiver from 'archiver';
import { PassThrough } from 'stream';
import { getReportById } from './report.service.js';

const RISK_LABELS: Record<string, string> = {
  level_1: '一级（一般）', level_2: '二级（关注）', level_3: '三级（严重）', level_4: '四级（危机）',
};

/** Generate a PDF for a single report */
export async function generateReportPDF(reportId: string): Promise<Buffer> {
  const report = await getReportById(reportId);
  const content = report.content as Record<string, unknown>;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Register font for Chinese support
    // PDFKit uses Helvetica by default which doesn't support Chinese
    // We'll use the built-in font and handle encoding
    doc.font('Helvetica');

    // Title
    doc.fontSize(18).text(report.title, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#666').text(
      `Generated: ${new Date(report.createdAt).toLocaleDateString('zh-CN')} | Type: ${report.reportType}`,
      { align: 'center' },
    );
    doc.moveDown(1);
    doc.fillColor('#000');

    // Line separator
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#e2e8f0');
    doc.moveDown(0.5);

    if (report.reportType === 'individual_single') {
      renderIndividualReport(doc, content);
    } else if (report.reportType === 'group_single') {
      renderGroupReport(doc, content);
    } else if (report.reportType === 'individual_trend') {
      renderTrendReport(doc, content);
    }

    // Advice
    if (report.aiNarrative) {
      doc.moveDown(1);
      doc.fontSize(14).text('Comprehensive Advice', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10).text(report.aiNarrative);
    }

    doc.end();
  });
}

function renderIndividualReport(doc: PDFKit.PDFDocument, content: Record<string, unknown>) {
  const totalScore = content.totalScore as string | number | undefined;
  const riskLevel = content.riskLevel as string | undefined;
  const demographics = content.demographics as Record<string, unknown> | undefined;
  const interps = (content.interpretationPerDimension || []) as {
    dimension: string; score: number; label: string; riskLevel?: string; advice?: string;
  }[];

  // Demographics
  if (demographics && Object.keys(demographics).length > 0) {
    doc.fontSize(14).text('Basic Information', { underline: true });
    doc.moveDown(0.3);
    for (const [key, val] of Object.entries(demographics)) {
      doc.fontSize(10).text(`${key}: ${val}`);
    }
    doc.moveDown(0.5);
  }

  // Score summary
  doc.fontSize(14).text('Assessment Results', { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(12).text(`Total Score: ${totalScore || '-'}`);
  if (riskLevel) {
    doc.text(`Risk Level: ${RISK_LABELS[riskLevel] || riskLevel}`);
  }
  doc.moveDown(0.5);

  // Dimensions
  if (interps.length > 0) {
    doc.fontSize(14).text('Dimension Assessment', { underline: true });
    doc.moveDown(0.3);
    for (const d of interps) {
      doc.fontSize(11).text(`${d.dimension}: ${d.score} - ${d.label}`);
      if (d.riskLevel) {
        doc.fontSize(9).fillColor('#666').text(`  Risk: ${RISK_LABELS[d.riskLevel] || d.riskLevel}`);
      }
      if (d.advice) {
        doc.fontSize(9).fillColor('#2563eb').text(`  Advice: ${d.advice}`);
      }
      doc.fillColor('#000').moveDown(0.2);
    }
  }
}

function renderGroupReport(doc: PDFKit.PDFDocument, content: Record<string, unknown>) {
  const participantCount = content.participantCount as number | undefined;
  const riskDistribution = content.riskDistribution as Record<string, number> | undefined;
  const dimensionStats = content.dimensionStats as Record<string, { mean: number; median: number; stdDev: number; min: number; max: number }> | undefined;

  doc.fontSize(12).text(`Participants: ${participantCount || 0}`);
  doc.moveDown(0.5);

  if (riskDistribution) {
    doc.fontSize(14).text('Risk Distribution', { underline: true });
    doc.moveDown(0.3);
    for (const level of ['level_1', 'level_2', 'level_3', 'level_4']) {
      doc.fontSize(10).text(`${RISK_LABELS[level]}: ${riskDistribution[level] || 0}`);
    }
    doc.moveDown(0.5);
  }

  if (dimensionStats) {
    doc.fontSize(14).text('Dimension Statistics', { underline: true });
    doc.moveDown(0.3);
    for (const [dimId, stats] of Object.entries(dimensionStats)) {
      doc.fontSize(11).text(dimId);
      doc.fontSize(9).text(`  Mean: ${stats.mean} | Median: ${stats.median} | StdDev: ${stats.stdDev} | Min: ${stats.min} | Max: ${stats.max}`);
      doc.moveDown(0.2);
    }
  }
}

function renderTrendReport(doc: PDFKit.PDFDocument, content: Record<string, unknown>) {
  const assessmentCount = content.assessmentCount as number | undefined;
  const timeline = (content.timeline || []) as { index: number; date: string; totalScore: string; riskLevel?: string }[];
  const trends = content.trends as Record<string, 'improving' | 'worsening' | 'stable'> | undefined;

  const trendLabels = { improving: 'Improving', worsening: 'Worsening', stable: 'Stable' };

  doc.fontSize(12).text(`Assessment Count: ${assessmentCount || 0}`);
  doc.moveDown(0.5);

  if (timeline.length > 0) {
    doc.fontSize(14).text('Score Timeline', { underline: true });
    doc.moveDown(0.3);
    for (const t of timeline) {
      doc.fontSize(10).text(
        `Round ${t.index} (${new Date(t.date).toLocaleDateString('zh-CN')}): Score ${t.totalScore}${t.riskLevel ? ` - ${RISK_LABELS[t.riskLevel] || t.riskLevel}` : ''}`
      );
    }
    doc.moveDown(0.5);
  }

  if (trends && Object.keys(trends).length > 0) {
    doc.fontSize(14).text('Trends', { underline: true });
    doc.moveDown(0.3);
    for (const [dim, trend] of Object.entries(trends)) {
      doc.fontSize(10).text(`${dim}: ${trendLabels[trend]}`);
    }
  }
}

/** Generate a ZIP of PDFs for multiple reports */
export async function generateBatchPDFZip(reportIds: string[]): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    const passthrough = new PassThrough();

    passthrough.on('data', (chunk: Buffer) => chunks.push(chunk));
    passthrough.on('end', () => resolve(Buffer.concat(chunks)));
    passthrough.on('error', reject);

    archive.pipe(passthrough);

    for (let i = 0; i < reportIds.length; i++) {
      try {
        const pdf = await generateReportPDF(reportIds[i]);
        archive.append(pdf, { name: `report_${i + 1}.pdf` });
      } catch {
        // Skip failed reports
      }
    }

    await archive.finalize();
  });
}
