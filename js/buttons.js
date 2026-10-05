(function () {
  const LG = window.LinkGrid;
  const { state, storage, expandedByBoard, ui } = LG;
  const topbarEl = document.getElementById('topbar');
  const contentEl = document.getElementById('content');

  const SLIDE = '0.6s';
  const peekStyle = document.createElement('style');
  peekStyle.textContent = [
    '#topbar.board-toolbar:not(.is-visible),body.graph-only-mode #topbar.board-toolbar{',
    'display:flex !important;position:fixed !important;top:0;left:0;right:0;z-index:9500;',
    'transform:translateY(-100%);opacity:0;visibility:hidden;pointer-events:none;box-shadow:none;',
    'transition:transform ' + SLIDE + ' ease,opacity ' + SLIDE + ' ease,visibility 0s linear ' + SLIDE + '}',
    '#topbar.board-toolbar.hover-peek,#topbar.board-toolbar.menu-peek{',
    'transform:translateY(0) !important;opacity:1 !important;visibility:visible !important;',
    'pointer-events:auto !important;box-shadow:0 10px 30px rgba(0,0,0,.5) !important;',
    'transition:transform ' + SLIDE + ' ease,opacity ' + SLIDE + ' ease,visibility 0s !important}',
  ].join('');
  document.head.appendChild(peekStyle);

  // Compact menu: smaller panel and items so it stays small on screen.
  const menuStyle = document.createElement('style');
  menuStyle.textContent = [
    '.board-menu-panel{gap:2px;padding:4px;border-radius:8px}',
    '.board-menu-panel .board-menu-item{padding:6px 12px;gap:8px;font-size:13px;border-radius:6px}',
    '.board-menu-panel .board-menu-item::before{border-radius:6px}',
  ].join('');
  document.head.appendChild(menuStyle);

  document.addEventListener('click', (event) => {
    if (ui.activeMenuWrap && !ui.activeMenuWrap.contains(event.target)) {
      ui.activeMenuWrap.classList.remove('open');
      ui.activeMenuWrap = null;
    }
  });

  function renderBoardTopbar(board) {
    topbarEl.innerHTML = '';
    topbarEl.className = 'topbar board-toolbar';
    topbarEl.classList.toggle('is-visible', Number.isInteger(expandedByBoard[board.id]));

    const heading = document.createElement('div');
    heading.className = 'board-heading';

    const brandRow = document.createElement('div');
    brandRow.className = 'board-brand-row';

    // Menu flyout: houses "Grid settings", "Change link" (for whichever
    // slot is currently expanded) and "Grid Layouts". Sits to
    // the left of the brand icon.
    const menuWrap = document.createElement('div');
    menuWrap.className = 'board-menu-wrap';

    const menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'board-menu-btn';
    menuBtn.innerHTML = '☰';
    menuBtn.setAttribute('aria-label', 'Open menu');
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.title = 'Menu';

    const menuPanel = document.createElement('div');
    menuPanel.className = 'board-menu-panel';

    function closeMenu() {
      menuWrap.classList.remove('open');
      menuBtn.setAttribute('aria-expanded', 'false');
      if (ui.activeMenuWrap === menuWrap) ui.activeMenuWrap = null;
    }

    menuBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      const isOpen = menuWrap.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', String(isOpen));
      ui.activeMenuWrap = isOpen ? menuWrap : null;
    });

    const settingsItem = document.createElement('button');
    settingsItem.type = 'button';
    settingsItem.className = 'board-menu-item';
    settingsItem.innerHTML = '<span class="board-menu-item-icon">⚙</span><span>grid setting</span>';
    settingsItem.addEventListener('click', (event) => {
      event.stopPropagation();
      closeMenu();
      LG.openGridSettings(board);
    });

    const changeLinkItem = document.createElement('button');
    changeLinkItem.type = 'button';
    changeLinkItem.className = 'board-menu-item';
    changeLinkItem.innerHTML = '<span class="board-menu-item-icon">🔗</span><span>Change link</span>';
    changeLinkItem.addEventListener('click', (event) => {
      event.stopPropagation();
      closeMenu();
      // The expanded slot, else the slot that was under the mouse when the
      // menu was opened with M.
      const currentIndex = Number.isInteger(expandedByBoard[board.id])
        ? expandedByBoard[board.id]
        : ui.menuChangeIndex;
      if (Number.isInteger(currentIndex)) LG.openSettings(board, currentIndex);
    });

    const returnItem = document.createElement('button');
    returnItem.type = 'button';
    returnItem.className = 'board-menu-item';
    returnItem.innerHTML = '<span class="board-menu-item-icon">⌂</span><span>Grid Layouts</span>';
    returnItem.addEventListener('click', (event) => {
      event.stopPropagation();
      closeMenu();
      LG.goHome();
    });

    // Extra entries (same look as the items above).
    function extraItem(icon, text, run) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'board-menu-item';
      item.innerHTML = '<span class="board-menu-item-icon">' + icon + '</span><span>' + text + '</span>';
      item.addEventListener('click', (event) => {
        event.stopPropagation();
        closeMenu();
        run();
      });
      return item;
    }

    menuPanel.appendChild(settingsItem);
    menuPanel.appendChild(changeLinkItem);
    menuPanel.appendChild(returnItem);
    menuPanel.appendChild(extraItem('\u2328', 'Shortcut keys', LG.openShortcutsDialog));
    menuWrap.appendChild(menuBtn);
    menuWrap.appendChild(menuPanel);
    brandRow.appendChild(menuWrap);

    brandRow.appendChild(LG.buildBrand());

    const nameDisplay = document.createElement('div');
    nameDisplay.className = 'board-title-display';
    nameDisplay.textContent = board.name;
    nameDisplay.setAttribute('title', 'Rename from grid setting');
    brandRow.appendChild(nameDisplay);

    heading.appendChild(brandRow);

    topbarEl.appendChild(heading);

    const actions = document.createElement('div');
    actions.className = 'board-actions';
    topbarEl.appendChild(actions);

    actions.appendChild(LG.buildLiveClock());

    const clockDivider = document.createElement('span');
    clockDivider.className = 'toolbar-divider';
    actions.appendChild(clockDivider);

    const graphOnlyBtn = document.createElement('button');
    graphOnlyBtn.type = 'button';
    graphOnlyBtn.className = 'toolbar-icon-btn graph-only-btn';
    graphOnlyBtn.textContent = '▣';
    graphOnlyBtn.setAttribute('aria-label', 'Hide dashboard controls');
    graphOnlyBtn.title = 'Graph only (G)';
    graphOnlyBtn.addEventListener('click', LG.toggleGraphOnly);
    actions.appendChild(graphOnlyBtn);
  }

  // When the menu closes (any way), put the toolbar back the way it was.
  new MutationObserver((records) => {
    const touchedMenu = records.some((r) => r.target.classList && r.target.classList.contains('board-menu-wrap'));
    if (!touchedMenu) return;
    if (!topbarEl.querySelector('.board-menu-wrap.open')) {
      topbarEl.classList.remove('menu-peek');
      ui.menuChangeIndex = null;
      if (!topbarEl.matches(':hover')) topbarEl.classList.remove('hover-peek');
    }
  }).observe(topbarEl, { subtree: true, attributes: true, attributeFilter: ['class'] });

  // Hover to show the navbar: a thin invisible strip along the top edge of an
  // open layout. Pointing at it slides the toolbar in as an overlay (it sits
  // above the embedded pages, so it works over iframes and in full screen).
  // The toolbar goes away again once the mouse leaves it.
  const hoverZone = document.createElement('div');
  hoverZone.style.cssText = 'position:fixed;top:0;left:0;right:0;height:10px;z-index:9400;display:none';
  document.body.appendChild(hoverZone);

  function menuIsOpen() {
    return Boolean(ui.activeMenuWrap && document.contains(ui.activeMenuWrap));
  }

  hoverZone.addEventListener('mouseenter', () => {
    if (!contentEl.classList.contains('mode-board')) return;
    if (document.querySelector('.settings-backdrop')) return; // a dialog is open

    const toolbarHidden = document.body.classList.contains('graph-only-mode') || !topbarEl.classList.contains('is-visible');
    if (toolbarHidden) topbarEl.classList.add('hover-peek');
  });

  hoverZone.addEventListener('mouseleave', () => {
    setTimeout(() => {
      if (!topbarEl.matches(':hover') && !menuIsOpen()) topbarEl.classList.remove('hover-peek');
    }, 300);
  });

  topbarEl.addEventListener('mouseleave', () => {
    if (!menuIsOpen()) topbarEl.classList.remove('hover-peek');
  });

  // The ↗ / ✕ button in a slot's top bar (zoom in / close).
  function buildExpandButton(board, index) {
    const expandBtn = document.createElement('button');
    expandBtn.className = 'expand-btn';
    setExpandButtonLook(expandBtn, board, index, expandedByBoard[board.id] === index);
    expandBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      LG.toggleExpand(board, index);
    });
    return expandBtn;
  }

  function setExpandButtonLook(button, board, index, isExpanded) {
    button.textContent = isExpanded ? '✕' : '↗';
    button.setAttribute('aria-label', (isExpanded ? 'Close ' : 'Zoom in ') + LG.slotName(board, index));
    button.title = (isExpanded ? 'Close' : 'Zoom in') + ' (E)';
  }

  function updateExpandButton(cell, board, index, isExpanded) {
    const button = cell.querySelector('.expand-btn');
    if (button) setExpandButtonLook(button, board, index, isExpanded);
  }

  // The ✕ shown over the grid in graph-only mode. Zoomed in: back out to
  // the grid of links. Otherwise: just leave graph-only.
  function buildExitButton(board) {
    const exitBtn = document.createElement('button');
    exitBtn.type = 'button';
    exitBtn.className = 'exit-graph-only-btn';
    exitBtn.textContent = '✕';
    exitBtn.setAttribute('aria-label', 'Close');
    exitBtn.title = 'Close';
    exitBtn.addEventListener('click', () => {
      const openIndex = expandedByBoard[board.id];
      if (Number.isInteger(openIndex)) LG.toggleExpand(board, openIndex);
      else LG.toggleGraphOnly();
    });
    return exitBtn;
  }

  function setHoverZoneActive(active) {
    hoverZone.style.display = active ? 'block' : 'none';
  }


Object.assign(LG, {
    renderBoardTopbar,
    menuIsOpen,
    buildExpandButton,
    setExpandButtonLook,
    updateExpandButton,
    buildExitButton,
    setHoverZoneActive,
  });
})();