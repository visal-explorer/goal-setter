/* =========================================================
   views.js — everything that turns state into HTML:
   greeting, dashboard, Goals / Today / Calendar / Insights
   ========================================================= */

/** UI-only state (not saved with the data). */
const view = {
  current: 'goals',
  calMonth: today().slice(0, 7),   // 'YYYY-MM' shown in the calendar
  calSelected: today(),            // selected calendar day
  openMenu: null                   // goal id whose ⋯ menu is open
};

/* ---------- Greeting & quote ---------- */
function renderGreeting() {
  const h = new Date().getHours();
  const hello = h < 5 ? 'Burning the midnight oil' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  // Quote changes once per day
  const dayNum = Math.floor(parseDate(today()) / 86400000);
  const [quote, author] = QUOTES[dayNum % QUOTES.length];
  $('#greeting').innerHTML = `
    <div>
      <h2>${hello} 👋</h2>
      <div class="date">${formatDate(today(), { weekday: 'long', month: 'long', day: 'numeric' })}</div>
    </div>
    <div class="quote">“${esc(quote)}” — <b>${esc(author)}</b></div>`;
}

/* ---------- Dashboard ---------- */
function renderDashboard() {
  const goals = liveGoals();
  const all = liveTasks();
  const completedGoals = goals.filter(isGoalComplete).length;
  const dueToday = all.filter(({ task }) => !task.done && task.dueDate === today()).length;
  const overdue = all.filter(({ task }) => isTaskOverdue(task)).length;
  const done = all.filter(({ task }) => task.done).length;
  const overall = all.length ? Math.round(done / all.length * 100) : 0;
  const streak = currentStreak();
  const focusToday = state.focusLog[today()] || 0;

  $('#dashboard').innerHTML = `
    <div class="stat clickable" data-action="goto" data-view="goals" data-tip="Active goals (archived excluded)"><div class="label">Goals</div><div class="value">${goals.length}</div><div class="sub">${goals.length - completedGoals} in progress</div></div>
    <div class="stat"><div class="label">Completed</div><div class="value" style="color:var(--success)">${completedGoals}</div><div class="sub">goals done</div></div>
    <div class="stat clickable" data-action="goto" data-view="today"><div class="label">Due today</div><div class="value">${dueToday}</div><div class="sub">open tasks</div></div>
    <div class="stat clickable" data-action="goto" data-view="today"><div class="label">Overdue</div><div class="value" style="color:${overdue ? 'var(--danger)' : 'inherit'}">${overdue}</div><div class="sub">tasks</div></div>
    <div class="stat" data-tip="Consecutive days with at least one completed task"><div class="label">Streak</div><div class="value">🔥 ${streak}</div><div class="sub">day${streak === 1 ? '' : 's'} · best ${bestStreak()}</div></div>
    <div class="stat"><div class="label">Focus today</div><div class="value">⏱️ ${formatMinutes(focusToday)}</div><div class="sub">deep work</div></div>
    <div class="stat wide">
      <div class="label">Overall progress</div>
      <div class="progress-row" style="margin-top:6px">
        <div class="progress ${overall === 100 ? 'full' : ''}"><div style="width:${overall}%"></div></div>
        <span class="pct">${overall}%</span>
      </div>
      <div class="sub">${done} of ${all.length} tasks completed</div>
    </div>`;

  // Badge on the Today tab: overdue + due today
  const badge = $('#todayCount');
  badge.textContent = overdue + dueToday;
  badge.classList.toggle('hidden', !(overdue + dueToday));
}

