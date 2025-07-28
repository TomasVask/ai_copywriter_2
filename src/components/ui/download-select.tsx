import { Download } from 'lucide-react';
import { ChatSession } from "@/models/chatSession.model";
import { saveAs } from 'file-saver';
import { jsPDF } from 'jspdf';
import { useState } from "react";
import "../../fonts/Roboto_Condensed-Medium-normal"

interface DownloadSelectProps {
  session: ChatSession
}

export const DownloadSelect = ({ session }: DownloadSelectProps) => {
  const [openExportDropdown, setOpenExportDropdown] = useState<string | null>(null);

  function escapeCSV(value: string) {
    return value.replace(/\n/g, ' ').replace(/"/g, '""');
  }

  function exportSessionAsJSON(session: ChatSession) {
    const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
    saveAs(blob, `${session.title || 'chat'}-${session.id}.json`);
  }

  function exportSessionAsCSV(session: ChatSession) {
    const rows = [
      ['Role', 'Model', 'Timestamp', 'Content'],
      ...session.messages.flatMap(message => {
        if (message.role === 'user') {
          return [[
            'user',
            '',
            message.timestamp ? new Date(message.timestamp).toLocaleString() : '',
            escapeCSV(message.content || '')
          ]];
        } else if (message.role === 'assistant' && Array.isArray(message.responses)) {
          return message.responses.map(modelResponse => [
            'assistant',
            modelResponse.model,
            message.timestamp ? new Date(message.timestamp).toLocaleString() : '',
            escapeCSV(String(modelResponse.generatedContent || ''))
          ]);
        }
        return [];
      })
    ];
    const csvContent = rows.map(e => e.map(v => `"${v}"`).join(',')).join('\n');
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv' });
    saveAs(blob, `${session.title || 'chat'}-${session.id}.csv`);
  }

  function exportSessionAsPDF(session: ChatSession) {
    const doc = new jsPDF();
    doc.setFont("Roboto_Condensed-Medium", "normal");
    doc.setFontSize(12);

    const margin = 15;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const maxLineWidth = pageWidth - margin * 2;
    const lineHeight = 7;

    // Title
    const titleLines = doc.splitTextToSize(`Chat session: ${session.title}`, maxLineWidth);
    doc.text(titleLines, margin, margin + lineHeight);
    let y = margin + titleLines.length * lineHeight + 5;

    // Custom spacing
    const spaceAboveHeading = 8; // bigger space above heading
    const spaceBelowHeading = 2; // smaller space below heading (before content)

    const addTextBlock = (text: string, yPos: number): { y: number, lines: string[] } => {
      const lines = doc.splitTextToSize(text, maxLineWidth);
      lines.forEach((line: string) => {
        if (yPos + lineHeight > pageHeight - margin) {
          doc.addPage();
          yPos = margin;
        }
        doc.text(line, margin, yPos);
        yPos += lineHeight;
      });
      return { y: yPos, lines };
    };

    session.messages.forEach(message => {
      if (y > pageHeight - margin - 20) {
        doc.addPage();
        y = margin;
      }

      if (message.role === 'user') {
        y += spaceAboveHeading; // Add bigger space above heading
        const header = `USER (${message.timestamp ? new Date(message.timestamp).toLocaleString() : ''}):`;
        const { y: yAfterHeader } = addTextBlock(header, y);
        y = yAfterHeader + spaceBelowHeading; // Add small space below heading
        const { y: yAfterContent } = addTextBlock(message.content || '', y);
        y = yAfterContent + 2; // small space after content
      } else if (message.role === 'assistant' && Array.isArray(message.responses)) {
        message.responses.forEach(modelResponse => {
          y += spaceAboveHeading; // Add bigger space above heading
          const header = `ASSISTANT [${modelResponse.model}] (${message.timestamp ? new Date(message.timestamp).toLocaleString() : ''}):`;
          const { y: yAfterHeader } = addTextBlock(header, y);
          y = yAfterHeader + spaceBelowHeading; // Add small space below heading
          const { y: yAfterContent } = addTextBlock(String(modelResponse.generatedContent || ''), y);
          y = yAfterContent + 2; // small space after content
        });
      }
    });

    doc.save(`${session.title || 'chat'}-${session.id}.pdf`);
  }

  return (
    <div className="relative">
      <button
        className="p-2 rounded-full hover:bg-gray-200 transition group/export"
        title="Export"
        tabIndex={0}
        onClick={() => setOpenExportDropdown(openExportDropdown === session.id ? null : session.id)}
        onBlur={() => setTimeout(() => setOpenExportDropdown(null), 150)}
      >
        <Download className="w-4 h-4 text-gray-500" />
      </button>
      {openExportDropdown === session.id && (
        <div className="absolute right-0 mt-2 w-16 bg-white border border-gray-200 rounded shadow-lg z-50">
          <button
            className="w-full text-left px-2 py-1.5 hover:bg-gray-100 text-sm"
            onClick={() => {
              exportSessionAsPDF(session);
              setOpenExportDropdown(null);
            }}
          >
            PDF
          </button>
          <button
            className="w-full text-left px-2 py-1.5 hover:bg-gray-100 text-sm"
            onClick={() => {
              exportSessionAsCSV(session);
              setOpenExportDropdown(null);
            }}
          >
            CSV
          </button>
          <button
            className="w-full text-left px-2 py-1.5 hover:bg-gray-100 text-sm"
            onClick={() => {
              exportSessionAsJSON(session);
              setOpenExportDropdown(null);
            }}
          >
            JSON
          </button>
        </div>
      )}
    </div>
  )
}