import { artworkUrl } from '../../../src/views/artwork-cache.js';
// Resolve against the application's base URL, also inside the Pages bundle.
export const mapAssetUrl=path=>new URL(artworkUrl(`images/dark-fantasy/map-generation-prototype/${path.replace(/^\.\//,'')}`),document.baseURI).href;