/* ---------- Shared task row (used in Goals and Today views) ---------- */
function taskHTML(task, goal, { showGoal = false, isMatch = false, draggable = false } = {}) {
  const overdue = isTaskOverdue(task);
  const isToday = !task.done && task.dueDate === today();
  const focusing = typeof timerState !== 'undefined' && timerState && timerState.taskId === task.id;
  const bits = [];
  if (showGoal) bits.push(`<span class="task-goal" data-action="open-goal">${esc(goal.emoji || CATEGORY_EMOJI[goal.category])} ${esc(goal.title)}</span>`);
  if (task.dueDate) {
    const label = overdue ? `⚠️ Overdue · ${relativeDate(task.dueDate)}` : isToday ? '⏰ Due today' : `📅 ${relativeDate(task.dueDate)}`;
    bits.push(`<span class="due ${isToday ? 'today' : ''}">${label}</span>`);
  }
  if (task.recur) bits.push(`<span data-tip="Repeats ${RECUR_OPTIONS[task.recur].toLowerCase()}">🔁 ${RECUR_OPTIONS[task.recur]}</span>`);
  if (task.focusMinutes) bits.push(`<span data-tip="Time spent in focus sessions">⏱️ ${formatMinutes(task.focusMinutes)}</span>`);

  const classes = ['task', task.done && 'done', overdue && 'is-overdue', isMatch && 'match', focusing && 'focusing'].filter(Boolean).join(' ');
  return `
    <li class="${classes}" data-goal="${esc(goal.id)}" data-task="${esc(task.id)}">
      ${draggable ? `<span class="drag-handle" data-drag aria-label="Drag to reorder" data-tip="Drag to reorder">${ICONS.grip}</span>` : ''}
      <input type="checkbox" data-action="toggle-task" ${task.done ? 'checked' : ''} aria-label="Mark “${esc(task.title)}” complete">
      <div class="task-text">
        <span class="task-title">${esc(task.title)}</span>
        ${bits.length ? `<div class="task-sub">${bits.join('')}</div>` : ''}
        ${task.notes ? `<div class="task-notes">${esc(task.notes)}</div>` : ''}
      </div>
      <div class="task-actions">
        ${task.done ? '' : `<button class="btn-icon ${focusing ? 'active' : ''}" data-action="focus-task" data-tip="Start a focus session" aria-label="Focus on this task">${ICONS.play}</button>`}
        <button class="btn-icon" data-action="edit-task" data-tip="Edit task" aria-label="Edit task">${ICONS.edit}</button>
        <button class="btn-icon danger" data-action="delete-task" data-tip="Delete task" aria-label="Delete task">${ICONS.trash}</button>
      </div>
    </li>`;
}

/* =========================================================
   GOALS VIEW
   ========================================================= */
function getFilters() {
  return {
    q: $('#search').value.trim().toLowerCase(),
    category: $('#fCategory').value,
    priority: $('#fPriority').value,
    level: $('#fLevel').value,
    status: $('#fStatus').value,
    sort: $('#sortBy').value
  };
}

