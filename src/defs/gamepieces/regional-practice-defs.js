export const REGIONAL_PRACTICE_SCORE_RULES = Object.freeze({
  ADJACENT_PLAYER_MATCHING_COLOUR: "adjacentPlayerMatchingColour",
  OTHER_LOCAL_COPIES: "otherLocalCopies",
  DISTINCT_LOCAL_NON_SELF: "distinctLocalNonSelf",
  ADJACENT_NON_PLAYER: "adjacentNonPlayer",
  CONNECTED_PLAYER_PRACTICE_REGIONS: "connectedPlayerPracticeRegions",
  ADJACENT_DIFFERENT_COLOUR: "adjacentDifferentColour",
});

export const regionalPracticeDefs = Object.freeze({
  cultivate: Object.freeze({
    id: "cultivate",
    name: "Cultivate",
    scoreRule: REGIONAL_PRACTICE_SCORE_RULES.ADJACENT_PLAYER_MATCHING_COLOUR,
  }),
  store: Object.freeze({
    id: "store",
    name: "Store",
    scoreRule: REGIONAL_PRACTICE_SCORE_RULES.OTHER_LOCAL_COPIES,
  }),
  study: Object.freeze({
    id: "study",
    name: "Study",
    scoreRule: REGIONAL_PRACTICE_SCORE_RULES.DISTINCT_LOCAL_NON_SELF,
  }),
  mobilize: Object.freeze({
    id: "mobilize",
    name: "Mobilize",
    scoreRule: REGIONAL_PRACTICE_SCORE_RULES.ADJACENT_NON_PLAYER,
  }),
  administer: Object.freeze({
    id: "administer",
    name: "Administer",
    scoreRule: REGIONAL_PRACTICE_SCORE_RULES.CONNECTED_PLAYER_PRACTICE_REGIONS,
  }),
  exchange: Object.freeze({
    id: "exchange",
    name: "Exchange",
    scoreRule: REGIONAL_PRACTICE_SCORE_RULES.ADJACENT_DIFFERENT_COLOUR,
  }),
});

export const REGIONAL_PRACTICE_IDS = Object.freeze(Object.keys(regionalPracticeDefs));
