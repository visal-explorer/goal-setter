/* =========================================================
   app.js — user actions, event wiring and start-up
   ========================================================= */

/* ---------- Commit helpers ---------- */
/** Save + re-render after any data change. */
function commit() {
  if (!save()) showToast('⚠️ Could not save — browser storage is full or blocked.');
  render();
}

/** Snapshot the data so a destructive action can be undone from the toast. */
function withUndo(message, mutate) {
  const snapshot = JSON.stringify(state);
  mutate();
  commit();
  showToast(message, {
    label: 'Undo',
    run: () => { state = normalizeData(JSON.parse(snapshot)); applyAccent(); commit(); showToast('Restored ↩️'); }
  });
}

function switchView(name) {
  view.current = name;
  view.openMenu = null;
  try { localStorage.setItem(VIEW_KEY, name); } catch (e) {}
  render();
  window.scrollTo({ top: Math.min(scrollY, $('.tabs').offsetTop), behavior: 'smooth' });
}

/* =========================================================
   GOAL FORM (add / edit / templates)
   ========================================================= */
let editingGoalId = null;
let templateTasks = null; // tasks to create when saving a goal started from a template

function setEmoji(e) {
  $('#goalForm').elements.emoji.value = e;
  $$('#emojiPick button').forEach(b => b.classList.toggle('selected', b.dataset.emoji === e));
}

function openGoalForm(goal = null) {
  const form = $('#goalForm');
  form.reset();
  editingGoalId = goal ? goal.id : null;
  templateTasks = null;
  $('#goalModalTitle').textContent = goal ? 'Edit goal' : 'New goal';
  $('#templateBox').classList.toggle('hidden', !!goal);
  $('#templateNote').classList.add('hidden');
  const v = goal || { title: '', description: '', why: '', category: 'Personal Growth', priority: 'Medium', level: 'Short-term', targetDate: '', emoji: '🎯' };
  for (const key of ['title', 'description', 'why', 'category', 'priority', 'level', 'targetDate']) form.elements[key].value = v[key];
  setEmoji(v.emoji || CATEGORY_EMOJI[v.category]);
  openModal('goalModal');
}

function applyTemplate(i) {
  const tpl = TEMPLATES[i];
  const form = $('#goalForm');
  form.elements.title.value = tpl.name;
  form.elements.description.value = tpl.description;
  form.elements.why.value = tpl.why;
  form.elements.category.value = tpl.category;
  form.elements.priority.value = tpl.priority;
  form.elements.level.value = tpl.level;
  form.elements.targetDate.value = tpl.days == null ? '' : addDays(today(), tpl.days);
  setEmoji(tpl.emoji);
  templateTasks = tpl.tasks;
  const note = $('#templateNote');
  note.textContent = `✨ ${tpl.tasks.length} starter tasks will be added: ${tpl.tasks.map(t => t[0]).join(' · ')}`;
  note.classList.remove('hidden');
}

function saveGoalFromForm(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const data = {
    title: fd.get('title').trim(),
    emoji: fd.get('emoji'),
    description: fd.get('description').trim(),
    why: fd.get('why').trim(),
    category: fd.get('category'),
    priority: fd.get('priority'),
    level: fd.get('level'),
    targetDate: fd.get('targetDate')
  };
  if (!data.title) return;

  if (editingGoalId) {
    Object.assign(findGoal(editingGoalId), data);
    showToast('Goal updated');
  } else {
    const tasks = (templateTasks || []).map(([title, due, recur]) =>
      makeTask(title, due == null ? '' : addDays(today(), due), recur || ''));
    state.goals.push({
      id: uid(), createdAt: Date.now(), completedAt: '', open: true, pinned: false, archived: false, extraFocus: 0,
      tasks, ...data
    });
    showToast('Goal added 🎉');
    if (view.current !== 'goals') view.current = 'goals';
  }
  closeModal('goalModal');
  commit();
}

/* =========================================================
   TASK ACTIONS
   ========================================================= */
let editingTask = null;

function addTask(form) {
  const goal = findGoal(form.closest('[data-goal]').dataset.goal);
  const title = form.elements.title.value.trim();
  if (!goal || !title) return;
  goal.tasks.push(makeTask(title, form.elements.dueDate.value, form.elements.recur.value));
  if (goal.completedAt) goal.completedAt = '';
  commit();
  // Keep focus in the input so several tasks can be added quickly
  $(`[data-goal="${CSS.escape(goal.id)}"] .add-task input[name="title"]`)?.focus();
}