/** Returns visible goals plus the ids of tasks that match the search. */
function getVisibleGoals(f) {
  const matched = new Set();
  let list = state.goals.filter(g => {
    if (f.status === 'archived' ? !g.archived : g.archived) return false;
    if (f.category && g.category !== f.category) return false;
    if (f.priority && g.priority !== f.priority) return false;
    if (f.level && g.level !== f.level) return false;
    if (f.status === 'completed' && !isGoalComplete(g)) return false;
    if (f.status === 'active' && isGoalComplete(g)) return false;
    if (f.q) {
      const goalHit = [g.title, g.description, g.why, g.category].some(s => s.toLowerCase().includes(f.q));
      const hits = g.tasks.filter(t => (t.title + ' ' + t.notes).toLowerCase().includes(f.q));
      hits.forEach(t => matched.add(t.id));
      if (!goalHit && !hits.length) return false;
    }
    return true;
  });

  const byDate = (a, b) => (a.targetDate || '9999').localeCompare(b.targetDate || '9999');
  const sorters = {
    created: (a, b) => b.createdAt - a.createdAt,
    due: byDate,
    priority: (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || byDate(a, b),
    progress: (a, b) => goalProgress(b) - goalProgress(a),
    title: (a, b) => a.title.localeCompare(b.title)
  };
  // Pinned goals always float to the top
  list = [...list].sort((a, b) => (b.pinned - a.pinned) || sorters[f.sort](a, b));
  return { list, matched };
}

function renderGoals() {
  const box = $('#goalList');
  const f = getFilters();

  if (!state.goals.length) {
    box.innerHTML = `
      <div class="empty">
        <div class="emoji">🌱</div>
        <h3>No goals yet. Add your first one!</h3>
        <p>Big dreams start with a single step. Pick a template or start from scratch.</p>
        <button class="btn btn-primary" data-action="add-goal">＋ Add your first goal</button>
        <button class="btn" data-action="load-sample">🧪 Try with sample data</button>
      </div>`;
    return;
  }

  const { list, matched } = getVisibleGoals(f);
  if (!list.length) {
    const archivedView = f.status === 'archived';
    box.innerHTML = `
      <div class="empty">
        <div class="emoji">${archivedView ? '🗄️' : '🔍'}</div>
        <h3>${archivedView ? 'No archived goals' : 'No matching goals'}</h3>
        <p>${archivedView ? 'Archive finished or paused goals to keep your list tidy.' : 'Try a different search term or clear your filters.'}</p>
        <button class="btn" data-action="clear-filters">Clear filters</button>
      </div>`;
    return;
  }
  box.innerHTML = list.map(g => goalCardHTML(g, matched, !!f.q)).join('');
}

function goalCardHTML(g, matched, searching) {
  const pct = goalProgress(g);
  const complete = isGoalComplete(g);
  const overdue = isGoalOverdue(g);
  const doneCount = g.tasks.filter(t => t.done).length;
  const open = g.open || (searching && g.tasks.some(t => matched.has(t.id)));
  const next = !complete && nextTask(g);
  const focus = goalFocusMinutes(g);

  // Target date label with countdown
  let dateLabel = '';
  if (g.targetDate) {
    const n = daysUntil(g.targetDate);
    const cls = overdue ? 'late' : !complete && n <= 7 ? 'soon' : '';
    const rel = complete ? '' : overdue ? ` · ${-n}d overdue` : n === 0 ? ' · today' : ` · ${n}d left`;
    dateLabel = `<span class="${cls}">📅 ${formatDate(g.targetDate)}${rel}</span>`;
  }

  const classes = ['goal', `p-${g.priority}`, open && 'open', complete && 'is-complete', overdue && 'is-overdue', g.archived && 'is-archived']
    .filter(Boolean).join(' ');

  return `
  <article class="${classes}" data-goal="${esc(g.id)}">
    <div class="goal-head" data-action="toggle-goal" role="button" tabindex="0" aria-expanded="${open}">
      <div class="goal-emoji" aria-hidden="true">${esc(g.emoji || CATEGORY_EMOJI[g.category])}</div>
      <div class="goal-main">
        <div class="goal-title">${g.pinned ? '<span class="pin" data-tip="Pinned">📌</span>' : ''}<span class="goal-title-text">${esc(g.title)}</span></div>
        <div class="badges">
          <span class="badge cat">${esc(g.category)}</span>
          <span class="badge pr-${g.priority}">${esc(g.priority)}</span>
          <span class="badge">${esc(g.level)}</span>
          ${complete ? '<span class="badge done">✓ Completed</span>' : ''}
          ${overdue ? '<span class="badge late">Overdue</span>' : ''}
          ${g.archived ? '<span class="badge">🗄️ Archived</span>' : ''}
        </div>
        <div class="progress-row">
          <div class="progress ${pct === 100 ? 'full' : ''}" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div style="width:${pct}%"></div></div>
          <span class="pct">${pct}%</span>
        </div>
        <div class="goal-meta">
          <span>✅ ${doneCount}/${g.tasks.length} tasks</span>
          ${dateLabel}
          ${focus ? `<span>⏱️ ${formatMinutes(focus)} focused</span>` : ''}
        </div>
        ${!open && next ? `<div class="next-up">Next up: <b>${esc(next.title)}</b>${next.dueDate ? ` · ${relativeDate(next.dueDate)}` : ''}</div>` : ''}
      </div>
      <div class="goal-actions">
        <div class="menu-wrap">
          <button class="btn-icon" data-action="goal-menu" aria-label="Goal options" aria-haspopup="true">${ICONS.more}</button>
          ${view.openMenu === g.id ? goalMenuHTML(g) : ''}
        </div>
        <span class="btn-icon chevron" aria-hidden="true">${ICONS.chevron}</span>
      </div>
    </div>
    ${open ? goalBodyHTML(g, matched) : ''}
  </article>`;
}

function goalMenuHTML(g) {
  return `
    <div class="menu" role="menu">
      <button data-action="edit-goal" role="menuitem">✏️ Edit goal</button>
      <button data-action="pin-goal" role="menuitem">📌 ${g.pinned ? 'Unpin' : 'Pin to top'}</button>
      <button data-action="focus-goal" role="menuitem">⏱️ Focus on this goal</button>
      <button data-action="duplicate-goal" role="menuitem">📄 Duplicate</button>
      <button data-action="archive-goal" role="menuitem">🗄️ ${g.archived ? 'Unarchive' : 'Archive'}</button>
      <hr>
      <button data-action="delete-goal" class="danger" role="menuitem">🗑️ Delete goal</button>
    </div>`;
}

function goalBodyHTML(g, matched) {
  const hasDone = g.tasks.some(t => t.done);
  const tasks = g.tasks.length
    ? `<ul class="tasks" data-goal-tasks="${esc(g.id)}">${g.tasks.map(t => taskHTML(t, g, { isMatch: matched.has(t.id), draggable: true })).join('')}</ul>`
    : `<div class="empty-small">No tasks yet — break this goal into small steps below. ✨</div>`;

  return `
    <div class="goal-body">
      ${g.description ? `<p class="goal-desc">${esc(g.description)}</p>` : ''}
      ${g.why ? `<div class="why"><strong>💡 Why this matters</strong>${esc(g.why)}</div>` : ''}
      <div class="section-title">
        <span>Tasks</span>
        ${hasDone ? `<button class="btn btn-sm btn-ghost" data-action="clear-done">Clear completed</button>` : ''}
      </div>
      ${tasks}
      <form class="add-task" data-form="add-task" autocomplete="off">
        <input class="input" type="text" name="title" placeholder="Add a task…" maxlength="200" required aria-label="New task">
        <input class="input" type="date" name="dueDate" aria-label="Due date (optional)" title="Due date (optional)">
        <select class="select" name="recur" aria-label="Repeat">
          ${Object.entries(RECUR_OPTIONS).map(([v, l]) => `<option value="${v}">${v ? '🔁 ' + l : 'Once'}</option>`).join('')}
        </select>
        <button class="btn btn-primary" type="submit">Add</button>
      </form>
    </div>`;
}

/* =========================================================
   TODAY VIEW — overdue, due today, upcoming week, unscheduled
   ========================================================= */
function renderToday() {
  const t = today();
  const items = liveTasks();
  const open = items.filter(({ task }) => !task.done);
  const byDue = (a, b) => a.task.dueDate.localeCompare(b.task.dueDate) || PRIORITY_RANK[a.goal.priority] - PRIORITY_RANK[b.goal.priority];

  const overdue = open.filter(({ task }) => task.dueDate && task.dueDate < t).sort(byDue);
  const dueToday = open.filter(({ task }) => task.dueDate === t).sort(byDue);
  const upcoming = open.filter(({ task }) => task.dueDate > t && task.dueDate <= addDays(t, 7)).sort(byDue);
  const doneToday = items.filter(({ task }) => task.done && task.completedOn === t);

  // Daily ring: of the things planned for today (+ overdue), how many are done today?
  const planned = overdue.length + dueToday.length + doneToday.length;
  const pct = planned ? Math.round(doneToday.length / planned * 100) : 0;
  const C = 2 * Math.PI * 36;

  const group = (label, list, cls = '') => list.length ? `
    <div class="group-label ${cls}">${label} <span class="n">${list.length}</span></div>
    <ul class="tasks">${list.map(({ task, goal }) => taskHTML(task, goal, { showGoal: true })).join('')}</ul>` : '';

  const nothing = !overdue.length && !dueToday.length && !upcoming.length;

  $('#view-today').innerHTML = `
    <div class="panel">
      <div class="today-hero">
        <svg class="ring" viewBox="0 0 84 84" role="img" aria-label="${pct}% of today's tasks done">
          <circle class="track" cx="42" cy="42" r="36"/>
          <circle class="bar" cx="42" cy="42" r="36" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct / 100)}"/>
          <text x="42" y="42">${pct}%</text>
        </svg>
        <div>
          <h3>Today's focus</h3>
          <p class="panel-sub" style="margin:0">${doneToday.length} done today · ${dueToday.length} due today · ${overdue.length} overdue · ⏱️ ${formatMinutes(state.focusLog[t] || 0)} focused</p>
        </div>
      </div>
    </div>
    <div class="panel">
      ${nothing ? `<div class="empty-small" style="text-align:center;padding:24px">🎉 Nothing due this week. Plan ahead by adding due dates to tasks in the Goals view.</div>` : ''}
      ${group('⚠️ Overdue', overdue, 'danger')}
      ${group('☀️ Due today', dueToday)}
      ${group('🗓️ Next 7 days', upcoming)}
      ${group('✅ Completed today', doneToday)}
    </div>`;
}

/* =========================================================
   CALENDAR VIEW — month grid with tasks and goal target dates
   ========================================================= */
function itemsOnDate(dateStr) {
  const tasks = liveTasks().filter(({ task }) => task.dueDate === dateStr);
  const goals = liveGoals().filter(g => g.targetDate === dateStr);
  return { tasks, goals };
}

function renderCalendar() {
  const [y, m] = view.calMonth.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const ws = state.settings.weekStart;
  const offset = (first.getDay() - ws + 7) % 7;
  const start = dateKey(new Date(y, m - 1, 1 - offset));
  const t = today();

  const dows = Array.from({ length: 7 }, (_, i) =>
    new Date(2023, 0, 1 + ((i + ws) % 7)).toLocaleDateString(undefined, { weekday: 'short' })); // Jan 1 2023 = Sunday

  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    const { tasks, goals } = itemsOnDate(d);
    const inMonth = d.slice(0, 7) === view.calMonth;
    const chips = [
      ...goals.map(g => `<div class="chip goal-chip ${isGoalComplete(g) ? 'done' : ''}">🎯 ${esc(g.title)}</div>`),
      ...tasks.map(({ task }) => `<div class="chip ${task.done ? 'done' : ''} ${isTaskOverdue(task) ? 'late' : ''}">${esc(task.title)}</div>`)
    ];
    const dots = [
      ...goals.map(g => `<span class="dot goal-dot ${isGoalComplete(g) ? 'done' : ''}"></span>`),
      ...tasks.map(({ task }) => `<span class="dot ${task.done ? 'done' : ''} ${isTaskOverdue(task) ? 'late' : ''}"></span>`)
    ];
    const count = tasks.length + goals.length;
    cells += `
      <button class="cal-day ${inMonth ? '' : 'other'} ${d === t ? 'today' : ''} ${d === view.calSelected ? 'selected' : ''}"
              data-action="cal-select" data-date="${d}" aria-label="${formatDate(d)}${count ? `, ${count} item${count > 1 ? 's' : ''}` : ''}">
        <span class="num">${parseDate(d).getDate()}</span>
        ${chips.slice(0, 3).join('')}${chips.length > 3 ? `<div class="chip more">+${chips.length - 3} more</div>` : ''}
        <span class="dots">${dots.slice(0, 6).join('')}</span>
      </button>`;
  }

  // Detail list for the selected day
  const sel = itemsOnDate(view.calSelected);
  const detail = (sel.tasks.length || sel.goals.length) ? `
    ${sel.goals.map(g => `<div class="group-label">🎯 Goal target: <span style="cursor:pointer;color:var(--primary)" data-action="open-goal" data-goal="${esc(g.id)}">${esc(g.title)}</span></div>`).join('')}
    ${sel.tasks.length ? `<ul class="tasks">${sel.tasks.map(({ task, goal }) => taskHTML(task, goal, { showGoal: true })).join('')}</ul>` : ''}`
    : `<div class="empty-small">Nothing scheduled for this day.</div>`;

  $('#view-calendar').innerHTML = `
    <div class="panel">
      <div class="cal-head">
        <button class="btn-icon" data-action="cal-prev" aria-label="Previous month">${ICONS.left}</button>
        <h3>${first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3>
        <div style="display:flex;gap:4px">
          <button class="btn btn-sm" data-action="cal-today">Today</button>
          <button class="btn-icon" data-action="cal-next" aria-label="Next month">${ICONS.right}</button>
        </div>
      </div>
      <div class="cal-grid">
        ${dows.map(d => `<div class="cal-dow">${d}</div>`).join('')}
        ${cells}
      </div>
    </div>
    <div class="panel">
      <h3>${formatDate(view.calSelected, { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
      <p class="panel-sub">${relativeDate(view.calSelected)}</p>
      ${detail}
    </div>`;
}

