import { mountBuildBadge } from './build-badge-dom.js';

async function boot() {
  // Resolve fonts before Pixi measures text; query switch is review scaffolding.
  if (new URLSearchParams(location.search).get('font') !== 'original') {
    try {
      const faces = await Promise.all([['Regular', '400'], ['Bold', '700']].map(async ([name, weight]) => {
        const face = new FontFace('Libron', `url(./images/fonts/libron/Libron-${name}.woff2)`, { weight });
        return face.load();
      }));
      faces.forEach(face => document.fonts.add(face));
      document.documentElement.dataset.headingFont = 'Libron';
    } catch (error) {
      console.warn('Libron unavailable; using original typography.', error);
    }
  }
  mountBuildBadge();
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

}
void boot();