function toggleTask(goal, task, done) {
  const wasComplete = isGoalComplete(goal);
  task.done = done;
  recordCompletion(task, done);

  // Recurring tasks: completing one schedules the next occurrence
  if (done && task.recur && !task.spawnedId) {
    const next = makeTask(task.title, nextOccurrence(task.dueDate, task.recur), task.recur, task.notes);
    goal.tasks.splice(goal.tasks.indexOf(task) + 1, 0, next);
    task.spawnedId = next.id;
  } else if (!done && task.spawnedId) {
    // Unchecking: remove the occurrence we created, if it hasn't been touched
    const spawned = goal.tasks.find(t => t.id === task.spawnedId);
    if (spawned && !spawned.done) goal.tasks = goal.tasks.filter(t => t !== spawned);
    task.spawnedId = '';
  }

  const nowComplete = isGoalComplete(goal);
  goal.completedAt = nowComplete ? (goal.completedAt || today()) : '';
  commit();

  if (!wasComplete && nowComplete) {
    celebrate();
    showToast(`🏆 “${goal.title}” completed! Amazing work!`);
  } else if (done) {
    const streak = currentStreak();
    showToast(task.recur ? `Done ✅ Next one scheduled for ${relativeDate(goal.tasks.find(t => t.id === task.spawnedId)?.dueDate || today())}`
      : streak > 1 ? `Nice! 🔥 ${streak}-day streak` : 'Nice! Task done ✅');
  }
}

function openTaskForm(goal, task) {
  editingTask = { goalId: goal.id, taskId: task.id };
  const form = $('#taskForm');
  form.elements.title.value = task.title;
  form.elements.dueDate.value = task.dueDate;
  form.elements.recur.value = task.recur;
  form.elements.notes.value = task.notes;
  openModal('taskModal');
}

function saveTaskFromForm(e) {
  e.preventDefault();
  const task = editingTask && findTask(editingTask.goalId, editingTask.taskId);
  if (!task) return closeModal('taskModal');
  const fd = new FormData(e.target);
  const title = fd.get('title').trim();
  if (!title) return;
  Object.assign(task, { title, dueDate: fd.get('dueDate'), recur: fd.get('recur'), notes: fd.get('notes').trim() });
  closeModal('taskModal');
  commit();
  showToast('Task updated');
}

/* =========================================================
   CENTRAL CLICK HANDLER (event delegation for the whole app)
   ========================================================= */
