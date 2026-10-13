/* =========================================================
   timer.js — Pomodoro-style focus timer
   ---------------------------------------------------------
   • Start from any task (▶) or a goal's menu.
   • Focus → automatic break → ready for the next round.
   • Focus minutes are credited to the task + today's log.
   • Timer state is saved so a page refresh doesn't lose it.
   ========================================================= */

/**
 * timerState = {
 *   goalId, taskId, label,
 *   mode: 'focus' | 'break',
 *   duration: seconds for this round,
 *   endAt: timestamp (ms) when running, null when paused,
 *   remaining: seconds left (used while paused),
 *   credited: focus minutes already logged for this round
 * }
 */
let timerState = null;
let timerInterval = null;
const baseTitle = document.title;

function saveTimer() {
  try {
    if (timerState) localStorage.setItem(TIMER_KEY, JSON.stringify(timerState));
    else localStorage.removeItem(TIMER_KEY);
  } catch (e) {}
}

function loadTimer() {
  try {
    const raw = localStorage.getItem(TIMER_KEY);
    if (raw) timerState = JSON.parse(raw);
  } catch (e) { timerState = null; }
  if (timerState) startTicking();
  renderTimer();
}

const secondsLeft = () => !timerState ? 0
  : timerState.endAt ? Math.max(0, Math.round((timerState.endAt - Date.now()) / 1000))
  : timerState.remaining;

/** Begin a focus session for a task (or a whole goal when taskId is empty). */
function startFocus(goalId, taskId) {
  if (timerState) creditElapsed(); // switching tasks: keep the minutes already earned
  const goal = findGoal(goalId);
  const task = goal?.tasks.find(t => t.id === taskId);
  if (!goal) return;
  const secs = state.settings.focusMinutes * 60;
  timerState = {
    goalId, taskId: task ? task.id : '',
    label: task ? task.title : `${goal.emoji || '🎯'} ${goal.title}`,
    mode: 'focus', duration: secs, endAt: Date.now() + secs * 1000, remaining: secs, credited: 0
  };
  saveTimer();
  startTicking();
  render();
  renderTimer();
  showToast(`Focus started · ${state.settings.focusMinutes} min`);
}

function startTicking() {
  clearInterval(timerInterval);
  timerInterval = setInterval(tick, 500);
}

function tick() {
  if (!timerState) return;
  if (timerState.endAt && secondsLeft() <= 0) return finishRound();
  updateTimerDisplay();
}

/** Log any whole focus minutes elapsed in this round that weren't logged yet. */
function creditElapsed() {
  if (!timerState || timerState.mode !== 'focus') return;
  const elapsedMin = Math.floor((timerState.duration - secondsLeft()) / 60);
  const add = elapsedMin - timerState.credited;
  if (add > 0) {
    logFocus(add, timerState.goalId, timerState.taskId);
    timerState.credited += add;
    save();
  }
}

function finishRound() {
  chime();
  if (timerState.mode === 'focus') {
    creditElapsed();
    const remainder = Math.round(timerState.duration / 60) - timerState.credited;
    if (remainder > 0) { logFocus(remainder, timerState.goalId, timerState.taskId); save(); }
    notify('Focus session complete 🎉', `Time for a ${state.settings.breakMinutes}-minute break.`);
    showToast(`Great focus! Take a ${state.settings.breakMinutes}-minute break ☕`);
    const secs = state.settings.breakMinutes * 60;
    Object.assign(timerState, { mode: 'break', duration: secs, endAt: Date.now() + secs * 1000, remaining: secs, credited: 0 });
  } else {
    notify('Break is over', 'Ready for another focus session?');
    showToast('Break over — ready for another round? 💪');
    const secs = state.settings.focusMinutes * 60;
    Object.assign(timerState, { mode: 'focus', duration: secs, endAt: null, remaining: secs, credited: 0 });
  }
  saveTimer();
  render();
  renderTimer();
}

function toggleTimer() {
  if (!timerState) return;
  if (timerState.endAt) {
    timerState.remaining = secondsLeft();
    timerState.endAt = null;
  } else {
    timerState.endAt = Date.now() + timerState.remaining * 1000;
  }
  saveTimer();
  renderTimer();
}

function skipRound() {
  if (!timerState) return;
  if (timerState.mode === 'focus') {
    // Finishing early: credit only the minutes actually focused, not the full round
    creditElapsed();
    timerState.duration = timerState.credited * 60;
  }
  finishRound();
}

function stopTimer() {
  if (!timerState) return;
  creditElapsed();
  const mins = timerState.credited;
  timerState = null;
  clearInterval(timerInterval);
  saveTimer();
  document.title = baseTitle;
  render();
  renderTimer();
  if (mins) showToast(`Logged ${formatMinutes(mins)} of focus ⏱️`);
}

/** Browser notification (only if the user already granted permission). */
function notify(title, body) {
  try {
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      new Notification(title, { body, icon: 'favicon.svg' });
    }
  } catch (e) {}
}

const fmtClock = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

function renderTimer() {
  const box = $('#timer');
  document.body.classList.toggle('has-timer', !!timerState);
  if (!timerState) { box.classList.add('hidden'); return; }
  const running = !!timerState.endAt;
  box.classList.remove('hidden');
  box.classList.toggle('break', timerState.mode === 'break');
  box.innerHTML = `
    <div class="timer-top">
      <span>${timerState.mode === 'focus' ? '🎯 Focus' : '☕ Break'}${running ? '' : ' · paused'}</span>
      <button class="btn-icon" data-action="timer-stop" aria-label="Close timer" data-tip="Stop and log time">✕</button>
    </div>
    <div class="timer-task" title="${esc(timerState.label)}">${esc(timerState.label)}</div>
    <div class="timer-time" id="timerTime">${fmtClock(secondsLeft())}</div>
    <div class="progress"><div id="timerBar"></div></div>
    <div class="timer-actions">
      <button class="btn btn-primary" data-action="timer-toggle">${running ? '⏸ Pause' : '▶ ' + (timerState.remaining === timerState.duration ? 'Start' : 'Resume')}</button>
      <button class="btn" data-action="timer-skip">${timerState.mode === 'focus' ? '⏭ Finish' : '⏭ Skip break'}</button>
    </div>`;
  updateTimerDisplay();
}

function updateTimerDisplay() {
  if (!timerState) return;
  const left = secondsLeft();
  const el = $('#timerTime');
  if (el) el.textContent = fmtClock(left);
  const bar = $('#timerBar');
  if (bar) bar.style.width = `${(1 - left / timerState.duration) * 100}%`;
  document.title = timerState.endAt ? `${fmtClock(left)} · ${timerState.mode === 'focus' ? 'Focus' : 'Break'} — Goal Planner` : baseTitle;
}
