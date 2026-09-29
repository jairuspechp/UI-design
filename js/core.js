/*
 * core.js  (load FIRST)
 *
 * State, browser storage, page rendering (home screen, layout list),
 * zoom / full screen / graph-only, auto-return timer and the hint bubble.
 * Everything other files need is published on window.LinkGrid at the bottom.
 *
 * Debug tip: in the console, LinkGrid.state.boards shows every saved layout.
 */
(function () {
  const LG = (window.LinkGrid = window.LinkGrid || {});

  const NAV_KEY = 'link-grid-nav-v1';

  // Shared data. Other files read these through LinkGrid.
  const state = {
    boards: [],
    currentBoardId: null,
    loaded: false,
  };

  // board id -> index of the zoomed-in slot (or null)
  const expandedByBoard = {};

  // Small bits of UI state that several files need to see.
  const ui = {
    activeMenuWrap: null,   // the open ☰ menu (buttons.js)
    menuChangeIndex: null,  // slot "Change link" applies to when the menu was opened with Tab
    hoveredSlotIndex: null, // slot under the mouse (link-slots.js)
  };

  // Auto-return timer: after 15s zoomed in on a link, revert to the grid.
  // It does NOT apply to plain full screen or graph-only mode: those stay on
  // until you turn them off yourself (F, G or Esc).
  let autoReturnTimer = null;
  const AUTO_RETURN_DELAY = 15000;

  const topbarEl = document.getElementById('topbar');
  const contentEl = document.getElementById('content');

  function clearAutoReturnTimer() {
    if (autoReturnTimer) {
      clearTimeout(autoReturnTimer);
      autoReturnTimer = null;
    }
  }

  function scheduleAutoReturn(board) {
    clearAutoReturnTimer();
    autoReturnTimer = setTimeout(() => {
      if (board && Number.isInteger(expandedByBoard[board.id])) {
        toggleExpand(board, expandedByBoard[board.id]);
      }
      autoReturnTimer = null;
    }, AUTO_RETURN_DELAY);
  }

  function readNav() {
    try {
      const raw = localStorage.getItem(NAV_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      if (parsed && parsed.currentBoardId) {
        state.currentBoardId = parsed.currentBoardId;
      }
    } catch (error) {
      // Ignore unreadable saved navigation state.
    }
  }

  function writeNav() {
    try {
      localStorage.setItem(NAV_KEY, JSON.stringify({ currentBoardId: state.currentBoardId }));
    } catch (error) {
      // Ignore storage write failures.
    }
  }

  function makeLocalId() {
    return 'b' + Date.now() + Math.floor(Math.random() * 1000);
  }

  function blankBoard(name, slotCount, layoutMode, description) {
    return {
      id: makeLocalId(),
      name,
      layoutMode: layoutMode || 'standard',
      // Only ever shown back to the user in the "Create new layout" dialog
      // itself — a note for their own reference, not displayed on tiles
      // or in Grid settings.
      description: description || '',
      slots: Array.from({ length: slotCount || 4 }, () => null),
    };
  }

  function findBoard(id) {
    return state.boards.find((board) => board.id === id) || null;
  }

  // What to call a link in messages: its title when it has one, else "Slot N".
  function slotName(board, index) {
    const slot = board && board.slots[index];
    return slot && slot.label ? slot.label : 'Slot ' + (index + 1);
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  // ----------------------------------------------------------------------
  // Browser storage. Every layout and link is saved in the browser's
  // localStorage, so the UI comes back exactly as you left it next time you
  // open the page. It stays until the browser's site data is cleared.
  // ----------------------------------------------------------------------

  const BOARDS_KEY = 'link-grid-boards-v1';
  const MODES = ['standard', 'horizontal', 'solo', 'three'];
const MAX_SLOTS = 4;

  // Ask the browser not to evict this site's data when disk space is low.
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }

  function loadBoards() {
    try {
      const raw = localStorage.getItem(BOARDS_KEY);
      if (!raw) return [];

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      return parsed
        .filter((board) => board && typeof board.id === 'string')
        .map((board) => ({
          id: board.id,
          name: String(board.name || 'Untitled'),
          layoutMode: MODES.includes(board.layoutMode) ? board.layoutMode : 'standard',
          description: board.description || '',
          slots: Array.isArray(board.slots)
            ? board.slots.map((s) => (s && s.url ? { label: s.label || '', url: s.url } : null))
            : [null, null, null, null],
        }));
    } catch (error) {
      console.error('Link Layouts: saved layouts could not be read.', error);
      return [];
    }
  }

  // Writes the whole list of boards. Called after every change.
  function persist() {
    try {
      localStorage.setItem(BOARDS_KEY, JSON.stringify(state.boards));
    } catch (error) {
      console.error('Link Layouts: could not save to browser storage.', error);
    }
  }

  function initStorage() {
    readNav();
    state.boards = loadBoards();

    if (!state.boards.length) {
      state.boards.push(blankBoard('Layout 1'));
      persist();
    }

    state.loaded = true;
    render();
  }

  const storage = {
    createBoard(name, slotCount, layoutMode, description) {
      const board = blankBoard(name, slotCount, layoutMode, description);
      state.boards.push(board);
      persist();

      render();
      return Promise.resolve(board.id);
    },

    renameBoard(board, name) {
      board.name = name;
      persist();
    },

    deleteBoard(board) {
      state.boards = state.boards.filter((item) => item.id !== board.id);

      if (!state.boards.length) {
        state.boards.push(blankBoard('Layout 1'));
      }
      persist();
    },

    resizeBoard(board, slotCount, layoutMode) {
      const newSlots = board.slots.slice(0, slotCount);
      while (newSlots.length < slotCount) newSlots.push(null);

      board.slots = newSlots;
      board.layoutMode = layoutMode;
      expandedByBoard[board.id] = null;
      leaveZoomView();
      persist();

      render();
    },

    saveSlot(board, index, dataOrNull) {
      const newSlots = board.slots.slice();
      newSlots[index] = dataOrNull;
      board.slots = newSlots;
      persist();

      if (state.currentBoardId === board.id) {
        LG.refreshCell(board, index);
      } else {
        render();
      }
    },
  };

  function domainOf(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch (error) {
      return url;
    }
  }

  function normalizeUrl(raw) {
    const value = raw.trim();
    if (!value) return '';
    if (/^(?:https?|file):\/\//i.test(value)) return value;

    // Accept pasted Windows paths as local file URLs.
    if (/^[a-z]:[\\/]/i.test(value)) {
      return 'file:///' + value.replace(/\\/g, '/');
    }

    // Resolve relative files from the folder containing this app.
    if (/^(?:\.\.?[\\/]|\/)/.test(value)) {
      return new URL(value.replace(/\\/g, '/'), document.baseURI).href;
    }

    return 'https://' + value;
  }

  function hashString(str) {
    let hash = 0;
    for (let index = 0; index < str.length; index += 1) {
      hash = (hash << 5) - hash + str.charCodeAt(index);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  function avatarFor(slot) {
    const basis = slot.label || domainOf(slot.url);
    return hashString(basis) % 360;
  }

  function linkCount(board) {
    return board.slots.filter(Boolean).length;
  }

  function columnsFor(board) {
    if (board.layoutMode === 'horizontal') return Math.max(1, board.slots.length);
    if (board.layoutMode === 'solo') return 1;
    if (board.layoutMode === 'three') return 3;
    return Math.min(4, Math.max(1, Math.ceil(Math.sqrt(board.slots.length))));
  }

  function goHome() {
    const current = findBoard(state.currentBoardId);
    if (current) expandedByBoard[current.id] = null;
    leaveZoomView();
    state.currentBoardId = null;
    writeNav();
    clearAutoReturnTimer();
    render();
  }

  function openBoard(id) {
    state.currentBoardId = id;
    writeNav();
    clearAutoReturnTimer();
    render();
  }

  function render() {
    if (!state.loaded) {
      renderLoading();
      return;
    }

    if (state.currentBoardId) {
      const board = findBoard(state.currentBoardId);
      if (board) {
        LG.renderBoardTopbar(board);
        LG.renderBoardContent(board);
        return;
      }
    }

    renderHomeTopbar();
    renderHomeContent();
  }

  function renderLoading() {
    topbarEl.innerHTML = '';
    topbarEl.classList.remove('board-toolbar', 'is-visible');

    topbarEl.appendChild(buildBrand());

    contentEl.className = 'content mode-home';
    LG.setHoverZoneActive(false);
    contentEl.innerHTML = '<div class="home-intro">Loading your layouts…</div>';
  }

  function renderHomeTopbar() {
    topbarEl.innerHTML = '';
    topbarEl.classList.remove('board-toolbar', 'is-visible');

    topbarEl.appendChild(buildBrand());

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = '· ' + state.boards.length + (state.boards.length === 1 ? ' layout' : ' layouts');
    topbarEl.appendChild(title);

    const spacer = document.createElement('div');
    spacer.className = 'topbar-spacer';
    topbarEl.appendChild(spacer);

    topbarEl.appendChild(buildLiveClock());

    const status = document.createElement('div');
    status.className = 'db-status-btn db-status-ok';
    status.textContent = '💾';
    status.title = 'Saved in this browser — your layouts stay until the browser\'s site data is cleared';
    topbarEl.appendChild(status);
  }

  // Logo mark, shared between the home and board toolbars.
  function buildBrand() {
    const brand = document.createElement('div');
    brand.className = 'brand';

    const logo = document.createElement('img');
    logo.className = 'brand-icon';
    logo.src = 'RTdbX.png';
    logo.alt = 'RTdbX';

    brand.appendChild(logo);
    return brand;
  }

  function formatClock() {
    const now = new Date();
    const date = now.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const time = now.toLocaleTimeString();
    return date + ' · ' + time;
  }

  // A clock (with date) that ticks once a second. Every element with this
  // class gets updated together, so a fresh one keeps working after re-render.
  function buildLiveClock() {
    const clock = document.createElement('div');
    clock.className = 'live-clock';
    clock.textContent = formatClock();
    return clock;
  }

  function startLiveClock() {
    setInterval(() => {
      const text = formatClock();
      document.querySelectorAll('.live-clock').forEach((el) => {
        el.textContent = text;
      });
    }, 1000);
  }

  function renderHomeContent() {
    contentEl.className = 'content mode-home';
    LG.setHoverZoneActive(false);
    contentEl.innerHTML = '';

    const intro = document.createElement('div');
    intro.className = 'home-intro';
    intro.textContent = 'Pick a layout to open, or start a new one.';
    contentEl.appendChild(intro);

    const list = document.createElement('div');
    list.className = 'board-list';

    state.boards.forEach((board) => {
      const tile = document.createElement('div');
      tile.className = 'board-tile';

      const mini = document.createElement('div');
      mini.className = 'mini-grid';
      const miniColumns = Math.min(columnsFor(board), board.slots.length);
      mini.style.gridTemplateColumns = 'repeat(' + miniColumns + ', 1fr)';
      mini.style.gridTemplateRows = 'repeat(' + Math.ceil(board.slots.length / miniColumns) + ', 1fr)';

      board.slots.forEach((slot) => {
        const miniCell = document.createElement('div');
        miniCell.className = 'mini-cell' + (slot ? ' filled' : '');

        if (slot) {
          const hue = avatarFor(slot);
          miniCell.style.background = 'hsl(' + hue + ', 60%, 40%)';
          miniCell.style.borderColor = 'hsl(' + hue + ', 60%, 55%)';
        }

        mini.appendChild(miniCell);
      });

      tile.appendChild(mini);

      const footer = document.createElement('div');
      footer.className = 'board-tile-footer';

      const nameWrap = document.createElement('div');
      nameWrap.style.flex = '1';

      const name = document.createElement('div');
      name.className = 'board-name';
      name.textContent = board.name;

      const meta = document.createElement('div');
      meta.className = 'board-meta';
      meta.textContent = linkCount(board) + ' / ' + board.slots.length + ' links';

      nameWrap.appendChild(name);
      nameWrap.appendChild(meta);
      footer.appendChild(nameWrap);
      tile.appendChild(footer);

      tile.addEventListener('click', () => openBoard(board.id));
      list.appendChild(tile);
    });

    const addTile = document.createElement('div');
    addTile.className = 'add-tile';
    addTile.innerHTML = '<div class="plus">+</div><div class="label">New layout</div>';
    addTile.addEventListener('click', () => {
      LG.openNewGridDialog();
    });
    list.appendChild(addTile);

    contentEl.appendChild(list);
    contentEl.appendChild(buildBoardFooter());
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
      clearAutoReturnTimer();
      return;
    }

    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen();
    }
  }

  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) return;
    clearAutoReturnTimer();

    // The browser's own Esc left full screen: zoom back out too, otherwise the
    // dashboard is left stuck in graph-only mode with a link still zoomed.
    const board = findBoard(state.currentBoardId);
    const openIndex = board ? expandedByBoard[board.id] : null;
    if (board && Number.isInteger(openIndex)) toggleExpand(board, openIndex);
  });

  const fsHintStyle = document.createElement('style');
  fsHintStyle.textContent = [
    '.fs-hint{position:fixed;bottom:24px;left:50%;transform:translate(-50%,8px);',
    'z-index:2147483000;padding:10px 18px;border-radius:10px;',
    'background:rgba(15,17,21,.92);color:#fff;font:600 14px/1.3 system-ui,sans-serif;',
    'border:1px solid rgba(255,255,255,.25);box-shadow:0 6px 24px rgba(0,0,0,.45);',
    'opacity:0;pointer-events:none;transition:opacity .3s,transform .3s;white-space:nowrap}',
    '.fs-hint.show{opacity:1;transform:translate(-50%,0)}',
    '.fs-hint kbd{display:inline-block;padding:1px 7px;margin:0 2px;border-radius:5px;',
    'background:#fff;color:#0f1115;font:700 12px/1.6 system-ui,sans-serif}',
  ].join('');
  document.head.appendChild(fsHintStyle);

  const fsHintEl = document.createElement('div');
  fsHintEl.className = 'fs-hint';
  fsHintEl.setAttribute('role', 'status');
  document.body.appendChild(fsHintEl);

  // Notifications show instantly. A new one replaces whatever is on screen
  // right away, so fast opening / closing never leaves a message waiting.
  //   showHint(html, tag)  show a message now (tag is optional, used to withdraw it)
  //   hideHint(tag)        take down the message if it is the one showing
  const HINT_MS = 3000; // how long a message stays

  let hintCurrent = null;
  let hintTimer = null;

  function finishHint() {
    clearTimeout(hintTimer);
    hintTimer = null;
    fsHintEl.classList.remove('show');
    hintCurrent = null;
  }

  function showHint(html, tag) {
    clearTimeout(hintTimer);

    // Same message already up: just keep it up a little longer.
    if (!(hintCurrent && hintCurrent.html === html)) {
      hintCurrent = { html, tag: tag || '' };
      fsHintEl.innerHTML = html;
    }

    fsHintEl.classList.add('show');
    hintTimer = setTimeout(finishHint, HINT_MS);
  }

  function hideHint(tag) {
    if (hintCurrent && hintCurrent.tag === tag) finishHint();
  }

  // { quiet: true } skips the notification (used when zooming in / out).
  function toggleGraphOnly(options) {
    const quiet = Boolean(options && options.quiet === true);
    const enabled = document.body.classList.toggle('graph-only-mode');

    document.querySelectorAll('.graph-only-btn').forEach((button) => {
      button.textContent = enabled ? '↩' : '▣';
      button.setAttribute('aria-label', enabled ? 'Show dashboard controls' : 'Hide dashboard controls');
      button.title = enabled ? 'Show controls (G)' : 'Graph only (G)';
    });


    if (enabled) {
      if (!quiet) showHint('Graph only &mdash; press <kbd>G</kbd> to show the controls again', 'graph');
    } else {
      hideHint('graph');
    }
  }

  function buildBoardFooter() {
    const footer = document.createElement('div');
    footer.className = 'board-footer';

    const left = document.createElement('div');
    left.className = 'board-footer-left';
    left.textContent = 'RTdbX Traceability Web Application © 2025 Tsukiden Electronics Philippines, Inc.';
    footer.appendChild(left);

    const right = document.createElement('div');
    right.className = 'board-footer-right';

    const emailLink = document.createElement('a');
    emailLink.href = 'mailto:engg-sysdev@tsukiden-ph.com';
    emailLink.textContent = 'engg-sysdev@tsukiden-ph.com';
    right.appendChild(emailLink);

    right.appendChild(document.createTextNode(' | Local: 134/115'));
    footer.appendChild(right);

    return footer;
  }

  // Zooming in also asks the browser for real full screen, which is the slowest
  // part (the window resizes and the embedded page redraws at the new size).
  // Set to false for a faster zoom; the F key still gives full screen on demand.
  const ZOOM_USES_FULLSCREEN = true;

  // What zooming in switched on, so zooming out only undoes that.
  let zoomSetGraphOnly = false;
  let zoomSetFullscreen = false;

  function enterZoomView() {
    if (!document.body.classList.contains('graph-only-mode')) {
      toggleGraphOnly({ quiet: true });
      zoomSetGraphOnly = true;
    }

    if (ZOOM_USES_FULLSCREEN && !document.fullscreenElement && document.documentElement.requestFullscreen) {
      const request = document.documentElement.requestFullscreen();
      if (request && request.catch) request.catch(() => {});
      zoomSetFullscreen = true;
    }
  }

  function leaveZoomView() {
    if (zoomSetGraphOnly && document.body.classList.contains('graph-only-mode')) toggleGraphOnly({ quiet: true });

    if (zoomSetFullscreen && document.fullscreenElement) {
      const exit = document.exitFullscreen();
      if (exit && exit.catch) exit.catch(() => {});
    }

    zoomSetGraphOnly = false;
    zoomSetFullscreen = false;
  }

  function toggleExpand(board, index) {
    const current = expandedByBoard[board.id];
    const next = current === index ? null : index;
    expandedByBoard[board.id] = next;
    topbarEl.classList.toggle('is-visible', next !== null);

    // Mark the zoomed cell first so it is already in place when the layout changes.
    LG.applyExpandedState(board, next);

    // Zooming in also turns on full screen + graph only; zooming out undoes them.
    if (next !== null && !Number.isInteger(current)) enterZoomView();
    if (next === null) leaveZoomView();

    if (next !== null) {
      scheduleAutoReturn(board);
    } else {
      clearAutoReturnTimer();
    }

    const name = '<b>' + escapeHtml(slotName(board, next !== null ? next : index)) + '</b>';
    hideHint('graph');
    showHint(next !== null
      ? name + ' zoomed in &mdash; press <kbd>E</kbd> or click &#10005; to close'
      : name + ' closed', 'zoom');
  }

  Object.assign(LG, {
    state,
    storage,
    expandedByBoard,
    ui,
    MAX_SLOTS,
    MODES,
    clearAutoReturnTimer,
    scheduleAutoReturn,
    readNav,
    writeNav,
    makeLocalId,
    blankBoard,
    findBoard,
    slotName,
    escapeHtml,
    loadBoards,
    persist,
    initStorage,
    domainOf,
    normalizeUrl,
    hashString,
    avatarFor,
    linkCount,
    columnsFor,
    goHome,
    openBoard,
    render,
    renderLoading,
    renderHomeTopbar,
    buildBrand,
    formatClock,
    buildLiveClock,
    startLiveClock,
    renderHomeContent,
    toggleFullscreen,
    showHint,
    hideHint,
    toggleGraphOnly,
    buildBoardFooter,
    enterZoomView,
    leaveZoomView,
    toggleExpand,
  });
})();