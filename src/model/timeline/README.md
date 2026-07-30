# Timeline Module Layout

Timeline internals were split so `index.js` stays focused on orchestration.

## Files

- `index.js`
  - Public timeline API and rebuild/projection/checkpoint orchestration.
- `action-index.js`
  - Action-second indexing, sorted second caches, and index invalidation helpers.
- `memo-cache.js`
  - Memoized state-data cache sizing and nearest-state lookup helpers.
- `mutation-signature.js`
  - Mutation signature computation/comparison utilities.

Import the public API directly from `src/model/timeline/index.js`. There is no
legacy compatibility re-export.
