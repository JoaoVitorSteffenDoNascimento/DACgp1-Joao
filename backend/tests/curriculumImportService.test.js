// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { parseCurriculumSource } = require('../services/curriculumImportService.cjs')

describe('curriculum import service', () => {
  it('normaliza metadados de versao e remove referencias invalidas', async () => {
    const curriculum = await parseCurriculumSource({
      fileName: 'cc-2024.json',
      sourceText: JSON.stringify({
        code: 'CC',
        name: 'Ciencia da Computacao 2024',
        academicYear: 2024,
        versionLabel: 'Matriz 2024',
        subjects: [
          { id: 'CC101', name: 'Algoritmos I', semester: 1, trail: 'Base', prerequisites: [], corequisites: [] },
          { id: 'CC201', name: 'Algoritmos II', semester: 2, trail: 'Base', prerequisites: ['CC101', 'INEXISTE'], corequisites: ['CC201'] },
        ],
      }),
    })

    expect(curriculum.id).toBe('cc-2024')
    expect(curriculum.catalogKey).toBe('cc')
    expect(curriculum.name).toBe('Ciencia da Computacao')
    expect(curriculum.academicYear).toBe(2024)
    expect(curriculum.versionLabel).toBe('Matriz 2024')
    expect(curriculum.subjects[1].prerequisites).toEqual(['CC101'])
    expect(curriculum.subjects[1].corequisites).toEqual([])
  })

  it('aceita DOCX extraindo texto antes da normalizacao', async () => {
    const docxTextExtractor = vi.fn().mockResolvedValue([
      'id,name,semester,trail,prerequisites,corequisites',
      'ADS101,Algoritmos,1,Base,,',
      'ADS201,APIs Web,2,Backend,ADS101,',
    ].join('\n'))

    const curriculum = await parseCurriculumSource(
      {
        fileData: 'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,RG9jeA==',
        fileName: 'ads-2025.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
      { docxTextExtractor },
    )

    expect(docxTextExtractor).toHaveBeenCalledTimes(1)
    expect(curriculum.baseCode).toBe('IMPORTADA')
    expect(curriculum.subjects).toHaveLength(2)
    expect(curriculum.subjects[1].prerequisites).toEqual(['ADS101'])
  })

  it('usa OCR + chat da Mistral para estruturar PDF', async () => {
    const mistralClient = {
      ocrProcess: vi.fn().mockResolvedValue({
        pages: [
          {
            markdown: '# Sistemas de Informacao 2023\nSI101 Fundamentos 1\nSI201 Modelagem 2 prerequisito SI101',
          },
        ],
      }),
      chatComplete: vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                code: 'SI',
                name: 'Sistemas de Informacao 2023',
                academicYear: 2023,
                subjects: [
                  { id: 'SI101', name: 'Fundamentos', semester: 1, trail: 'Base', prerequisites: [], corequisites: [] },
                  { id: 'SI201', name: 'Modelagem', semester: 2, trail: 'Analista', prerequisites: ['SI101'], corequisites: [] },
                ],
                trailLabels: ['Analista'],
              }),
            },
          },
        ],
      }),
    }

    const curriculum = await parseCurriculumSource(
      {
        fileData: 'data:application/pdf;base64,JVBERi0x',
        fileName: 'si-2023.pdf',
        mimeType: 'application/pdf',
        mistralApiKey: 'test-key',
        mistralModel: 'mistral-small-latest',
        mistralOcrModel: 'mistral-ocr-latest',
      },
      { mistralClient },
    )

    expect(mistralClient.ocrProcess).toHaveBeenCalledTimes(1)
    expect(mistralClient.chatComplete).toHaveBeenCalledTimes(1)
    expect(mistralClient.ocrProcess.mock.calls[0][0].document.document_url).toContain('data:application/pdf;base64,')
    expect(curriculum.catalogKey).toBe('si')
    expect(curriculum.academicYear).toBe(2023)
    expect(curriculum.subjects[1].prerequisites).toEqual(['SI101'])
  })

  it('usa fallback heuristico quando a Mistral nao retorna subjects validos', async () => {
    const mistralClient = {
      ocrProcess: vi.fn().mockResolvedValue({
        pages: [
          {
            markdown: [
              '# Ciencia da Computacao 2021',
              '1o Semestre',
              'CC101 Algoritmos I',
              'CC102 Logica Matematica',
              '2o Semestre',
              'CC201 Estruturas de Dados Pre-requisito: CC101',
              'CC202 Arquitetura de Computadores Correquisito: CC201',
            ].join('\n'),
          },
        ],
      }),
      chatComplete: vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                code: 'CC',
                name: 'Ciencia da Computacao 2021',
                academicYear: 2021,
                trailLabels: [],
                subjects: [],
              }),
            },
          },
        ],
      }),
    }

    const curriculum = await parseCurriculumSource(
      {
        fileData: 'data:application/pdf;base64,JVBERi0x',
        fileName: 'cc-2021.pdf',
        mimeType: 'application/pdf',
        mistralApiKey: 'test-key',
      },
      { mistralClient },
    )

    expect(curriculum.name).toBe('Ciencia da Computacao')
    expect(curriculum.subjects).toHaveLength(4)
    expect(curriculum.subjects.find((subject) => subject.id === 'CC201')?.prerequisites).toEqual(['CC101'])
    expect(curriculum.subjects.find((subject) => subject.id === 'CC202')?.corequisites).toEqual(['CC201'])
  })

  it('interpreta linhas de tabela markdown no fallback heuristico', async () => {
    const mistralClient = {
      ocrProcess: vi.fn().mockResolvedValue({
        pages: [
          {
            markdown: [
              '| Semestre | Codigo | Disciplina | Pre-requisito | Correquisito |',
              '| --- | --- | --- | --- | --- |',
              '| 1o Semestre | SI101 | Fundamentos de SI |  |  |',
              '| 2o Semestre | SI201 | Analise de Requisitos | SI101 |  |',
              '| 2o Semestre | SI202 | Projeto Integrador |  | SI201 |',
            ].join('\n'),
          },
        ],
      }),
      chatComplete: vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                code: 'SI',
                name: 'Sistemas de Informacao',
                subjects: [],
                trailLabels: [],
              }),
            },
          },
        ],
      }),
    }

    const curriculum = await parseCurriculumSource(
      {
        fileData: 'data:application/pdf;base64,JVBERi0x',
        fileName: 'si.pdf',
        mimeType: 'application/pdf',
        mistralApiKey: 'test-key',
      },
      { mistralClient },
    )

    expect(curriculum.subjects).toHaveLength(3)
    expect(curriculum.subjects.find((subject) => subject.id === 'SI201')?.semester).toBe(2)
    expect(curriculum.subjects.find((subject) => subject.id === 'SI201')?.prerequisites).toEqual(['SI101'])
    expect(curriculum.subjects.find((subject) => subject.id === 'SI202')?.corequisites).toEqual(['SI201'])
  })
})
