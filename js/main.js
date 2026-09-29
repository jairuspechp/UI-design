/*
 * main.js  (load LAST)
 *
 * Starts the app once every other file has loaded.
 * If nothing appears on the page, check the browser console: a red error
 * before this line runs usually points at the file that failed to load.
 */
(function () {
  const LG = window.LinkGrid;
  LG.startLiveClock();
  LG.initStorage();
})();
