// Binary RGBA comes from the offline Pillow importer; use the same source
// gutter detection as the prototype rather than maintaining a second parser.
import { findTerrainFrames, terrainFrameCutRuns } from '../images/dark-fantasy/map-generation-prototype/terrain-frames.js';
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const buffer = Buffer.concat(chunks), end = buffer.indexOf(10);
const [width, height, columns, rows] = JSON.parse(buffer.subarray(0, end).toString());
const data = buffer.subarray(end + 1);
process.stdout.write(JSON.stringify(findTerrainFrames(data, width, height, columns, rows)
  .map(frame => ({ ...frame, cutRuns: terrainFrameCutRuns(data, width, frame) }))));
