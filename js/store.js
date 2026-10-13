/* =========================================================
   store.js — constants, data model, date helpers, persistence
   ---------------------------------------------------------
   Everything here is pure data logic (no DOM), shared as
   globals by the other scripts.
   ========================================================= */

/* ---------- Constants ---------- */
const STORAGE_KEY = 'goalPlanner.data.v1';
const THEME_KEY = 'goalPlanner.theme';
const VIEW_KEY = 'goalPlanner.view';
const TIMER_KEY = 'goalPlanner.timer';

const CATEGORIES = ['Career', 'Health', 'Family', 'Finance', 'Personal Growth', 'Lifestyle', 'Other'];
const PRIORITIES = ['High', 'Medium', 'Low'];
const LEVELS = ['Life goal', 'Long-term', 'Short-term'];
const PRIORITY_RANK = { High: 0, Medium: 1, Low: 2 };
const RECUR_OPTIONS = { '': 'Does not repeat', daily: 'Daily', weekdays: 'Weekdays', weekly: 'Weekly', monthly: 'Monthly' };
const CATEGORY_EMOJI = { Career: '💼', Health: '💪', Family: '👨‍👩‍👧', Finance: '💰', 'Personal Growth': '🌱', Lifestyle: '🌴', Other: '⭐' };
const EMOJI_CHOICES = ['🎯', '🚀', '💼', '💪', '🏃', '🧘', '📚', '💰', '🏠', '❤️', '👨‍👩‍👧', '✈️', '🎨', '🎸', '🌱', '⭐'];
const ACCENTS = ['#5b6cf0', '#7c4dff', '#0e8fb0', '#12916b', '#d9480f', '#d6336c', '#495057'];

const DEFAULT_SETTINGS = {
  accent: ACCENTS[0],
  focusMinutes: 25,
  breakMinutes: 5,
  sound: true,
  confetti: true,
  weekStart: 1 // 1 = Monday, 0 = Sunday
};

/** Goal templates. `due` is days from today (null = no due date). */
const TEMPLATES = [
  { name: 'Run a 5K', emoji: '🏃', category: 'Health', priority: 'Medium', level: 'Short-term', days: 56,
    description: 'Go from couch to comfortably running 5 km.', why: 'More energy, better sleep, and proof I can stick with something.',
    tasks: [['Buy proper running shoes', 3], ['Run 3x this week (walk/run intervals)', 7, 'weekly'], ['Run 2 km without stopping', 21], ['Run 4 km without stopping', 42], ['Sign up for a local 5K', 14]] },
  { name: 'Emergency fund', emoji: '💰', category: 'Finance', priority: 'High', level: 'Long-term', days: 180,
    description: 'Save 3 months of essential expenses.', why: 'Peace of mind — a surprise bill should not become a crisis.',
    tasks: [['Calculate monthly essential expenses', 2], ['Open a separate savings account', 7], ['Set up automatic monthly transfer', 10], ['Review subscriptions and cancel unused ones', 14], ['Monthly savings check-in', 30, 'monthly']] },
  { name: 'Read 12 books', emoji: '📚', category: 'Personal Growth', priority: 'Low', level: 'Long-term', days: 365,
    description: 'One book a month for a year.', why: 'Books are the cheapest way to learn from the best minds.',
    tasks: [['Make a reading list', 3], ['Read 20 pages', 1, 'daily'], ['Finish book #1', 30]] },
  { name: 'Land a new job', emoji: '💼', category: 'Career', priority: 'High', level: 'Short-term', days: 90,
    description: 'Find a role that fits my skills and growth goals.', why: 'I want work that challenges me and pays what I am worth.',
    tasks: [['Update resume', 5], ['Refresh LinkedIn profile', 7], ['Apply to 5 roles', 7, 'weekly'], ['Practice interview questions', 14], ['Reach out to 3 people in my network', 10]] },
  { name: 'Daily meditation', emoji: '🧘', category: 'Health', priority: 'Medium', level: 'Short-term', days: 30,
    description: 'Build a 10-minute daily meditation habit.', why: 'A calmer mind makes every other goal easier.',
    tasks: [['Pick a meditation app or method', 1], ['Meditate 10 minutes', 0, 'daily']] },
  { name: 'Family time', emoji: '👨‍👩‍👧', category: 'Family', priority: 'High', level: 'Life goal', days: null,
    description: 'Be present with the people who matter most.', why: 'Time with family is the one thing I can never get back.',
    tasks: [['Plan a weekend outing', 6, 'weekly'], ['Phone-free family dinner', 0, 'daily'], ['Call my parents', 7, 'weekly']] }
];

