// Resolve against the application's base URL, also inside the Pages bundle.
export const mapAssetUrl=path=>new URL(`images/dark-fantasy/map-generation-prototype/${path.replace(/^\.\//,'')}`,document.baseURI).href;
