/**
 * Creates sample PDF File objects with valid minimal PDF structure or images for quick demo testing
 */
export function createSamplePdfFiles(): { questionFile: File; answerFile: File } {
  // Simple valid minimal 2-page PDF for question paper
  const questionPdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 5 0 R /Resources << /Font << /F1 7 0 R >> >> >>
endobj
4 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 6 0 R /Resources << /Font << /F1 7 0 R >> >> >>
endobj
5 0 obj
<< /Length 134 >>
stream
BT
/F1 18 Tf
50 780 Td
(VedaAI Master Exam: Physics Midterm 2026) Tj
0 -40 Td
/F1 12 Tf
(Q1. State Newton's Second Law of Motion. [4 Marks]) Tj
0 -30 Td
(Q2. Calculate acceleration given force=50N, mass=10kg. [6 Marks]) Tj
ET
endstream
endobj
6 0 obj
<< /Length 142 >>
stream
BT
/F1 18 Tf
50 780 Td
(Section B - Advanced Dynamics) Tj
0 -40 Td
/F1 12 Tf
(Q3(a). Derive kinematic equation v^2 = u^2 + 2as. [5 Marks]) Tj
0 -30 Td
(Q3(b). Define conservation of momentum. [5 Marks]) Tj
ET
endstream
endobj
7 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 8
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000227 00000 n 
0000000339 00000 n 
0000000525 00000 n 
0000000719 00000 n 
trailer
<< /Size 8 /Root 1 0 R >>
startxref
796
%%EOF`;

  // Simple valid minimal 2-page PDF for answer sheet
  const answerPdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 5 0 R /Resources << /Font << /F1 7 0 R >> >> >>
endobj
4 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 6 0 R /Resources << /Font << /F1 7 0 R >> >> >>
endobj
5 0 obj
<< /Length 146 >>
stream
BT
/F1 14 Tf
50 780 Td
(Student: Elena Vance | Roll: 2026-PHY-042) Tj
0 -40 Td
/F1 12 Tf
(Ans 1: F = dp/dt. Force is rate of change of momentum.) Tj
0 -40 Td
(Ans 3(a): v = u + at => v^2 = u^2 + 2as.) Tj
ET
endstream
endobj
6 0 obj
<< /Length 138 >>
stream
BT
/F1 14 Tf
50 780 Td
(Ans 2: a = F/m = 50N / 10kg = 5.0 m/s^2.) Tj
0 -40 Td
/F1 12 Tf
(Ans 3(b): Momentum remains conserved in closed system.) Tj
ET
endstream
endobj
7 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 8
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000227 00000 n 
0000000339 00000 n 
0000000537 00000 n 
0000000727 00000 n 
trailer
<< /Size 8 /Root 1 0 R >>
startxref
804
%%EOF`;

  const questionFile = new File([questionPdfContent], "physics_midterm_master_qp.pdf", { type: "application/pdf" });
  const answerFile = new File([answerPdfContent], "elena_vance_student_answers.pdf", { type: "application/pdf" });

  return { questionFile, answerFile };
}