const QUOTES = [
  ['A goal without a plan is just a wish.', 'Antoine de Saint-Exupéry'],
  ['The secret of getting ahead is getting started.', 'Mark Twain'],
  ['Small daily improvements are the key to staggering long-term results.', 'Robin Sharma'],
  ['You do not rise to the level of your goals. You fall to the level of your systems.', 'James Clear'],
  ['It always seems impossible until it is done.', 'Nelson Mandela'],
  ['Well done is better than well said.', 'Benjamin Franklin'],
  ['Discipline is choosing between what you want now and what you want most.', 'Abraham Lincoln (attributed)'],
  ['The best time to plant a tree was 20 years ago. The second best time is now.', 'Proverb'],
  ['Action is the foundational key to all success.', 'Pablo Picasso'],
  ['What you do every day matters more than what you do once in a while.', 'Gretchen Rubin'],
  ['Motivation gets you going, but habit gets you there.', 'Zig Ziglar'],
  ['Focus on being productive instead of busy.', 'Tim Ferriss'],
  ['Done is better than perfect.', 'Sheryl Sandberg'],
  ['The journey of a thousand miles begins with one step.', 'Lao Tzu']
];

/* ---------- State ----------
   state.goals     -> goal objects, each with tasks[]
   state.activity  -> { 'YYYY-MM-DD': tasks completed that day }   (streaks, heatmap)
   state.focusLog  -> { 'YYYY-MM-DD': focus minutes that day }
   state.settings  -> user preferences (see DEFAULT_SETTINGS)
*/
let state = { goals: [], activity: {}, focusLog: {}, settings: { ...DEFAULT_SETTINGS } };

/* ---------- Generic helpers ---------- */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** Escape user text before inserting it into HTML. */
function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- Date helpers (all dates are local 'YYYY-MM-DD' strings) ---------- */
function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const today = () => dateKey();
function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function addDays(str, n) {
  const d = parseDate(str);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}
