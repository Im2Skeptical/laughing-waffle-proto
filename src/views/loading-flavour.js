// Presentation only: advance with actual entry work, never delay a ready game.
const IN_JOKES = Object.freeze([
  'Reticulating Splines',
  'Consulting the Ministry of Redundant Ministries…',
  'Teaching the ruins to respect the grid…',
]);
export const LOADING_FLAVOUR = Object.freeze({
  fallen: Object.freeze([
    'Constructing a fallen empire…',
    'Ageing the aqueducts…',
    'Seeding corruption in the royal court…',
    'Simulating the first succession crisis…',
    'Distributing grain between peasants and palace rats…',
    'Calculating the breaking point of the provinces…',
    'Scheduling the next revolution…',
    ...IN_JOKES,
  ]),
  returning: Object.freeze([
    'Surveying your surviving empire…',
    'Recounting the dynasties that outlived their kings…',
    'Recalculating the price of rebellion…',
    'Checking the cracks in familiar foundations…',
    'Reconciling the Crown’s outstanding debts…',
    'Auditing your empire’s remaining granaries…',
    'Resuming the cycle of decay and revolt…',
    ...IN_JOKES,
  ]),
});

// reuseWorld also covers a future new civilisation on an inherited map; no
// metaprogression mechanics are implied or added by these presentation lines.
export function getLoadingFlavour({ operation = 'newGame', elapsedMs = 0, reuseWorld = false } = {}) {
  const lines = LOADING_FLAVOUR[operation === 'newGame' && !reuseWorld ? 'fallen' : 'returning'];
  const index = Math.floor(Math.max(0, Number(elapsedMs) || 0) / 4000) % lines.length;
  return lines[index];
}