function onClick(e) {
  // Close an open goal menu when clicking anywhere outside it
  if (view.openMenu && !e.target.closest('.menu-wrap')) {
    view.openMenu = null;
    if (view.current === 'goals') renderGoals();
    if (!e.target.closest('[data-action]')) return;
  }

  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;

  // Context: which goal / task was clicked (if any)
  const goalEl = el.closest('[data-goal]') || (el.dataset.goal ? el : null);
  const goal = goalEl ? findGoal(goalEl.dataset.goal) : null;
  const taskEl = el.closest('[data-task]');
  const task = goal && taskEl ? goal.tasks.find(t => t.id === taskEl.dataset.task) : null;

  switch (action) {
    /* --- App-level --- */
    case 'toggle-theme': return toggleTheme();
    case 'open-settings': return openSettings();
    case 'open-shortcuts': closeModal('settingsModal'); return openModal('shortcutsModal');
    case 'export-json': return exportJSON();
    case 'export-csv': return exportCSV();
    case 'import': return $('#importFile').click();
    case 'load-sample': return loadSample();
    case 'reset-all': return resetAll();
    case 'add-goal': return openGoalForm();
    case 'clear-filters': return clearFilters();
    case 'goto': return switchView(el.dataset.view);
    case 'template': return applyTemplate(Number(el.dataset.index));
    case 'pick-emoji': return setEmoji(el.dataset.emoji);
    case 'accent':
      state.settings.accent = el.dataset.color;
      applyAccent(); save(); renderSwatches();
      return;

    /* --- Timer --- */
    case 'timer-toggle': return toggleTimer();
    case 'timer-skip': return skipRound();
    case 'timer-stop': return stopTimer();

    /* --- Calendar --- */
    case 'cal-prev':
    case 'cal-next': {
      const [y, m] = view.calMonth.split('-').map(Number);
      view.calMonth = dateKey(new Date(y, m - 1 + (action === 'cal-next' ? 1 : -1), 1)).slice(0, 7);
      return renderCalendar();
    }
    case 'cal-today':
      view.calMonth = today().slice(0, 7);
      view.calSelected = today();
      return renderCalendar();
    case 'cal-select':
      view.calSelected = el.dataset.date;
      view.calMonth = el.dataset.date.slice(0, 7);
      return renderCalendar();
  }

  if (!goal) return;

  switch (action) {
    /* --- Goal actions --- */
    case 'toggle-goal':
      goal.open = !goalEl.classList.contains('open');
      return commit();
    case 'open-goal':
      clearFilters(false);
      goal.open = true;
      if (goal.archived) $('#fStatus').value = 'archived';
      switchView('goals');
      save();
      setTimeout(() => $(`.goal[data-goal="${CSS.escape(goal.id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
      return;
    case 'goal-menu':
      view.openMenu = view.openMenu === goal.id ? null : goal.id;
      return renderGoals();
    case 'edit-goal':
      view.openMenu = null;
      return openGoalForm(goal);
    case 'pin-goal':
      view.openMenu = null;
      goal.pinned = !goal.pinned;
      commit();
      return showToast(goal.pinned ? '📌 Pinned to top' : 'Unpinned');
    case 'archive-goal':
      view.openMenu = null;
      return withUndo(goal.archived ? 'Goal restored from archive' : '🗄️ Goal archived', () => { goal.archived = !goal.archived; });
    case 'duplicate-goal': {
      view.openMenu = null;
      const copy = JSON.parse(JSON.stringify(goal));
      Object.assign(copy, { id: uid(), title: goal.title + ' (copy)', createdAt: Date.now(), completedAt: '', pinned: false, archived: false, extraFocus: 0 });
      copy.tasks = copy.tasks.map(t => ({ ...makeTask(t.title, t.dueDate, t.recur, t.notes) }));
      state.goals.push(copy);
      commit();
      return showToast('Goal duplicated');
    }
    case 'focus-goal':
      view.openMenu = null;
      requestNotifyPermission();
      return startFocus(goal.id, nextTask(goal)?.id || '');
    case 'delete-goal':
      view.openMenu = null;
      renderGoals();
      return confirmDialog('Delete this goal?',
        `“${goal.title}” and its ${goal.tasks.length} task(s) will be removed.`,
        () => withUndo('Goal deleted', () => { state.goals = state.goals.filter(g => g !== goal); }));
    case 'clear-done': {
      const n = goal.tasks.filter(t => t.done).length;
      return confirmDialog('Clear completed tasks?', `${n} completed task(s) will be removed from “${goal.title}”. Your streak history is kept.`,
        () => withUndo(`${n} task(s) cleared`, () => { goal.tasks = goal.tasks.filter(t => !t.done); }), 'Clear');
    }
  }

  if (!task) return;

  switch (action) {
    /* --- Task actions --- */
    case 'toggle-task': return toggleTask(goal, task, el.checked);
    case 'edit-task': return openTaskForm(goal, task);
    case 'focus-task':
      requestNotifyPermission();
      return startFocus(goal.id, task.id);
    case 'delete-task':
      return confirmDialog('Delete this task?', `“${task.title}” will be removed.`,
        () => withUndo('Task deleted', () => { goal.tasks = goal.tasks.filter(t => t !== task); }));
  }
}

function clearFilters(rerender = true) {
  ['search', 'fCategory', 'fPriority', 'fLevel', 'fStatus'].forEach(id => { $('#' + id).value = ''; });
  if (rerender) renderGoals();
}

function requestNotifyPermission() {
  try {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  } catch (e) {}
}

/* =========================================================
   DRAG & DROP TASK REORDERING (pointer events: mouse + touch)
   ========================================================= */
function initDragReorder() {
  let drag = null; // { li, list, goal, target, after }

  document.addEventListener('pointerdown', e => {
    const handle = e.target.closest('[data-drag]');
    if (!handle) return;
    e.preventDefault();
    const li = handle.closest('.task');
    drag = { li, list: li.parentElement, goal: findGoal(li.dataset.goal), target: null, after: false };
    li.classList.add('dragging');
    handle.setPointerCapture(e.pointerId);
  });

  document.addEventListener('pointermove', e => {
    if (!drag) return;
    $$('.drop-before, .drop-after', drag.list).forEach(el => el.classList.remove('drop-before', 'drop-after'));
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.task');
    if (!over || over === drag.li || over.parentElement !== drag.list) { drag.target = null; return; }
    const r = over.getBoundingClientRect();
    drag.after = e.clientY > r.top + r.height / 2;
    drag.target = over;
    over.classList.add(drag.after ? 'drop-after' : 'drop-before');
  });

  const end = () => {
    if (!drag) return;
    const { li, goal, target, after } = drag;
    li.classList.remove('dragging');
    $$('.drop-before, .drop-after').forEach(el => el.classList.remove('drop-before', 'drop-after'));
    drag = null;
    if (!target || !goal) return;
    const moving = goal.tasks.find(t => t.id === li.dataset.task);
    goal.tasks = goal.tasks.filter(t => t !== moving);
    const idx = goal.tasks.findIndex(t => t.id === target.dataset.task);
    goal.tasks.splice(after ? idx + 1 : idx, 0, moving);
    commit();
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
}

/* =========================================================
   EXPORT / IMPORT / SAMPLE / RESET
   ========================================================= */
function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportJSON() {
  const payload = { app: 'goal-planner', version: 2, exportedAt: new Date().toISOString(), ...state };
  download(`goal-planner-${today()}.json`, JSON.stringify(payload, null, 2), 'application/json');
  showToast('Backup downloaded ⬇️');
}

function exportCSV() {
  const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Goal', 'Category', 'Priority', 'Level', 'Goal target date', 'Archived', 'Task', 'Due date', 'Repeat', 'Done', 'Completed on', 'Focus minutes', 'Notes']];
  for (const g of state.goals) {
    const base = [g.title, g.category, g.priority, g.level, g.targetDate, g.archived ? 'yes' : 'no'];
    if (!g.tasks.length) rows.push([...base, '', '', '', '', '', '', '']);
    for (const t of g.tasks) {
      rows.push([...base, t.title, t.dueDate, RECUR_OPTIONS[t.recur] && t.recur ? RECUR_OPTIONS[t.recur] : '', t.done ? 'yes' : 'no', t.completedOn, t.focusMinutes, t.notes]);
    }
  }
  // BOM so Excel opens UTF-8 (emoji, accents) correctly
  download(`goal-planner-tasks-${today()}.csv`, '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n'), 'text/csv');
  showToast('Tasks exported as CSV 📄');
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try {
      data = normalizeData(JSON.parse(reader.result));
    } catch (err) {
      return showToast('⚠️ That file is not a valid Goal Planner backup.');
    }
    closeModal('settingsModal');
    confirmDialog('Replace all data?',
      `Importing replaces your current ${state.goals.length} goal(s) with ${data.goals.length} goal(s) from the file.`,
      () => withUndo('Data imported ✅', () => { state = data; applyAccent(); }), 'Import');
  };
  reader.readAsText(file);
}

function loadSample() {
  const go = () => withUndo('Sample data loaded 🧪', () => { state = buildSampleData(); });
  closeModal('settingsModal');
  if (!state.goals.length) return go();
  confirmDialog('Load sample data?', 'This replaces your current goals with example data. You can undo right after.', go, 'Load sample');
}

function resetAll() {
  closeModal('settingsModal');
  confirmDialog('Erase all data?', 'Every goal, task, streak and focus log will be deleted from this browser. Consider exporting a backup first.',
    () => {
      if (timerState) stopTimer();
      withUndo('All data erased', () => { state = { goals: [], activity: {}, focusLog: {}, settings: state.settings }; });
    }, 'Erase everything');
}

/* =========================================================
   SETTINGS
   ========================================================= */
function renderSwatches() {
  $('#swatches').innerHTML = ACCENTS.map(c =>
    `<button class="swatch ${c === state.settings.accent ? 'selected' : ''}" style="background:${c}" data-action="accent" data-color="${c}" aria-label="Accent ${c}"></button>`).join('');
}

function openSettings() {
  $('#setTheme').value = getThemePref();
  $('#setFocus').value = state.settings.focusMinutes;
  $('#setBreak').value = state.settings.breakMinutes;
  $('#setSound').checked = state.settings.sound;
  $('#setConfetti').checked = state.settings.confetti;
  $('#setWeekStart').value = state.settings.weekStart;
  renderSwatches();
  openModal('settingsModal');
}

function wireSettings() {
  $('#setTheme').addEventListener('change', e => setThemePref(e.target.value));
  const clampInput = (el, min, max, key) => el.addEventListener('change', () => {
    const v = Math.min(max, Math.max(min, Math.round(Number(el.value)) || DEFAULT_SETTINGS[key]));
    el.value = v; state.settings[key] = v; save();
  });
  clampInput($('#setFocus'), 1, 180, 'focusMinutes');
  clampInput($('#setBreak'), 1, 60, 'breakMinutes');
  $('#setSound').addEventListener('change', e => { state.settings.sound = e.target.checked; save(); });
  $('#setConfetti').addEventListener('change', e => { state.settings.confetti = e.target.checked; save(); if (e.target.checked) celebrate(); });
  $('#setWeekStart').addEventListener('change', e => { state.settings.weekStart = Number(e.target.value); commit(); });
}

/* =========================================================
   KEYBOARD SHORTCUTS
   ========================================================= */
function onKeydown(e) {
  if (e.key === 'Escape') {
    $$('.modal-backdrop').forEach(m => m.classList.add('hidden'));
    if (view.openMenu) { view.openMenu = null; renderGoals(); }
    return;
  }
  // Enter/Space on a focused goal header toggles it
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.goal-head')) {
    e.preventDefault();
    return e.target.click();
  }
  const typing = e.target.closest('input, textarea, select, [contenteditable]');
  if (typing || anyModalOpen() || e.metaKey || e.ctrlKey || e.altKey) return;

  const k = e.key.toLowerCase();
  if (k === 'n') { e.preventDefault(); openGoalForm(); }
  else if (k === '/') { e.preventDefault(); if (view.current !== 'goals') switchView('goals'); $('#search').focus(); }
  else if (k === 't') toggleTheme();
  else if (k === 'f') toggleTimer();
  else if (k === '?') openModal('shortcutsModal');
  else if (['1', '2', '3', '4'].includes(k)) switchView(['goals', 'today', 'calendar', 'insights'][Number(k) - 1]);
}

/* =========================================================
   INIT
   ========================================================= */
function init() {
  load();
  applyTheme();
  applyAccent();

  // Selects
  fillSelect($('#fCategory'), CATEGORIES, 'All categories');
  fillSelect($('#fPriority'), PRIORITIES, 'All priorities');
  fillSelect($('#fLevel'), LEVELS, 'All levels');
  const gf = $('#goalForm');
  fillSelect(gf.elements.category, CATEGORIES);
  fillSelect(gf.elements.priority, PRIORITIES);
  fillSelect(gf.elements.level, LEVELS);
  fillSelect($('#taskForm').elements.recur, RECUR_OPTIONS);

  // Templates + emoji picker in the goal form
  $('#templates').innerHTML = TEMPLATES.map((t, i) =>
    `<button type="button" class="btn btn-sm" data-action="template" data-index="${i}">${t.emoji} ${esc(t.name)}</button>`).join('');
  $('#emojiPick').innerHTML = EMOJI_CHOICES.map(em =>
    `<button type="button" data-action="pick-emoji" data-emoji="${em}" aria-label="Icon ${em}">${em}</button>`).join('');

  // Restore last view
  try {
    const v = localStorage.getItem(VIEW_KEY);
    if (['goals', 'today', 'calendar', 'insights'].includes(v)) view.current = v;
  } catch (e) {}

  render();
  loadTimer();
  initTooltips();
  initDragReorder();
  wireSettings();

  // Global listeners
  document.addEventListener('click', onClick);
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('submit', e => {
    if (e.target.matches('[data-form="add-task"]')) { e.preventDefault(); addTask(e.target); }
  });
  $$('.tab').forEach(t => t.addEventListener('click', () => switchView(t.dataset.view)));

  // Search / filter / sort
  $('#search').addEventListener('input', renderGoals);
  ['fCategory', 'fPriority', 'fLevel', 'fStatus', 'sortBy'].forEach(id => $('#' + id).addEventListener('change', renderGoals));

  // Forms & dialogs
  $('#goalForm').addEventListener('submit', saveGoalFromForm);
  $('#taskForm').addEventListener('submit', saveTaskFromForm);
  $('#confirmOk').addEventListener('click', () => {
    const fn = confirmAction;
    confirmAction = null;
    closeModal('confirmModal');
    if (fn) fn();
  });
  $$('.modal-backdrop').forEach(bd => bd.addEventListener('click', e => {
    if (e.target === bd || e.target.closest('[data-close]')) bd.classList.add('hidden');
  }));
  $('#importFile').addEventListener('change', e => {
    if (e.target.files[0]) importJSON(e.target.files[0]);
    e.target.value = ''; // allow re-importing the same file
  });

  // Follow the OS theme when "Match system" is selected
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (getThemePref() === 'system') applyTheme(); });

  // Keep data in sync if the app is open in another tab
  addEventListener('storage', e => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try { state = normalizeData(JSON.parse(e.newValue)); applyAccent(); render(); } catch (err) {}
    }
  });

  // Refresh "today"/overdue labels after midnight (only when the date changes)
  let lastDay = today();
  setInterval(() => { if (today() !== lastDay) { lastDay = today(); render(); } }, 60 * 1000);
}

init();
