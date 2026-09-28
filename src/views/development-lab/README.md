# Development Lab views

The hash entry in `ui-root-pixi.js` boots `development-lab-dom.js` without the
live game shell. DOM views emit controller commands. `cards.js` renders the
actual Pixi settlement piece into images through one shared renderer, avoiding
one WebGL context per catalogue specimen. Images have textual state alongside.
The global stylesheet uses `.development-lab` selectors only.
