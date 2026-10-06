import { describe, it, expect } from 'vitest'
import { fileNameFor } from '../pdfService'

describe('download file naming', () => {
  it('leads with the project name so files sort correctly off-system', () => {
    expect(fileNameFor({ name: 'Extension of ARI' }, 'N-001')).toBe('Extension-of-ARI-N-001.pdf')
  })

  it('accepts a bare project name too', () => {
    expect(fileNameFor('M25 Motorway', 'CE-Summary')).toBe('M25-Motorway-CE-Summary.pdf')
  })

  it('strips characters that break file systems', () => {
    expect(fileNameFor({ name: 'A/B: "Phase" 2?' }, 'EW-001')).toBe('AB-Phase-2-EW-001.pdf')
  })

  it('collapses runs of whitespace into single hyphens', () => {
    expect(fileNameFor({ name: '  Deep   Space  ' }, 'R-1')).toBe('Deep-Space-R-1.pdf')
  })

  it('honours a custom extension', () => {
    expect(fileNameFor({ name: 'Site A' }, 'Risk-Register', 'xlsx')).toBe('Site-A-Risk-Register.xlsx')
  })

  it('falls back to "Project" when the name is empty', () => {
    expect(fileNameFor({ name: '' }, 'N-001')).toBe('Project-N-001.pdf')
  })

  it('truncates very long project names so the filename stays usable', () => {
    const long = 'A'.repeat(120)
    const out = fileNameFor({ name: long }, 'N-001')
    expect(out.startsWith('A'.repeat(60))).toBe(true)
    expect(out.endsWith('-N-001.pdf')).toBe(true)
  })
})
