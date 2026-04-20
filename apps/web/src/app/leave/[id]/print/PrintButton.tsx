"use client";

import { Printer } from "lucide-react";

export default function PrintButton() {
  function handlePrint() {
    // open a clean window with only the paper content
    const paper = document.getElementById("leave-paper");
    if (!paper) { window.print(); return; }

    const win = window.open("", "_blank", "width=900,height=1100");
    if (!win) { window.print(); return; }

    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>ใบลา</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');
    @page { size: A4 portrait; margin: 0; }
    html, body {
      margin: 0; padding: 0; background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body { font-family: 'TH Sarabun New', 'Sarabun', 'Angsana New', sans-serif; }
  </style>
</head>
<body>
  ${paper.outerHTML}
  <script>
    window.onload = function() {
      window.print();
      setTimeout(function() { window.close(); }, 500);
    };
  <\/script>
</body>
</html>`);
    win.document.close();
  }

  return (
    <button
      onClick={handlePrint}
      className="btn-primary flex items-center gap-2 text-sm"
    >
      <Printer size={16} /> พิมพ์ / บันทึก PDF
    </button>
  );
}