/** Whole days from today until `str` (negative = past). */
function daysUntil(str) {
  return Math.round((parseDate(str) - parseDate(today())) / 86400000);
}
function formatDate(str, opts = { month: 'short', day: 'numeric', year: 'numeric' }) {
  return str ? parseDate(str).toLocaleDateString(undefined, opts) : '';
}
/** Friendly relative label: "Today", "Tomorrow", "Yesterday", "Fri", "Oct 2". */
function relativeDate(str) {
  const n = daysUntil(str);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return formatDate(str, { weekday: 'long' });
  const sameYear = parseDate(str).getFullYear() === new Date().getFullYear();
  return formatDate(str, sameYear ? { month: 'short', day: 'numeric' } : undefined);
}
/** Next due date for a recurring task. */
function nextOccurrence(dueDate, recur) {
  // Count from the original due date, or from today if it is missing / overdue
  let base = dueDate && dueDate >= today() ? dueDate : today();
  const d = parseDate(base);
  if (recur === 'daily') d.setDate(d.getDate() + 1);
  else if (recur === 'weekly') d.setDate(d.getDate() + 7);
  else if (recur === 'monthly') {
    const day = d.getDate();
    d.setDate(1); d.setMonth(d.getMonth() + 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last)); // e.g. Jan 31 -> Feb 28
  } else if (recur === 'weekdays') {
    do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6);
  }
  return dateKey(d);
}
function formatMinutes(min) {
  min = Math.round(min || 0);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/* ---------- Derived goal / task data ---------- */
function goalProgress(goal) {
  if (!goal.tasks.length) return 0;
  return Math.round(goal.tasks.filter(t => t.done).length / goal.tasks.length * 100);
}
/** A goal is completed when it has tasks and all of them are done. */
const isGoalComplete = goal => goal.tasks.length > 0 && goal.tasks.every(t => t.done);
const isTaskOverdue = task => !task.done && !!task.dueDate && task.dueDate < today();
const isGoalOverdue = goal => !isGoalComplete(goal) && !goal.archived && !!goal.targetDate && goal.targetDate < today();
const goalFocusMinutes = goal => goal.tasks.reduce((s, t) => s + (t.focusMinutes || 0), 0) + (goal.extraFocus || 0);
/** First unfinished task, preferring the earliest due date. */
function nextTask(goal) {
  const open = goal.tasks.filter(t => !t.done);
  return open.sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'))[0] || null;
}
const findGoal = id => state.goals.find(g => g.id === id);
const findTask = (goalId, taskId) => findGoal(goalId)?.tasks.find(t => t.id === taskId);
/** Goals the user is actively working with (not archived). */
const liveGoals = () => state.goals.filter(g => !g.archived);
/** All tasks of non-archived goals, each paired with its goal. */
const liveTasks = () => liveGoals().flatMap(g => g.tasks.map(t => ({ task: t, goal: g })));

/* ---------- Factories ---------- */
function makeTask(title, dueDate = '', recur = '', notes = '') {
  return { id: uid(), title, dueDate, recur, notes, done: false, completedOn: '', focusMinutes: 0, spawnedId: '' };
}

/* ---------- Persistence ---------- */
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    return false;
  }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state = normalizeData(JSON.parse(raw));
  } catch (e) {
    console.warn('Could not load saved data', e);
  }
}

/**
 * Validate and clean data (used for loading, importing and undo).
 * Unknown/invalid fields fall back to safe defaults, so older
 * saves from v1 of the app upgrade automatically.
 */
function normalizeData(data) {
  if (!data || !Array.isArray(data.goals)) throw new Error('Invalid data format');
  const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const num = v => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
  const str = (v, max = 2000) => String(v ?? '').slice(0, max);

  const goals = data.goals.filter(g => g && typeof g === 'object').map(g => ({
    id: str(g.id) || uid(),
    title: str(g.title, 200) || 'Untitled goal',
    emoji: str(g.emoji, 16),
    description: str(g.description),
    why: str(g.why),
    category: CATEGORIES.includes(g.category) ? g.category : 'Other',
    priority: PRIORITIES.includes(g.priority) ? g.priority : 'Medium',
    level: LEVELS.includes(g.level) ? g.level : 'Short-term',
    targetDate: isDate(g.targetDate) ? g.targetDate : '',
    createdAt: Number(g.createdAt) || Date.now(),
    completedAt: isDate(g.completedAt) ? g.completedAt : '',
    open: !!g.open,
    pinned: !!g.pinned,
    archived: !!g.archived,
    extraFocus: num(g.extraFocus),
    tasks: (Array.isArray(g.tasks) ? g.tasks : []).filter(t => t && typeof t === 'object').map(t => ({
      id: str(t.id) || uid(),
      title: str(t.title, 300) || 'Untitled task',
      dueDate: isDate(t.dueDate) ? t.dueDate : '',
      recur: t.recur in RECUR_OPTIONS ? t.recur : '',
      notes: str(t.notes),
      done: !!t.done,
      completedOn: isDate(t.completedOn) ? t.completedOn : '',
      focusMinutes: num(t.focusMinutes),
      spawnedId: str(t.spawnedId)
    }))
  }));

  const dayMap = obj => {
    const out = {};
    if (obj && typeof obj === 'object') {
      for (const [k, v] of Object.entries(obj)) if (isDate(k) && num(v)) out[k] = num(v);
    }
    return out;
  };

  const s = data.settings && typeof data.settings === 'object' ? data.settings : {};
  const settings = {
    accent: /^#[0-9a-f]{6}$/i.test(s.accent) ? s.accent : DEFAULT_SETTINGS.accent,
    focusMinutes: Math.min(180, Math.max(1, Math.round(num(s.focusMinutes)) || DEFAULT_SETTINGS.focusMinutes)),
    breakMinutes: Math.min(60, Math.max(1, Math.round(num(s.breakMinutes)) || DEFAULT_SETTINGS.breakMinutes)),
    sound: s.sound !== undefined ? !!s.sound : DEFAULT_SETTINGS.sound,
    confetti: s.confetti !== undefined ? !!s.confetti : DEFAULT_SETTINGS.confetti,
    weekStart: Number(s.weekStart) === 0 ? 0 : 1
  };

  return { goals, activity: dayMap(data.activity), focusLog: dayMap(data.focusLog), settings };
}

