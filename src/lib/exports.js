import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { EMPRESA, TAGLINE_EXPORTS } from './casa'

// ─── Mapeamento de campos para labels legíveis ───
const FIELD_LABELS = {
  nome_noivo: 'Nome do Noivo',
  nome_noiva: 'Nome da Noiva',
  contacto_principal: 'Contacto Principal',
  email: 'Email',
  morada: 'Morada',
  data_evento: 'Data do Evento',
  local_evento: 'Local do Evento',
  numero_convidados: 'Nº de Convidados',
  hora_inicio: 'Hora de Início',
  hora_termino: 'Hora de Término',
  hora_montagem: 'Hora de Montagem',
  hora_limite_montagem: 'Hora Limite de Montagem',
  hora_recolha: 'Hora de Recolha',
  recolha_dia_seguinte: 'Recolha no Dia Seguinte',
  nome_responsavel: 'Responsável no Dia',
  contacto_responsavel: 'Contacto do Responsável',
  relacao_responsavel: 'Relação com os Noivos',
  estilo_evento: 'Estilo do Evento',
  estilo_outro: 'Outro Estilo',
  paleta_cores: 'Paleta de Cores',
  paleta_observacoes: 'Observações da Paleta',
  mesa_noivos: 'Mesa dos Noivos',
  cartoes_pratos: 'Cartões nos Pratos',
  observacoes_cartoes: 'Observações dos Cartões',
  descricao_mesa_noivos: 'Descrição da Mesa dos Noivos',
  cenario_palco: 'Cenário de Palco',
  descricao_cenario: 'Descrição do Cenário',
  medidas_espaco: 'Medidas / Limitações do Espaço',
  centros_mesa: 'Centros de Mesa',
  tipo_flores: 'Tipo de Flores',
  numero_mesas: 'Nº de Mesas',
  formato_mesas: 'Formato das Mesas',
  lugares_por_mesa: 'Lugares por Mesa',
  observacoes_mesas: 'Observações das Mesas',
  texto_principal_placa: 'Texto Principal da Placa',
  texto_secundario_placa: 'Texto Secundário da Placa',
  estilo_placa: 'Estilo da Placa',
  notas_placa: 'Notas da Placa',
  morada_exacta: 'Morada Exacta do Local',
  pessoa_abre_espaco: 'Pessoa que Abre o Espaço',
  contacto_pessoa_abre: 'Contacto da Pessoa',
  acesso_local: 'Acesso para Cargas/Descargas',
  notas_acesso: 'Notas de Acesso',
  observacoes_gerais: 'Observações Gerais',
  status: 'Estado',
  created_at: 'Data de Submissão',
}

const SECTIONS = [
  {
    title: 'Dados Principais',
    fields: ['nome_noivo', 'nome_noiva', 'contacto_principal', 'email', 'morada',
      'data_evento', 'local_evento', 'numero_convidados', 'hora_inicio',
      'hora_termino', 'hora_montagem', 'hora_limite_montagem', 'hora_recolha',
      'recolha_dia_seguinte']
  },
  {
    title: 'Contacto no Dia',
    fields: ['nome_responsavel', 'contacto_responsavel', 'relacao_responsavel']
  },
  {
    title: 'Estilo e Cores',
    fields: ['estilo_evento', 'estilo_outro', 'paleta_cores', 'paleta_observacoes']
  },
  {
    title: 'Detalhes Decorativos',
    fields: ['mesa_noivos', 'cartoes_pratos', 'observacoes_cartoes',
      'descricao_mesa_noivos', 'cenario_palco', 'descricao_cenario', 'medidas_espaco']
  },
  {
    title: 'Convidados e Placa',
    fields: ['centros_mesa', 'tipo_flores', 'numero_mesas', 'formato_mesas',
      'lugares_por_mesa', 'observacoes_mesas', 'texto_principal_placa',
      'texto_secundario_placa', 'estilo_placa', 'notas_placa']
  },
  {
    title: 'Logística',
    fields: ['morada_exacta', 'pessoa_abre_espaco', 'contacto_pessoa_abre',
      'acesso_local', 'notas_acesso', 'observacoes_gerais']
  },
]

// Formata um valor para apresentação
const formatValue = (value) => {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '—'
  return String(value)
}

const formatDate = (date) => {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('pt-PT', {
    day: '2-digit', month: 'long', year: 'numeric'
  })
}

