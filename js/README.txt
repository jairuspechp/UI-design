Load order matters. Put these at the end of <body>, replacing the old app.js line:

  <script src="js/core.js"></script>
  <script src="js/link-slots.js"></script>
  <script src="js/buttons.js"></script>
  <script src="js/shortcuts.js"></script>
  <script src="js/dialogs.js"></script>
  <script src="js/main.js"></script>

core.js   - state, storage, home screen, zoom / full screen / graph-only, hint bubble
link-slots.js - the link placeholders: cells, empty "+ Add a link", frames, Add/Edit link dialog
buttons.js    - toolbar + menu buttons, zoom/close buttons, slide-down hover toolbar
shortcuts.js  - every keyboard shortcut (F, G, E, C, Tab, ?, Esc)
dialogs.js    - grid settings, new layout, confirm windows
main.js       - starts the app (must be last)

Console debugging: window.LinkGrid holds everything, e.g. LinkGrid.state.boards
