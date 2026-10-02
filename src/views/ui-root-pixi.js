if (new URLSearchParams(location.search).get('prototype') === 'vassal-selection') {
  import('./vassal-selection-prototype.js').then(module => module.mountVassalSelectionPrototype());
} else if (/^#\/dev(?:\/|$)/.test(location.hash) && !location.hash.startsWith('#/dev/play')) {
  import('./development-lab-dom.js').then(module => module.mountDevelopmentLab());
} else {
  import('./ui-root-settlement-pixi.js');
}