/* =========================================================
   INSIGHTS VIEW — stats, activity heatmap, weekly bars,
   focus bars, progress by category
   ========================================================= */
function renderInsights() {
  const t = today();
  const all = liveTasks();
  const done = all.filter(({ task }) => task.done).length;
  const ws = state.settings.weekStart;
  const weekStartOf = d => addDays(d, -((parseDate(d).getDay() - ws + 7) % 7));
  const sumRange = (log, from, to) => Object.entries(log).reduce((s, [k, v]) => (k >= from && k <= to ? s + v : s), 0);

  const thisWeek = weekStartOf(t);
  const tasksThisWeek = sumRange(state.activity, thisWeek, t);
  const tasksLastWeek = sumRange(state.activity, addDays(thisWeek, -7), addDays(thisWeek, -1));
  const focusThisWeek = sumRange(state.focusLog, thisWeek, t);
  const totalFocus = Object.values(state.focusLog).reduce((a, b) => a + b, 0);
  const delta = tasksThisWeek - tasksLastWeek;
  const goalsDone = state.goals.filter(isGoalComplete).length;

  /* -- Heatmap: last 20 weeks, one column per week -- */
  const weeks = 20;
  const hmStart = addDays(thisWeek, -7 * (weeks - 1));
  const max = Math.max(1, ...Object.values(state.activity));
  let cells = '';
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(hmStart, i);
    const n = state.activity[d] || 0;
    const level = d > t ? 'future' : n === 0 ? '' : `l${Math.min(4, Math.ceil(n / max * 4))}`;
    cells += `<div class="hm-cell ${level}" ${d <= t ? `data-tip="${formatDate(d, { weekday: 'short', month: 'short', day: 'numeric' })}: ${n} task${n === 1 ? '' : 's'} completed"` : ''}></div>`;
  }

  /* -- Tasks completed per week, last 12 weeks -- */
  const weekData = Array.from({ length: 12 }, (_, i) => {
    const from = addDays(thisWeek, -7 * (11 - i));
    return { from, value: sumRange(state.activity, from, addDays(from, 6)) };
  });

  /* -- Focus minutes per day, last 14 days -- */
  const focusData = Array.from({ length: 14 }, (_, i) => {
    const d = addDays(t, -(13 - i));
    return { from: d, value: state.focusLog[d] || 0 };
  });

  /* -- Progress by category -- */
  const cats = CATEGORIES.map(c => {
    const tasks = all.filter(({ goal }) => goal.category === c);
    const d = tasks.filter(({ task }) => task.done).length;
    return { c, total: tasks.length, done: d, goals: liveGoals().filter(g => g.category === c).length };
  }).filter(x => x.goals);

  $('#view-insights').innerHTML = `
    <div class="insight-grid">
      <div class="stat"><div class="label">Tasks this week</div><div class="value">${tasksThisWeek}</div>
        <div class="sub">${delta === 0 ? 'same as last week' : `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)} vs last week`}</div></div>
      <div class="stat"><div class="label">Focus this week</div><div class="value">${formatMinutes(focusThisWeek)}</div><div class="sub">${formatMinutes(totalFocus)} all time</div></div>
      <div class="stat"><div class="label">Completion rate</div><div class="value">${all.length ? Math.round(done / all.length * 100) : 0}%</div><div class="sub">${done}/${all.length} tasks</div></div>
      <div class="stat"><div class="label">Best streak</div><div class="value">🏆 ${bestStreak()}</div><div class="sub">${goalsDone} goal${goalsDone === 1 ? '' : 's'} achieved</div></div>
    </div>

    <div class="panel">
      <h3>Activity</h3>
      <p class="panel-sub">Tasks completed per day, last ${weeks} weeks. Hover a square for details.</p>
      <div class="heatmap-wrap"><div class="heatmap" role="img" aria-label="Activity heatmap">${cells}</div></div>
      <div class="hm-legend">Less <span class="hm-cell"></span><span class="hm-cell l1"></span><span class="hm-cell l2"></span><span class="hm-cell l3"></span><span class="hm-cell l4"></span> More</div>
    </div>

    <div class="panel">
      <h3>Tasks completed per week</h3>
      <p class="panel-sub">Last 12 weeks</p>
      ${barChart(weekData, d => `Week of ${formatDate(d.from, { month: 'short', day: 'numeric' })}: ${d.value} task${d.value === 1 ? '' : 's'}`,
        (d, i) => i % 2 === 1 ? formatDate(d.from, { month: 'short', day: 'numeric' }) : '')}
    </div>

    <div class="panel">
      <h3>Focus time per day</h3>
      <p class="panel-sub">Last 14 days, from the focus timer</p>
      ${barChart(focusData, d => `${formatDate(d.from, { weekday: 'short', month: 'short', day: 'numeric' })}: ${formatMinutes(d.value)}`,
        (d, i) => (13 - i) % 3 === 0 ? formatDate(d.from, { month: 'short', day: 'numeric' }) : '', formatMinutes)}
    </div>

    <div class="panel">
      <h3>Progress by category</h3>
      <p class="panel-sub">Share of tasks completed in each life area</p>
      ${cats.length ? `<div class="hbars">${cats.map(x => {
        const p = x.total ? Math.round(x.done / x.total * 100) : 0;
        return `<div class="hbar-row" data-tip="${esc(x.c)}: ${x.done} of ${x.total} tasks · ${x.goals} goal${x.goals === 1 ? '' : 's'}">
          <span class="name">${CATEGORY_EMOJI[x.c]} ${esc(x.c)}</span>
          <div class="hbar-track"><div style="width:${p}%"></div></div>
          <span class="val">${p}% · ${x.done}/${x.total}</span>
        </div>`;
      }).join('')}</div>` : '<div class="empty-small">Add goals to see a breakdown by category.</div>'}
    </div>`;
}

