/*
 * link-slots.js
 *
 * The link placeholders (slots): the grid of cells, the empty "+ Add a link"
 * state, the embedded page frames, the Add/Edit link dialog and keeping
 * keyboard focus on the dashboard when you click inside an embedded page.
 *
 * Debug tip: LinkGrid.ui.hoveredSlotIndex is the slot under the mouse.
 */
(function () {
  const LG = window.LinkGrid;
  const { state, storage, expandedByBoard, ui } = LG;
  const topbarEl = document.getElementById('topbar');
  const contentEl = document.getElementById('content');

  // How wide the embedded page "thinks" the screen is. Bigger = more of the
  // page fits (true full-screen look, smaller text). Smaller = larger, clearer
  // text.
  const MONITOR_MIN_WIDTH = 1280;
  const MONITOR_MAX_WIDTH = 1920;

  function fitMonitorFrame(viewport, frame) {
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    if (!vw || !vh) return;

    // Lay the page out like a full desktop screen.
    const canvasWidth = Math.min(MONITOR_MAX_WIDTH, Math.max(MONITOR_MIN_WIDTH, window.innerWidth));

    // One uniform scale, so text and shapes are never stretched.
    const scale = vw / canvasWidth;

    // Canvas height follows the cell's aspect ratio, so the scaled page fills
    // the cell exactly with no gaps.
    const canvasHeight = vh / scale;

    frame.style.width = canvasWidth + 'px';
    frame.style.height = canvasHeight + 'px';
    frame.style.transformOrigin = '0 0';
    frame.style.transform = 'scale(' + scale + ')';
  }

  function setEmbeddedChromeHidden(frame, hidden) {
    try {
      const document = frame.contentDocument;
      if (!document) {
        frame.setAttribute('scrolling', 'no');
        return;
      }

      let style = document.getElementById('link-layouts-monitor-style');
      if (!style) {
        style = document.createElement('style');
        style.id = 'link-layouts-monitor-style';
        style.textContent = [
          'header',
          'nav',
          '[role="banner"]',
          '.navbar',
          '.topbar',
          '.header',
          '.logo',
          '.brand',
          'h1',
          'h2',
          '[class*="logo"]',
          '[class*="brand"]',
          '[class*="title"]',
          '[id*="logo"]',
          '[id*="brand"]',
          '[id*="title"]'
        ].map((selector) => selector + ' { display: none !important; }').join('\n');
        document.head.appendChild(style);
      }

      style.disabled = !hidden;

      // Hide the page's own scroll bars in every state (kept in a separate
      // style so zooming in does not switch it off with the heading-hiding one).
      if (!document.getElementById('link-layouts-scrollbar-style')) {
        const bars = document.createElement('style');
        bars.id = 'link-layouts-scrollbar-style';
        bars.textContent = 'html, body { scrollbar-width: none !important; }\n' +
          '::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }';
        document.head.appendChild(bars);
      }
    } catch (error) {
      // Pages from other websites cannot be styled by the dashboard, so the
      // frame itself is told not to show scroll bars.
      frame.setAttribute('scrolling', 'no');
    }
  }

  // ----------------------------------------------------------------------
  // Keeping the keys working.
  // Key presses go to whatever has focus. After you click inside an embedded
  // page, or come back to this tab, focus can still be sitting inside that
  // page, so the shortcuts never see the key. These hand focus back to the
  // dashboard when you click the dashboard, return to the tab, or move the
  // mouse off a link.
  // ----------------------------------------------------------------------

  function reclaimFocus() {
    const active = document.activeElement;
    if (active && active.tagName === 'IFRAME') active.blur();
    window.focus();
  }

  // Fires when focus moves into an iframe (a click, or the page grabbing focus).
  window.addEventListener('blur', () => {
    setTimeout(() => {
      const a = document.activeElement;
      if (a && a.tagName === 'IFRAME') reclaimFocus();
    }, 0);
  });
  window.addEventListener('focus', reclaimFocus);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) reclaimFocus();
  });
  document.addEventListener('mousedown', reclaimFocus, true);

  // Pages that share this page's origin can be reached, so their key presses
  // are passed on to the shortcuts (except while typing in a field there).
  function forwardFrameKeys(frame) {
    let frameDoc = null;
    try { frameDoc = frame.contentDocument; } catch (error) { return; }
    if (!frameDoc) return; // other websites cannot be reached by the browser's rules

    frameDoc.addEventListener('keydown', (event) => {
      const tag = event.target && event.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (event.target && event.target.isContentEditable)) return;

      const copy = new KeyboardEvent('keydown', {
        key: event.key,
        code: event.code,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
        repeat: event.repeat,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(copy);
      if (copy.defaultPrevented) event.preventDefault();
    });
  }

  function renderBoardContent(board) {
    contentEl.className = 'content mode-board';
    contentEl.innerHTML = '';

    if (!(board.id in expandedByBoard)) {
      expandedByBoard[board.id] = null;
    }

    const grid = document.createElement('div');
    grid.className = 'grid-stage';
    const columns = LG.columnsFor(board);
    grid.style.gridTemplateColumns = 'repeat(' + columns + ', minmax(0, 1fr))';
    grid.style.gridTemplateRows = 'repeat(' + Math.ceil(board.slots.length / columns) + ', minmax(0, 1fr))';

    grid.appendChild(LG.buildExitButton(board));

    activeGrid = grid;
    activeBoardId = board.id;
    activeCellEls = [];

    board.slots.forEach((slot, index) => {
      const cell = buildCell(board, index);
      activeCellEls.push(cell);
      grid.appendChild(cell);
    });

    contentEl.appendChild(grid);
    LG.setHoverZoneActive(true);
  }

  function buildCell(board, index) {
    const slot = board.slots[index];

    const cell = document.createElement('div');
    cell.className = 'cell' + (slot ? ' filled' : '') + (expandedByBoard[board.id] === index ? ' expanded' : '');

    // Remember which slot the mouse is over (used by the E, C and Tab shortcuts).
    cell.addEventListener('mouseenter', () => {
      ui.hoveredSlotIndex = index;
      reclaimFocus(); // so E, C and Tab work while the mouse is over a link
    });
    cell.addEventListener('mouseleave', () => {
      if (ui.hoveredSlotIndex === index) ui.hoveredSlotIndex = null;
      reclaimFocus(); // so the shortcut keys work again after clicking inside a page
    });

    const topbar = document.createElement('div');
    topbar.className = 'cell-topbar';

    if (slot) {
      if (slot.label) {
        const label = document.createElement('div');
        label.className = 'slot-label';
        label.textContent = slot.label;
        topbar.appendChild(label);
      }

      topbar.appendChild(LG.buildExpandButton(board, index));
    } else {
      const indexLabel = document.createElement('div');
      indexLabel.className = 'slot-index';
      indexLabel.textContent = 'SLOT ' + (index + 1);
      topbar.appendChild(indexLabel);
    }

    cell.appendChild(topbar);

    const viewport = document.createElement('div');
    viewport.className = 'cell-viewport';

    if (slot) {
      const frame = document.createElement('iframe');
      frame.className = 'live-frame fixed-monitor-frame';
      frame.src = slot.url;
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation');
      frame.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
      frame.setAttribute('loading', 'lazy');
      viewport.appendChild(frame);

      const resizeMonitor = () => fitMonitorFrame(viewport, frame);
      resizeMonitor();
      frame.addEventListener('load', () => {
        setEmbeddedChromeHidden(frame, expandedByBoard[board.id] !== index);
        resizeMonitor();
        forwardFrameKeys(frame);
      });
      if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(resizeMonitor);
        observer.observe(viewport);
      }
    } else {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = '<div class="empty-plus">+</div><div class="empty-label">Add a link</div>';
      empty.addEventListener('click', () => openSettings(board, index));
      viewport.appendChild(empty);
    }

    cell.appendChild(viewport);
    return cell;
  }

  // Rebuilds just one cell (used when a single link is added/edited) so the
  // other slots' iframes are left untouched and don't reload.
  function refreshCell(board, index) {
    if (activeBoardId !== board.id || !activeGrid) {
      LG.render();
      return;
    }

    const newCell = buildCell(board, index);
    const oldCell = activeCellEls[index];

    if (oldCell && oldCell.parentNode === activeGrid) {
      activeGrid.replaceChild(newCell, oldCell);
    } else {
      activeGrid.appendChild(newCell);
    }

    activeCellEls[index] = newCell;
  }

  // Called by toggleExpand (core.js): mark the zoomed cell, swap its button
  // between the zoom-in and close icons, and show/hide the embedded pages'
  // own headers.
  function applyExpandedState(board, next) {
    activeCellEls.forEach((cell, cellIndex) => {
      if (!cell) return;
      const isExpanded = cellIndex === next;
      cell.classList.toggle('expanded', isExpanded);

      LG.updateExpandButton(cell, board, cellIndex, isExpanded);

      const frame = cell.querySelector('.live-frame');
      if (frame) {
        setEmbeddedChromeHidden(frame, next !== cellIndex);

        // Re-fit after the layout change so a cell that just went back to its
        // minimized size gets its scale restored straight away.
        const viewport = cell.querySelector('.cell-viewport');
        if (viewport) fitMonitorFrame(viewport, frame);
      }
    });
  }

  function openSettings(board, index) {
    const slot = board.slots[index];
    const backdrop = document.createElement('div');
    backdrop.className = 'settings-backdrop';
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) close();
    });

    const modal = document.createElement('div');
    modal.className = 'settings-modal';

    const heading = document.createElement('h3');
    heading.textContent = (slot ? 'Edit link' : 'Add link') + ' - ' + LG.slotName(board, index);
    modal.appendChild(heading);

    const urlLabel = document.createElement('div');
    urlLabel.className = 'settings-field-label';
    urlLabel.textContent = 'URL';
    modal.appendChild(urlLabel);

    const urlInput = document.createElement('input');
    urlInput.placeholder = 'example.com or C:\\path\\file.html';
    urlInput.value = slot ? slot.url : '';
    modal.appendChild(urlInput);

    const titleLabel = document.createElement('div');
    titleLabel.className = 'settings-field-label';
    titleLabel.textContent = 'Title (optional)';
    modal.appendChild(titleLabel);

    const labelInput = document.createElement('input');
    labelInput.placeholder = 'Title';
    labelInput.value = slot ? slot.label || '' : '';
    modal.appendChild(labelInput);

    const row = document.createElement('div');
    row.className = 'settings-row-buttons';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', close);
    row.appendChild(cancelBtn);

    const saveBtn = document.createElement('button');
    saveBtn.className = 'save';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', () => {
      const url = LG.normalizeUrl(urlInput.value);
      if (!url) {
        urlInput.focus();
        return;
      }
      storage.saveSlot(board, index, { label: labelInput.value.trim(), url });
      close();
    });
    row.appendChild(saveBtn);

    modal.appendChild(row);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    urlInput.focus();

    urlInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') saveBtn.click();
      if (event.key === 'Escape') close();
    });

    function close() {
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    }
  }


Object.assign(LG, {
    fitMonitorFrame,
    setEmbeddedChromeHidden,
    reclaimFocus,
    forwardFrameKeys,
    renderBoardContent,
    buildCell,
    refreshCell,
    applyExpandedState,
    openSettings,
  });
})();