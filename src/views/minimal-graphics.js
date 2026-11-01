// View-only switch: never captured in saves or passed to simulation.
export const minimalGraphics = new URLSearchParams(globalThis.location?.search ?? '').get('dev') === '1';
