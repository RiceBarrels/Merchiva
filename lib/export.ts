import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// ─── CSV Export ──────────────────────────────────────────────────────────────

function escapeCSVCell(value: string): string {
  if (value.includes('"') || value.includes(",") || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function downloadCSV(
  filename: string,
  headers: string[],
  rows: string[][]
): void {
  const headerLine = headers.map(escapeCSVCell).join(",");
  const bodyLines = rows.map((row) => row.map(escapeCSVCell).join(","));
  const csv = [headerLine, ...bodyLines].join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ─── PDF Report Export ───────────────────────────────────────────────────────

interface PDFOptions {
  subtitle?: string;
  landscape?: boolean;
}

export function downloadPDF(
  title: string,
  headers: string[],
  rows: string[][],
  options?: PDFOptions
): void {
  const orientation = options?.landscape ? "landscape" : "portrait";
  const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;

  // Title
  doc.setFontSize(16);
  doc.setTextColor(28, 25, 23); // stone-950
  doc.text(title, margin, 20);

  // Subtitle + date line
  let startY = 28;
  doc.setFontSize(9);
  doc.setTextColor(120, 113, 108); // stone-500

  if (options?.subtitle) {
    doc.text(options.subtitle, margin, startY);
    startY += 5;
  }

  const dateStr = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  doc.text(`Generated ${dateStr}`, margin, startY);
  startY += 6;

  // Table
  autoTable(doc, {
    startY,
    head: [headers],
    body: rows,
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: {
      fontSize: 8,
      cellPadding: 3,
      lineColor: [214, 211, 209], // stone-300
      lineWidth: 0.25,
      textColor: [41, 37, 36], // stone-800
    },
    headStyles: {
      fillColor: [245, 245, 244], // stone-100
      textColor: [28, 25, 23], // stone-950
      fontStyle: "bold",
      lineColor: [168, 162, 158], // stone-400
      lineWidth: 0.25,
    },
    alternateRowStyles: {
      fillColor: [250, 250, 249], // stone-50
    },
    didDrawPage: (data) => {
      // Page number footer
      const pageNum = doc.getCurrentPageInfo().pageNumber;
      const totalPages = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(120, 113, 108);
      doc.text(
        `Page ${pageNum} of ${totalPages}`,
        pageWidth - margin,
        pageHeight - 10,
        { align: "right" }
      );
    },
  });

  // Fix total page count on all pages (didDrawPage runs before final count is known)
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    // White-out old footer and redraw with correct total
    doc.setFillColor(255, 255, 255);
    doc.rect(pageWidth - margin - 40, pageHeight - 14, 42, 8, "F");
    doc.setFontSize(8);
    doc.setTextColor(120, 113, 108);
    doc.text(
      `Page ${i} of ${totalPages}`,
      pageWidth - margin,
      pageHeight - 10,
      { align: "right" }
    );
  }

  const filename = title
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase();
  doc.save(`${filename}.pdf`);
}
