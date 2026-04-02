import { streamProjectionChunkFromStateData } from "../model/projection-chunk.js";

function serializeChunkResult(result) {
  if (!result?.ok) return result;
  return {
    ...result,
    stateDataBySecond: Array.from(result.stateDataBySecond.entries()),
  };
}

globalThis.onmessage = (event) => {
  const message = event?.data ?? null;
  if (!message || message.kind !== "buildChunk") return;

  const result = streamProjectionChunkFromStateData(
    message.boundaryStateData,
    message.baseSec,
    message.endSec,
    {
      stepSec: message.stepSec,
      actionsBySecond: message.scheduledActionsBySecond,
      emitSliceSec: message.streamSliceSec,
      onChunk: (chunk, { done }) => {
        globalThis.postMessage({
          kind: "chunkResult",
          requestId: message.requestId,
          requestKey: message.requestKey,
          timelineToken: message.timelineToken,
          historyEndSec: message.historyEndSec,
          baseSec: chunk.baseSec,
          endSec: chunk.endSec,
          stepSec: chunk.stepSec,
          done,
          result: serializeChunkResult(chunk),
        });
      },
    }
  );

  if (result?.ok === false) {
    globalThis.postMessage({
      kind: "chunkResult",
      requestId: message.requestId,
      requestKey: message.requestKey,
      timelineToken: message.timelineToken,
      historyEndSec: message.historyEndSec,
      baseSec: message.baseSec,
      endSec: message.baseSec,
      stepSec: message.stepSec,
      done: true,
      result,
    });
  }
};

