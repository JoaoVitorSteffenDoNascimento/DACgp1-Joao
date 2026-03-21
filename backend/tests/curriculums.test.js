// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const curriculums = require('../data/curriculums.cjs')

describe('curriculums data', () => {
  it('mantem estrutura consistente para todos os cursos e disciplinas', () => {
    for (const curriculum of Object.values(curriculums)) {
      expect(curriculum).toEqual(expect.objectContaining({
        id: expect.any(String),
        code: expect.any(String),
        name: expect.any(String),
        trailLabels: expect.any(Array),
        subjects: expect.any(Array),
      }))

      const subjectIds = new Set(curriculum.subjects.map((subject) => subject.id))
      expect(subjectIds.size).toBe(curriculum.subjects.length)

      for (const subject of curriculum.subjects) {
        expect(subject).toEqual(expect.objectContaining({
          id: expect.any(String),
          name: expect.any(String),
          semester: expect.any(Number),
          trail: expect.any(String),
          prerequisites: expect.any(Array),
          corequisites: expect.any(Array),
        }))

        for (const prerequisiteId of subject.prerequisites) {
          expect(subjectIds.has(prerequisiteId)).toBe(true)
        }

        for (const corequisiteId of subject.corequisites) {
          expect(subjectIds.has(corequisiteId)).toBe(true)
        }
      }
    }
  })
})
