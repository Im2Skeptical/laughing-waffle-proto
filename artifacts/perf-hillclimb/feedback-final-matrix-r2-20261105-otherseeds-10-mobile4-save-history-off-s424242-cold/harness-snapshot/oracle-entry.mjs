// Baseline SDK entry. Freeze with freeze-corpus.mjs; candidate runs import only
// its hash-validated self-contained output, never this mutable source entry.
export {createFixtures} from './fixtures.mjs';
export {createNewGameState} from '../../src/model/new-game.js';
export {serializeGameState,deserializeGameState} from '../../src/model/state.js';
export {inspectSaveText} from '../../src/controllers/sim-runner/save-slots.js';
export {rebuildStateAtSecond,createTimelineFromInitialState} from '../../src/model/timeline/index.js';
export {initializeReplayClock,advanceReplayStateOneSecond,advanceReplayStateToSecond} from '../../src/model/replay-second-runner.js';
export {getDetailedCivilizationSummary,getDetailedSettlementViewModel} from '../../src/model/detailed-settlements.js';
