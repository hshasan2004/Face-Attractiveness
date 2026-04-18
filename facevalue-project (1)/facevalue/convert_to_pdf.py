from fpdf import FPDF
import sys

pdf = FPDF()
pdf.add_page()
pdf.set_font("helvetica", size=10)

with open("FACEVALUE_OVERALL_STATEMENT.md", "r", encoding="utf-8") as f:
    for line in f:
        pdf.cell(0, 5, line.encode('latin-1', 'replace').decode('latin-1'), ln=True)

pdf.output("FACEVALUE_OVERALL_STATEMENT.pdf")
