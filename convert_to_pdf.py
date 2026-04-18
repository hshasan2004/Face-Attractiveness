from fpdf import FPDF
import sys

class PDF(FPDF):
    def header(self):
        self.set_font('Arial', 'B', 12)
        self.cell(0, 10, 'FACEVALUE OVERALL STATEMENT', 0, 1, 'C')

    def footer(self):
        self.set_y(-15)
        self.set_font('Arial', 'I', 8)
        self.cell(0, 10, f'Page {self.page_no()}', 0, 0, 'C')

pdf = PDF()
pdf.add_page()
pdf.set_font("Arial", size=11)

content = """"""
pdf.multi_cell(0, 10, content)

pdf.output("FACEVALUE_OVERALL_STATEMENT.pdf")
