import { createStarterBootProfile } from '../starter-boot-profile.js';
import { createAuthoredMapLabDraft } from '../map-lab-draft.js';
import { regionalMapId } from './definition.js';

// Keep the approved opening economy/tableau, on the new seeded geography.
export function createRegionalBootProfile(seed=1867) {
  const profile=createStarterBootProfile();
  const template=profile.mapLab.regions.find(r=>r.detailedState).detailedState;
  profile.mapLab=createAuthoredMapLabDraft(regionalMapId(seed));
  for(const region of profile.mapLab.regions)if(region.detailedSettlementEnabled)
    region.detailedState=JSON.parse(JSON.stringify(template));
  return profile;
}
