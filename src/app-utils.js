export const statusLabels = { completed: 'Concluída', available: 'Disponível', locked: 'Bloqueada' };
export const statusOrder = { completed: 0, available: 1, locked: 2 };
export const pageLabels = {
  overview: 'Visão geral',
  board: 'Quadro de cadeiras',
  curriculum: 'Currículo',
  analytics: 'Análises',
  settings: 'Configurações',
};
export const themeOptions = [
  { id: 'brand', label: 'Verde' },
  { id: 'dark', label: 'Dark' },
  { id: 'white', label: 'White' },
];
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const getDefaultUsername = (name) => String(name || '').trim().split(/\s+/)[0]?.toLowerCase() || 'usuario';

export const getInitialForm = () => ({ name: '', registration: '', email: '', password: '', courseId: 'cc' });

export const getSettingsForm = (user, themeOverride = '') => ({
  name: user?.name || '',
  username: user?.username || getDefaultUsername(user?.name),
  email: user?.email || '',
  courseId: user?.courseId || 'cc',
  avatarUrl: user?.avatarUrl || '',
  theme: themeOverride || user?.preferences?.theme || 'brand',
});

export const normalizeSettingsForCompare = (form) => ({
  name: String(form?.name || '').trim(),
  username: String(form?.username || '').trim(),
  email: String(form?.email || '').trim().toLowerCase(),
  avatarUrl: String(form?.avatarUrl || '').trim(),
  theme: String(form?.theme || 'brand'),
});

export const normalizeRegistration = (value) => value.replace(/\D/g, '').slice(0, 10);

export function formatRegistration(value) {
  const digits = normalizeRegistration(value);
  return digits.length <= 4 ? digits : `${digits.slice(0, 4)} ${digits.slice(4)}`;
}

export function validateAuthForm(authMode, form) {
  const registration = normalizeRegistration(form.registration);
  if (authMode === 'register' && form.name.trim().length < 3) return 'Informe um nome válido.';
  if (registration.length !== 10) return 'A matrícula deve ter 10 dígitos.';
  if (authMode === 'register' && !EMAIL_PATTERN.test(form.email.trim())) return 'Informe um e-mail válido.';
  if (form.password.trim().length < 4) return 'A senha deve ter pelo menos 4 caracteres.';
  return '';
}

export function validateSettingsForm(form) {
  if (form.name.trim().length < 3) return 'Informe um nome válido.';
  if (form.username.trim().length < 3) return 'O nome de usuário deve ter pelo menos 3 caracteres.';
  if (!EMAIL_PATTERN.test(form.email.trim())) return 'Informe um e-mail válido.';
  if (!themeOptions.some((option) => option.id === form.theme)) return 'Tema inválido.';
  return '';
}

export const groupBySemester = (subjects) => subjects.reduce((groups, subject) => {
  const key = String(subject.semester);
  if (!groups[key]) groups[key] = [];
  groups[key].push(subject);
  return groups;
}, {});

export const getNextSubjects = (subjects) => subjects.filter((subject) => subject.status === 'available').slice(0, 4);
export const getCriticalSubjects = (subjects) => subjects.filter((subject) => subject.isCritical);
export const getTrailSummary = (subjects) => Object.entries(subjects.reduce((accumulator, subject) => {
  if (!accumulator[subject.trail]) accumulator[subject.trail] = { total: 0, completed: 0 };
  accumulator[subject.trail].total += 1;
  if (subject.status === 'completed') accumulator[subject.trail].completed += 1;
  return accumulator;
}, {})).map(([trail, values]) => ({
  trail,
  total: values.total,
  completed: values.completed,
  completionRate: values.total === 0 ? 0 : Math.round((values.completed / values.total) * 100),
}));

export const boardMetrics = {
  headerHeight: 74,
  labelColumnWidth: 154,
  columnWidth: 238,
  cellPaddingX: 34,
  cellPaddingY: 14,
  cardHeight: 98,
  cardGap: 12,
  rowGap: 24,
};

export function getTrailSlug(trail) {
  return String(trail || 'base')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'base';
}