/* ---------- Streaks ----------
   Checking a task off bumps today's counter in state.activity.
   Unchecking a task completed today reverses it (past days stay earned).
*/
function recordCompletion(task, done) {
  if (done) {
    task.completedOn = today();
    state.activity[task.completedOn] = (state.activity[task.completedOn] || 0) + 1;
  } else {
    if (task.completedOn === today() && state.activity[task.completedOn]) {
      state.activity[task.completedOn]--;
      if (!state.activity[task.completedOn]) delete state.activity[task.completedOn];
    }
    task.completedOn = '';
  }
}

/** Consecutive active days ending today (or yesterday, if nothing is done yet today). */
function currentStreak() {
  let day = today();
  if (!state.activity[day]) day = addDays(day, -1);
  let streak = 0;
  while (state.activity[day]) { streak++; day = addDays(day, -1); }
  return streak;
}

function bestStreak() {
  let best = 0, run = 0, prev = null;
  for (const k of Object.keys(state.activity).sort()) {
    run = prev && addDays(prev, 1) === k ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }
  return best;
}

/** Add focus minutes to today's log and (optionally) to a task. */
function logFocus(minutes, goalId, taskId) {
  if (minutes <= 0) return;
  state.focusLog[today()] = (state.focusLog[today()] || 0) + minutes;
  const goal = findGoal(goalId);
  const task = goal?.tasks.find(t => t.id === taskId);
  if (task) task.focusMinutes += minutes;
  else if (goal) goal.extraFocus += minutes;
}

/* ---------- Sample data (for trying the app out) ---------- */
function buildSampleData() {
  const t = today();
  const goals = TEMPLATES.slice(0, 4).map((tpl, i) => {
    const g = {
      id: uid(), title: tpl.name, emoji: tpl.emoji, description: tpl.description, why: tpl.why,
      category: tpl.category, priority: tpl.priority, level: tpl.level,
      targetDate: tpl.days == null ? '' : addDays(t, tpl.days - i * 20),
      createdAt: Date.now() - i * 1000, open: i === 0, pinned: i === 0, archived: false, extraFocus: 0,
      tasks: tpl.tasks.map(([title, due, recur]) => makeTask(title, due == null ? '' : addDays(t, due - 6), recur || ''))
    };
    // Mark a few early tasks as done to make progress visible
    g.tasks.slice(0, 2 - (i % 2)).forEach(task => { task.done = true; task.completedOn = addDays(t, -i); });
    return g;
  });
  // Fake some history so Insights has something to show
  const activity = {}, focusLog = {};
  for (let i = 1; i < 70; i++) {
    if (Math.random() < 0.62) activity[addDays(t, -i)] = 1 + Math.floor(Math.random() * 4);
    if (Math.random() < 0.5) focusLog[addDays(t, -i)] = 25 * (1 + Math.floor(Math.random() * 3));
  }
  for (let i = 1; i <= 4; i++) activity[addDays(t, -i)] = activity[addDays(t, -i)] || 2; // a visible streak
  return { goals, activity, focusLog, settings: state.settings };
}
