import { runLifeDecisionJob } from '../model/vassal-life-map/decision-preparation.js';
globalThis.onmessage = async ({data}) => {
  const emit = message => globalThis.postMessage({...message, requestId:data.requestId});
  try { await runLifeDecisionJob(data, emit, () => new Promise(resolve => setTimeout(resolve,0))); }
  catch (error) { emit({kind:'error', reason:error.message ?? 'decisionPreparationFailed'}); }
};