export function getTrailOrder(subjects, trailLabels = []) {
  const uniqueTrails = [...new Set(subjects.map((subject) => subject.trail))];
  const preferredOrder = ['Base', ...trailLabels];
  const ordered = preferredOrder.filter((trail) => uniqueTrails.includes(trail));
  const remaining = uniqueTrails.filter((trail) => !ordered.includes(trail)).sort();
  return [...ordered, ...remaining];
}

export function buildBoardLayout(subjects, trailOrder, semesters) {
  const cellSubjects = new Map();

  subjects.forEach((subject) => {
    const key = `${subject.trail}::${subject.semester}`;
    if (!cellSubjects.has(key)) {
      cellSubjects.set(key, []);
    }
    cellSubjects.get(key).push(subject);
  });

  cellSubjects.forEach((items) => {
    items.sort((first, second) => {
      if (statusOrder[first.status] !== statusOrder[second.status]) {
        return statusOrder[first.status] - statusOrder[second.status];
      }
      return first.id.localeCompare(second.id);
    });
  });

  const rowMeta = [];
  let currentY = boardMetrics.headerHeight;

  trailOrder.forEach((trail) => {
    const maxStack = Math.max(
      1,
      ...semesters.map((semester) => (cellSubjects.get(`${trail}::${semester}`) || []).length),
    );
    const rowHeight = (maxStack * boardMetrics.cardHeight)
      + ((maxStack - 1) * boardMetrics.cardGap)
      + (boardMetrics.cellPaddingY * 2);
    rowMeta.push({ trail, y: currentY, height: rowHeight });
    currentY += rowHeight + boardMetrics.rowGap;
  });

  const placements = new Map();

  rowMeta.forEach((row) => {
    semesters.forEach((semester, columnIndex) => {
      const cellKey = `${row.trail}::${semester}`;
      const items = cellSubjects.get(cellKey) || [];
      items.forEach((subject, index) => {
        placements.set(subject.id, {
          x: boardMetrics.labelColumnWidth + (columnIndex * boardMetrics.columnWidth) + boardMetrics.cellPaddingX,
          y: row.y + boardMetrics.cellPaddingY + (index * (boardMetrics.cardHeight + boardMetrics.cardGap)),
          width: boardMetrics.columnWidth - (boardMetrics.cellPaddingX * 2),
          height: boardMetrics.cardHeight,
        });
      });
    });
  });

  return {
    rowMeta,
    placements,
    width: boardMetrics.labelColumnWidth + (semesters.length * boardMetrics.columnWidth),
    height: Math.max(boardMetrics.headerHeight, currentY - boardMetrics.rowGap),
  };
}

function countRemainingChain(subjectId, pendingIds, subjectMap, memo = new Map()) {
  if (memo.has(subjectId)) {
    return memo.get(subjectId);
  }

  const subject = subjectMap.get(subjectId);
  const pendingPrerequisites = subject.prerequisites.filter((prerequisiteId) => pendingIds.has(prerequisiteId));

  if (pendingPrerequisites.length === 0) {
    memo.set(subjectId, 1);
    return 1;
  }

  const depth = 1 + Math.max(...pendingPrerequisites.map((prerequisiteId) => (
    countRemainingChain(prerequisiteId, pendingIds, subjectMap, memo)
  )));

  memo.set(subjectId, depth);
  return depth;
}

function buildDependentMap(subjects) {
  const dependentMap = new Map(subjects.map((subject) => [subject.id, []]));

  subjects.forEach((subject) => {
    subject.prerequisites.forEach((prerequisiteId) => {
      if (!dependentMap.has(prerequisiteId)) {
        dependentMap.set(prerequisiteId, []);
      }

      dependentMap.get(prerequisiteId).push(subject.id);
    });
  });

  return dependentMap;
}

function sortSubjects(subjects) {
  return [...subjects].sort((first, second) => {
    if (first.semester !== second.semester) {
      return first.semester - second.semester;
    }

    if (statusOrder[first.status] !== statusOrder[second.status]) {
      return statusOrder[first.status] - statusOrder[second.status];
    }

    return first.id.localeCompare(second.id);
  });
}

