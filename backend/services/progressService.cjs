function toggleSubjectProgress(user, payload, curriculumCatalog) {
  const { courseId, subjectId, completed } = payload;
  const curriculum = curriculumCatalog.getSelectedCourse(user, courseId);
  const targetSubject = curriculum.subjectMap.get(subjectId);

  if (!targetSubject) {
    return {
      status: 404,
      error: 'Disciplina nao encontrada.',
    };
  }

  const currentProgress = new Set(user.progress?.[curriculum.id] || []);

  if (completed) {
    const prerequisitesReady = targetSubject.prerequisites.every((prerequisiteId) => currentProgress.has(prerequisiteId));

    if (!prerequisitesReady) {
      return {
        status: 400,
        error: 'Pre-requisitos ainda nao concluidos.',
      };
    }

    currentProgress.add(subjectId);
  } else {
    const dependentCompleted = curriculum.dependentMap.get(subjectId)
      .filter((dependentId) => currentProgress.has(dependentId));

    if (dependentCompleted.length > 0) {
      return {
        status: 400,
        error: `Nao e possivel desfazer esta disciplina enquanto ${dependentCompleted.join(', ')} estiver concluida.`,
      };
    }

    currentProgress.delete(subjectId);
  }

  return {
    status: 200,
    courseId: curriculum.id,
    progress: Array.from(currentProgress),
  };
}

module.exports = {
  toggleSubjectProgress,
};