// ─── EXCEL: exportar um cliente ───
export const exportClienteExcel = (submission) => {
  const rows = []

  rows.push([`${EMPRESA.designacao} — Questionário do Evento`])
  rows.push([`${submission.nome_noivo} & ${submission.nome_noiva}`])
  rows.push([`Evento: ${formatDate(submission.data_evento)} | Estado: ${submission.status}`])
  rows.push([])

  SECTIONS.forEach((section) => {
    rows.push([section.title.toUpperCase()])
    section.fields.forEach((field) => {
      const value = formatValue(submission[field])
      if (value !== '—') {
        rows.push([FIELD_LABELS[field] || field, value])
      }
    })
    rows.push([])
  })

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 35 }, { wch: 60 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Questionário')

  const filename = `DLM_${submission.nome_noivo}_${submission.nome_noiva}_${submission.data_evento || 'sem-data'}.xlsx`
  XLSX.writeFile(wb, filename)
}

// ─── EXCEL: exportar todos os clientes ───
export const exportTodosExcel = (submissions) => {
  const allFields = Object.keys(FIELD_LABELS)

  const header = allFields.map((f) => FIELD_LABELS[f])
  const rows = submissions.map((s) =>
    allFields.map((f) => formatValue(s[f]))
  )

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
  ws['!cols'] = allFields.map(() => ({ wch: 25 }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Todos os Clientes')

  const today = new Date().toISOString().split('T')[0]
  XLSX.writeFile(wb, `DLM_Todos_Clientes_${today}.xlsx`)
}

// ─── PDF: exportar um cliente ───
export const exportClientePDF = (submission) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const gold = [201, 168, 76]
  const charcoal = [26, 26, 26]
  const gray = [107, 107, 107]
  const goldLight = [232, 213, 163]

  let y = 20

  // Cabeçalho
  doc.setFillColor(...gold)
  doc.rect(0, 0, 210, 14, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(EMPRESA.designacao.toUpperCase(), 14, 9)
  doc.text(TAGLINE_EXPORTS, 210 - 14, 9, { align: 'right' })

  y = 28

  // Título
  doc.setTextColor(...charcoal)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text(`${submission.nome_noivo} & ${submission.nome_noiva}`, 14, y)
  y += 8

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...gray)
  doc.text(`${formatDate(submission.data_evento)} · ${submission.local_evento || 'Local não definido'}`, 14, y)
  y += 5

  // Badge de estado
  doc.setFillColor(...goldLight)
  doc.roundedRect(14, y, 40, 6, 2, 2, 'F')
  doc.setTextColor(...charcoal)
  doc.setFontSize(8)
  doc.text(submission.status || 'Recebido', 34, y + 4, { align: 'center' })
  y += 14

  // Linha separadora
  doc.setDrawColor(...goldLight)
  doc.setLineWidth(0.5)
  doc.line(14, y, 196, y)
  y += 8

  // Secções
  SECTIONS.forEach((section) => {
    const tableData = section.fields
      .filter((field) => {
        const value = formatValue(submission[field])
        return value !== '—'
      })
      .map((field) => [FIELD_LABELS[field] || field, formatValue(submission[field])])

    if (tableData.length === 0) return

    // Título da secção
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...gold)
    doc.text(section.title.toUpperCase(), 14, y)
    y += 2

    autoTable(doc, {
      startY: y,
      head: [],
      body: tableData,
      theme: 'plain',
      styles: {
        fontSize: 9,
        cellPadding: { top: 3, right: 6, bottom: 3, left: 4 },
        textColor: charcoal,
        lineColor: [240, 240, 240],
        lineWidth: 0.3,
      },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 60, textColor: gray },
        1: { cellWidth: 'auto' },
      },
      margin: { left: 14, right: 14 },
      didDrawPage: () => {},
    })

    y = doc.lastAutoTable.finalY + 8

    if (y > 270) {
      doc.addPage()
      y = 20
    }
  })

  // Rodapé em cada página
  const totalPages = doc.internal.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(...goldLight)
    doc.text(
      `${EMPRESA.designacao} · Página ${i} de ${totalPages}`,
      105, 290, { align: 'center' }
    )
  }

  const filename = `DLM_${submission.nome_noivo}_${submission.nome_noiva}_${submission.data_evento || 'sem-data'}.pdf`
  doc.save(filename)
}