export function buildOptimisticMapData(mapData, subjectId, shouldComplete) {
  const subjectMap = new Map(mapData.subjects.map((subject) => [subject.id, subject]));
  const completedIds = new Set(
    mapData.subjects
      .filter((subject) => subject.status === 'completed')
      .map((subject) => subject.id),
  );

  if (!subjectMap.has(subjectId)) {
    return mapData;
  }

  if (shouldComplete) {
    completedIds.add(subjectId);
  } else {
    completedIds.delete(subjectId);
  }

  let completedCount = 0;
  let availableCount = 0;

  const subjects = sortSubjects(mapData.subjects.map((subject) => {
    const allPrerequisitesDone = subject.prerequisites.every((prerequisiteId) => completedIds.has(prerequisiteId));
    const status = completedIds.has(subject.id)
      ? 'completed'
      : allPrerequisitesDone
        ? 'available'
        : 'locked';

    if (status === 'completed') {
      completedCount += 1;
    } else if (status === 'available') {
      availableCount += 1;
    }

    return {
      ...subject,
      status,
    };
  }));

  const pendingIds = new Set(subjects.filter((subject) => subject.status !== 'completed').map((subject) => subject.id));
  const totalSubjects = subjects.length;
  const remainingCriticalSemesters = pendingIds.size === 0
    ? 0
    : Math.max(...Array.from(pendingIds, (pendingId) => countRemainingChain(pendingId, pendingIds, subjectMap)));

  return {
    ...mapData,
    stats: {
      ...mapData.stats,
      totalSubjects,
      completedCount,
      availableCount,
      lockedCount: totalSubjects - completedCount - availableCount,
      completionRate: totalSubjects === 0 ? 0 : Math.round((completedCount / totalSubjects) * 100),
      remainingCriticalSemesters,
    },
    subjects,
  };
}

export function canOptimisticallyToggleSubject(mapData, subject) {
  if (!mapData || !subject || subject.status === 'locked') {
    return { allowed: false, error: 'Disciplina bloqueada.' };
  }

  const dependentMap = buildDependentMap(mapData.subjects);
  const completedIds = new Set(
    mapData.subjects
      .filter((item) => item.status === 'completed')
      .map((item) => item.id),
  );

  if (subject.status !== 'completed') {
    const prerequisitesReady = subject.prerequisites.every((prerequisiteId) => completedIds.has(prerequisiteId));

    return prerequisitesReady
      ? { allowed: true }
      : { allowed: false, error: 'Pre-requisitos ainda nao concluidos.' };
  }

  const completedDependents = (dependentMap.get(subject.id) || []).filter((dependentId) => completedIds.has(dependentId));

  if (completedDependents.length > 0) {
    return {
      allowed: false,
      error: `Nao e possivel desfazer esta disciplina enquanto ${completedDependents.join(', ')} estiver concluida.`,
    };
  }

  return { allowed: true };
}

export function buildBoardModel(mapData) {
  const semesters = [...new Set(mapData.subjects.map((subject) => subject.semester))].sort((a, b) => a - b);
  const trailOrder = getTrailOrder(mapData.subjects, mapData.course.trailLabels);
  const layout = buildBoardLayout(mapData.subjects, trailOrder, semesters);
  const edges = [];

  mapData.subjects.forEach((subject) => {
    const to = layout.placements.get(subject.id);

    if (!to) {
      return;
    }

    subject.prerequisites.forEach((prerequisiteId) => {
      const from = layout.placements.get(prerequisiteId);

      if (from) {
        edges.push({
          id: `${prerequisiteId}-${subject.id}`,
          type: 'prerequisite',
          from,
          to,
        });
      }
    });

    subject.corequisites
      .filter((corequisiteId) => subject.id.localeCompare(corequisiteId) < 0)
      .forEach((corequisiteId) => {
        const from = layout.placements.get(corequisiteId);

        if (from) {
          edges.push({
            id: `${subject.id}-${corequisiteId}`,
            type: 'corequisite',
            from: to,
            to: from,
          });
        }
      });
  });

  return {
    semesters,
    trailOrder,
    layout,
    edges,
  };
}

export function getBoardConnectorPath(source, target) {
  const startX = source.x + source.width;
  const startY = source.y + (source.height / 2);
  const endX = target.x;
  const endY = target.y + (target.height / 2);
  const controlOffset = Math.max(34, (endX - startX) * 0.45);

  return `M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${endX - controlOffset} ${endY}, ${endX} ${endY}`;
}

export function getInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.length === 0 ? 'CM' : parts.map((part) => part[0].toUpperCase()).join('');
}
