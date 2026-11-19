# Settlement state and second prelude

[Step dispatch](../step/advance_second.cpp) runs Unrest income, Green and
empty-Stranger normalization before season work. It takes the Spring death
baseline after seasonal Practices. At lunar boundaries it starts the report
on Birth and sets the phase on other boundaries. Migration Practices run
before the Migration report changes phase. The prelude and Migration draw no RNG.

## Shared state access

- [site_access.hpp](site_access.hpp) provides authored-order detailed and
  active site lists, first-match region lookup and residency/faction totals.
  The active list excludes storefronts and includes towns in Unrest. Refresh
  the relevant index when a later stage changes its inputs.
- [population.hpp](population.hpp) provides ordered bin views over parallel
  key/count columns, typed filters, proportional allocation, removal and
  ledger commits. A commit sorts and merges bins, updates serialized age and
  specialist caches, and refreshes that site's totals. Class totals sort
  Elders numerically. Specialist age caches retain first occurrence in the
  sorted joint bins. The largest-remainder allocation retains input order
  for both output and equal-key ties, using binary64 intermediates in browser
  order. Key comparison uses the closed population vocabulary and decimal
  age order. The cohort helpers support the ordinary,
  Scholar and Warrior split and recombination used for legacy cohorts.
- [prelude.hpp](prelude.hpp) exposes the moon operations and empty-Stranger
  reset for later stages. Moon headers rotate between two preallocated
  region buffers. Rollover copies site result headers into per-site slots.
  Any nested payload referenced by a published report must stay immutable
  for as long as a live report can reach it. Food, Housing, Faith, Migration
  and Death determine payload retention as their writers land.

Reserve ledger and cohort scratch before scanning sites. Working ranges and
scratch are copy-owned. Site ledger and Elder storage keep the previous
capacity on shrink and grow geometrically when they exceed it. Geometric
growth may allocate at a new high-water mark. The dispatched second and
moon rollover in this cut use only storage allocated at import.

## Unrest expiry

`step_unrest` accrues income in site order through the final covered second.
`finish_unrest_expiry` cancels pending Migration bookings and returns their
cohorts to their source before N03e-8 clears control, restores the storefront
and emits the expiry event. Death has already committed arrivals, so the
cancellation leaves their history intact. Until the control writer lands,
past-due episodes stay attached and stop accruing income. At Faith, N03e-6
owns consuming the accumulated income.

## Migration

Migration reselects reservations from current source cohorts, ranks eligible
destinations along live roads and apportions space in authored order. It
debits departures and publishes the movement ledger before Death feeds and
commits arrivals. Captured content supplies housing and the Edible Stock
classification. The recipe engine owns the preceding Migration Practice stage.

The booking workspace reuses per-thread scratch. Movement payload storage is
owned by each state and reused once no current moon, previous moon, site
result, or meal references it. The workspace and storage grow at new
high-water marks. Transfer IDs are formatted only at the browser adapter.

## Verification

The common step masks expose both moon header lifecycles, region membership
and last-result identity. Phase payloads, movement ledgers and report
currency have separate later owners. Faith income consumption and Death
history still share state paths with this cut.

`settlement_migration` checks an authored housing tie, cancellation with
pending refunds, and legacy external emigration. The reference stage suite
also compares seed 123's naturally occurring movements with complete Stock
and reservation inputs.

`settlement_prelude_windows` captures two prepared starts using the browser
runner. Its non-lunar window exposes Unrest income, Stranger defaults and
Spring history, including overlapping episodes, two expiries and an
automatic Green tier change. The other window checks longer lunar phases,
rollover and forced Green. `settlement_ledger_vectors` generates its vectors
by importing the browser ledger and cohort functions directly in Node.

On the 20-site seed-1 opening window, optimized `waffle_parity step --time`
measured 0.111 µs per sim-second before the cut and 0.407 µs after it.
These are medians of seven runs, each timing 9,984 advances across copies
of the 39-second window, on the i9-10900K Windows host. The additional
0.296 µs includes moon rollover. Timing excludes state comparison.
