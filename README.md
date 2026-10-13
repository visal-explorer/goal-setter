# 🎯 Goal Planner

A goal and task planner that runs in your browser. It has no build step, no server, and no login.
Open `index.html` directly (double-click it) and it works. All data is stored in your browser's `localStorage`.

## Files

```
index.html        Page markup and dialogs
favicon.svg       App icon (browser tab + header logo)
css/styles.css    All styles, with light/dark themes and the accent color
js/store.js       Data model, date helpers, saving and loading, streaks, templates
js/ui.js          Icons, dialogs, toasts with Undo, tooltips, theme, confetti, chime
js/views.js       Draws the dashboard and the Goals, Today, Calendar and Insights views
js/timer.js       Pomodoro-style focus timer
js/app.js         Actions, event handling, keyboard shortcuts, import/export, start-up
```

The scripts are plain `<script>` files rather than ES modules, so the app still works from `file://`.
Keep all the files together in the same folder structure.

## Features

- **Goals:** title, icon, description, "Why this matters", category, priority, level and target date. Goals can be pinned, archived, duplicated or started from a template.
- **Tasks:** add, edit, check off and delete. Tasks can have a due date, notes and a repeat setting (daily, weekdays, weekly or monthly). Drag the handle to reorder them.
- **Progress:** a progress bar for each goal, an overall progress bar, and a countdown to each goal's target date.
- **Views:** Goals (search, filter, sort), Today (overdue, due today, next 7 days), Calendar (month grid) and Insights (activity heatmap, weekly bar charts, progress by category).
- **Focus timer:** start a focus session from any task. Focused minutes are saved to the task and to the day.
- **Motivation:** daily streak, best streak, quote of the day, and confetti when you complete a goal.
- **Safety:** asks for confirmation before deleting, offers Undo after destructive actions, and saves and restores backups as JSON. Tasks can also be exported to CSV for spreadsheets.
- **Settings:** light, dark or system theme, accent color, focus and break lengths, sound, confetti and first day of the week.
- **Keyboard shortcuts:** `N` new goal · `/` search · `1–4` switch views · `T` toggle theme · `F` pause or resume the timer · `?` show help.
