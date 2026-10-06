const isLabRoute = () => /^#\/dev(?:\/|$)/.test(location.hash) && !location.hash.startsWith('#/dev/play');
const startsInLab = isLabRoute();
// Browser Back from a disposable run must restore the Lab entry module, and
// a Lab launch must boot the game rather than just changing its hash.
window.addEventListener('hashchange', () => {
  if (isLabRoute() !== startsInLab) location.reload();
});

if (new URLSearchParams(location.search).get('prototype') === 'vassal-selection') {
  import('./vassal-selection-prototype.js').then(module => module.mountVassalSelectionPrototype());
} else if (startsInLab) {
  import('./development-lab-dom.js').then(module => module.mountDevelopmentLab());
} else {
  import('./ui-root-settlement-pixi.js');
}
