"""
Exporta as cifras extraídas para Excel, Word, PDF e texto.
Cada função recebe a lista de músicas (dicts) e devolve o arquivo em bytes.
"""

import io

from docx import Document
from docx.shared import Pt
from fpdf import FPDF
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side


def _nome(item):
    """'Música (Artista)' ou um aviso quando a extração falhou"""
    if item["Status"] != "OK":
        return "(cifra não extraída)"
    return f"{item['Música']} ({item['Artista']})" if item["Artista"] else item["Música"]


def _cifra(item):
    return item["Cifra"] if item["Status"] == "OK" else f"Não foi possível extrair: {item['Erro']}\n{item['URL']}"


def exportar_txt(dados):
    blocos = ["CIFRAS DA MISSA", ""]
    for item in dados:
        blocos += ["=" * 60, item["Posição"].upper(), _nome(item), "=" * 60, "", _cifra(item), "", ""]
    # utf-8-sig para o Bloco de Notas reconhecer os acentos
    return "\n".join(blocos).encode("utf-8-sig")


def exportar_docx(dados):
    doc = Document()
    doc.add_heading("Cifras da Missa", 0)

    for i, item in enumerate(dados):
        if i:
            doc.add_page_break()
        doc.add_heading(item["Posição"], level=1)
        doc.add_paragraph().add_run(_nome(item)).bold = True

        paragrafo = doc.add_paragraph()
        paragrafo.paragraph_format.space_after = Pt(0)
        run = paragrafo.add_run(_cifra(item))
        # Fonte monoespaçada mantém os acordes alinhados com a letra
        run.font.name = "Courier New"
        run.font.size = Pt(10)

    buffer = io.BytesIO()
    doc.save(buffer)
    return buffer.getvalue()


def _latin1(texto):
    """As fontes padrão do PDF só aceitam latin-1 (que cobre os acentos do português)"""
    trocas = {"—": "-", "–": "-", "“": '"', "”": '"', "‘": "'", "’": "'", "…": "...", "\t": "    "}
    for antigo, novo in trocas.items():
        texto = texto.replace(antigo, novo)
    return texto.encode("latin-1", "replace").decode("latin-1")


def exportar_pdf(dados):
    pdf = FPDF(format="A4")
    pdf.set_auto_page_break(True, margin=15)
    largura_util = pdf.w - pdf.l_margin - pdf.r_margin

    for item in dados:
        pdf.add_page()
        pdf.set_font("Helvetica", "B", 16)
        pdf.cell(0, 9, _latin1(item["Posição"]), new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 12)
        pdf.cell(0, 7, _latin1(_nome(item)), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(4)

        cifra = _latin1(_cifra(item))
        # Diminui a fonte para a linha mais longa caber sem quebrar (Courier: 0,6 em por caractere)
        maior_linha = max((len(linha) for linha in cifra.splitlines()), default=1)
        tamanho = max(7, min(10, largura_util / (0.6 * 0.3528 * maior_linha)))
        pdf.set_font("Courier", "", tamanho)
        pdf.multi_cell(0, tamanho * 0.45, cifra)

    return bytes(pdf.output())


def exportar_xlsx(dados):
    wb = Workbook()
    ws = wb.active
    ws.title = "Cifras"
    ws.append(["Posição", "Música", "Artista", "Cifra", "URL"])
    for item in dados:
        ws.append([item["Posição"], item["Música"], item["Artista"], _cifra(item), item["URL"]])

    # Estilos
    header_fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF", size=12)
    lado = Side(style="thin")
    border = Border(left=lado, right=lado, top=lado, bottom=lado)

    for cell in ws[1]:
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = border

    for coluna, largura in zip("ABCDE", (20, 30, 25, 80, 40)):
        ws.column_dimensions[coluna].width = largura

    for row in ws.iter_rows(min_row=2):
        for cell in row:
            cell.border = border
            cell.alignment = Alignment(horizontal="left", vertical="top", wrap_text=True)
        row[0].alignment = Alignment(horizontal="center", vertical="center")
        row[3].font = Font(name="Courier New", size=10)
        # Excel não ajusta a altura sozinho; 13 pontos por linha da cifra (máx. 409)
        ws.row_dimensions[row[0].row].height = min(409, 13 * (str(row[3].value).count("\n") + 1))

    ws.freeze_panes = "A2"
    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


EXPORTADORES = {
    "docx": exportar_docx,
    "pdf": exportar_pdf,
    "txt": exportar_txt,
    "xlsx": exportar_xlsx,
}