/**
 * Simple single-series bar chart (HTML). Only the tallest bar and
 * the latest bar get a direct value label; the rest use tooltips.
 */
function barChart(data, tip, xLabel, fmt = v => v) {
  const max = Math.max(1, ...data.map(d => d.value));
  const maxIdx = data.findIndex(d => d.value === max);
  const last = data.length - 1;
  return `
    <div class="bars" role="img" aria-label="Bar chart">
      ${data.map((d, i) => `
        <div class="bar-col" data-tip="${esc(tip(d))}">
          ${(i === maxIdx || i === last) && d.value ? `<span class="bar-val" style="bottom:${d.value / max * 100}%">${fmt(d.value)}</span>` : ''}
          <div class="bar" style="height:${d.value / max * 100}%"></div>
        </div>`).join('')}
    </div>
    <div class="bar-labels">${data.map((d, i) => `<span>${xLabel(d, i)}</span>`).join('')}</div>`;
}

/* ---------- Main render ---------- */
function render() {
  renderGreeting();
  renderDashboard();
  $$('.tab').forEach(tab => {
    const active = tab.dataset.view === view.current;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', active);
  });
  $$('.view').forEach(v => v.classList.toggle('hidden', v.id !== `view-${view.current}`));
  ({ goals: renderGoals, today: renderToday, calendar: renderCalendar, insights: renderInsights })[view.current]();
}
