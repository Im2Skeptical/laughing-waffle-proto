// Authored from Cam's first-pass Lifegraph export. Previous tuning remains an explicit Lab profile.
export const LIFEGRAPH_DEFAULT_GENERATOR = {
  "schemaVersion": 14,
  "laneCount": 3,
  "normalDepthCount": 10,
  "routeCount": 6,
  "earlyDepthCount": 3,
  "midDepthCount": 4,
  "layoutSmoothing": 0.5,
  "minimumNodeGap": 0.12,
  "nonRepeatFamilyIds": [
    "crisis"
  ],
  "design": {
    "enabled": true,
    "pools": [
      {
        "id": "shops",
        "label": "Shops",
        "occurrence": "common",
        "maxConsecutive": 2
      },
      {
        "id": "growth",
        "label": "Personal growth",
        "occurrence": "common",
        "maxConsecutive": 2
      },
      {
        "id": "journey",
        "label": "Journey",
        "occurrence": "common",
        "maxConsecutive": 1
      },
      {
        "id": "class",
        "label": "Class actions",
        "occurrence": "rare",
        "maxConsecutive": 1
      },
      {
        "id": "danger",
        "label": "Danger",
        "occurrence": "uncommon",
        "maxConsecutive": 1
      },
      {
        "id": "relics",
        "label": "Relics",
        "occurrence": "uncommon",
        "maxConsecutive": 2
      }
    ],
    "nodes": {
      "patronage": {
        "enabled": true,
        "poolId": "growth",
        "scope": "common",
        "occurrence": "common",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "development": {
        "enabled": true,
        "poolId": "growth",
        "scope": "common",
        "occurrence": "common",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "crossroads": {
        "enabled": true,
        "poolId": "journey",
        "scope": "common",
        "occurrence": "common",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "practiceReform": {
        "enabled": true,
        "poolId": "shops",
        "scope": "common",
        "occurrence": "common",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "publicWorks": {
        "enabled": true,
        "poolId": "shops",
        "scope": "common",
        "occurrence": "common",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "crisis": {
        "enabled": true,
        "poolId": "danger",
        "scope": "common",
        "occurrence": "common",
        "timings": [
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "relic": {
        "enabled": true,
        "poolId": "relics",
        "scope": "common",
        "occurrence": "uncommon",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "training": {
        "enabled": true,
        "poolId": "class",
        "scope": "specialist",
        "occurrence": "common",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "discovery": {
        "enabled": true,
        "poolId": "class",
        "scope": "scholar",
        "occurrence": "common",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "campaign": {
        "enabled": true,
        "poolId": "class",
        "scope": "warrior",
        "occurrence": "common",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "challenge": {
        "enabled": true,
        "poolId": "class",
        "scope": "warrior",
        "occurrence": "common",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "neutralMarket": {
        "enabled": true,
        "poolId": "shops",
        "scope": "common",
        "occurrence": "rare",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "classMarket": {
        "enabled": true,
        "poolId": "shops",
        "scope": "specialist",
        "occurrence": "rare",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "foodShop": {
        "enabled": true,
        "poolId": "shops",
        "scope": "common",
        "occurrence": "common",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "housingShop": {
        "enabled": true,
        "poolId": "shops",
        "scope": "common",
        "occurrence": "common",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "stockShop": {
        "enabled": true,
        "poolId": "shops",
        "scope": "common",
        "occurrence": "common",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "legacy": {
        "enabled": true,
        "poolId": "journey",
        "scope": "common",
        "occurrence": "common",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "signature:settlement": {
        "enabled": true,
        "poolId": "journey",
        "scope": "common",
        "occurrence": "common",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "signature:legacyPlus": {
        "enabled": true,
        "poolId": "journey",
        "scope": "common",
        "occurrence": "common",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "signature:monsterHunt": {
        "enabled": true,
        "poolId": "journey",
        "scope": "warrior",
        "occurrence": "common",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "signature:removePractice": {
        "enabled": true,
        "poolId": "journey",
        "scope": "common",
        "occurrence": "common",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "signature:foodShop": {
        "enabled": true,
        "poolId": "journey",
        "scope": "common",
        "occurrence": "common",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "signature:knowledgeShop": {
        "enabled": true,
        "poolId": "journey",
        "scope": "common",
        "occurrence": "common",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "signature:housingShop": {
        "enabled": true,
        "poolId": "journey",
        "scope": "common",
        "occurrence": "common",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "specialRelic": {
        "enabled": true,
        "poolId": "relics",
        "scope": "common",
        "occurrence": "rare",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      }
    },
    "occurrence": {
      "common": 7,
      "uncommon": 3,
      "rare": 1
    },
    "costBands": {
      "time": {
        "cheap": 3,
        "fair": 5,
        "expensive": 10
      },
      "prestige": {
        "cheap": 10,
        "fair": 15,
        "expensive": 30
      },
      "risk": {
        "cheap": 0.05,
        "fair": 0.15,
        "expensive": 0.35
      },
      "monsterPressure": {
        "cheap": 10,
        "fair": 20,
        "expensive": 40
      }
    },
    "optionCosts": {
      "patronage": {
        "immediateFavor": {
          "time": "cheap",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "free"
        },
        "longAppointment": {
          "time": "expensive",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "free"
        },
        "cultivateConnections": {
          "time": "fair",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "free"
        }
      },
      "development": {
        "deepStudy": {
          "time": "expensive",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "calculated"
        },
        "hardLesson": {
          "time": "fair",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "free"
        },
        "steadyPractice": {
          "time": "cheap",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "free"
        }
      },
      "crossroads": {
        "travel": {
          "time": "cheap",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "free"
        },
        "route": {
          "time": "fair",
          "prestige": "fair",
          "risk": "free",
          "monsterPressure": "free"
        },
        "tour": {
          "time": "cheap",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "free"
        }
      },
      "training": {
        "train-estate": {
          "time": "cheap",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "free"
        }
      },
      "discovery": {
        "discovery-research": {
          "time": "fair",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "free"
        },
        "discovery-frontier": {
          "time": "expensive",
          "prestige": "free",
          "risk": "cheap",
          "monsterPressure": "expensive"
        }
      },
      "challenge": {
        "challenge-3": {
          "time": "cheap",
          "prestige": "free",
          "risk": "cheap",
          "monsterPressure": "free"
        },
        "challenge-6": {
          "time": "fair",
          "prestige": "free",
          "risk": "fair",
          "monsterPressure": "free"
        },
        "challenge-9": {
          "time": "expensive",
          "prestige": "free",
          "risk": "expensive",
          "monsterPressure": "free"
        }
      },
      "campaign": {
        "attack": {
          "time": "fair",
          "prestige": "expensive",
          "risk": "calculated",
          "monsterPressure": "free"
        },
        "duel": {
          "time": "cheap",
          "prestige": "free",
          "risk": "calculated",
          "monsterPressure": "free"
        },
        "quest": {
          "time": "fair",
          "prestige": "free",
          "risk": "calculated",
          "monsterPressure": "free"
        },
        "leave": {
          "time": "free",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "free"
        }
      },
      "crisis": {
        "relief": {
          "time": "cheap",
          "prestige": "free",
          "risk": "fair",
          "monsterPressure": "free"
        },
        "buy-relief": {
          "time": "cheap",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "free"
        },
        "delay": {
          "time": "cheap",
          "prestige": "free",
          "risk": "fair",
          "monsterPressure": "free"
        },
        "rescue": {
          "time": "cheap",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "free"
        },
        "observe-crisis": {
          "time": "free",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "free"
        }
      },
      "legacy": {
        "found-settlement": {
          "time": "free",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "free"
        },
        "highest-stat": {
          "time": "free",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "free"
        },
        "accumulated-prestige": {
          "time": "free",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "free"
        }
      },
      "relic": {
        "search": {
          "time": "fair",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "calculated"
        }
      },
      "signature:legacyPlus": {
        "foundDynasty": {
          "time": "fair",
          "prestige": "expensive",
          "risk": "free",
          "monsterPressure": "free"
        },
        "enduringOffice": {
          "time": "fair",
          "prestige": "fair",
          "risk": "free",
          "monsterPressure": "free"
        },
        "humbleRemembrance": {
          "time": "free",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "free"
        }
      },
      "signature:settlement": {
        "found": {
          "time": "free",
          "prestige": "expensive",
          "risk": "free",
          "monsterPressure": "free"
        },
        "route": {
          "time": "cheap",
          "prestige": "fair",
          "risk": "free",
          "monsterPressure": "free"
        },
        "settlement-favor": {
          "time": "free",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "free"
        }
      },
      "signature:monsterHunt": {
        "attack": {
          "time": "fair",
          "prestige": "expensive",
          "risk": "calculated",
          "monsterPressure": "free"
        },
        "duel": {
          "time": "cheap",
          "prestige": "free",
          "risk": "calculated",
          "monsterPressure": "free"
        },
        "quest": {
          "time": "fair",
          "prestige": "free",
          "risk": "calculated",
          "monsterPressure": "free"
        },
        "leave": {
          "time": "free",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "free"
        }
      },
      "signature:removePractice": {
        "remove": {
          "time": "cheap",
          "prestige": "fair",
          "risk": "free",
          "monsterPressure": "free"
        },
        "removalFallback": {
          "time": "free",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "free"
        }
      },
      "practiceReform": {},
      "publicWorks": {},
      "neutralMarket": {},
      "classMarket": {},
      "foodShop": {},
      "housingShop": {},
      "stockShop": {},
      "signature:foodShop": {},
      "signature:housingShop": {},
      "signature:knowledgeShop": {},
      "specialRelic": {
        "search": {
          "time": "fair",
          "prestige": "free",
          "risk": "expensive",
          "monsterPressure": "calculated"
        }
      }
    },
    "shopPricing": {
      "enabled": true,
      "prices": {
        "practice": {
          "bronze": {
            "prestige": 10,
            "time": 2,
            "currency": 0
          },
          "silver": {
            "prestige": 20,
            "time": 3,
            "currency": 0
          },
          "gold": {
            "prestige": 30,
            "time": 4,
            "currency": 0
          },
          "diamond": {
            "prestige": 40,
            "time": 5,
            "currency": 0
          }
        },
        "structure": {
          "bronze": {
            "prestige": 10,
            "time": 2,
            "currency": 0
          },
          "silver": {
            "prestige": 20,
            "time": 3,
            "currency": 0
          },
          "gold": {
            "prestige": 30,
            "time": 4,
            "currency": 0
          },
          "diamond": {
            "prestige": 40,
            "time": 5,
            "currency": 0
          }
        }
      }
    },
    "stockSupply": {
      "enabled": true,
      "randomCount": 2,
      "unmetCount": 1,
      "minDepth": 2,
      "maxDepth": 10
    },
    "guarantees": [
      {
        "id": "training",
        "targetType": "node",
        "targetId": "training",
        "scope": "specialist",
        "count": 1,
        "minDepth": 2,
        "maxDepth": 3,
        "coverage": "map"
      },
      {
        "id": "discovery",
        "targetType": "node",
        "targetId": "discovery",
        "scope": "scholar",
        "count": 1,
        "minDepth": 4,
        "maxDepth": 7,
        "coverage": "eachRoute"
      },
      {
        "id": "campaign",
        "targetType": "node",
        "targetId": "campaign",
        "scope": "warrior",
        "count": 1,
        "minDepth": 4,
        "maxDepth": 8,
        "coverage": "eachRoute"
      },
      {
        "id": "guarantee-1",
        "targetType": "pool",
        "targetId": "shops",
        "scope": "common",
        "count": 1,
        "minDepth": 1,
        "maxDepth": 1,
        "coverage": "map"
      },
      {
        "id": "guarantee-2",
        "targetType": "pool",
        "targetId": "shops",
        "scope": "common",
        "count": 1,
        "minDepth": 4,
        "maxDepth": 4,
        "coverage": "map"
      },
      {
        "id": "guarantee-3",
        "targetType": "pool",
        "targetId": "shops",
        "scope": "common",
        "count": 1,
        "minDepth": 8,
        "maxDepth": 8,
        "coverage": "map"
      }
    ],
    "shopServices": {
      "delve": {
        "time": 10
      },
      "emptyConfirm": {
        "time": 5
      }
    },
    "relicPools": {
      "relic": {
        "qualities": {
          "bronze": {
            "enabled": true,
            "weight": 55
          },
          "silver": {
            "enabled": true,
            "weight": 28
          },
          "gold": {
            "enabled": true,
            "weight": 13
          },
          "diamond": {
            "enabled": true,
            "weight": 4
          }
        }
      },
      "specialRelic": {
        "entries": {
          "signetRing": {
            "enabled": true,
            "weight": 110
          },
          "travellersBoots": {
            "enabled": true,
            "weight": 110
          },
          "tutorsNotebook": {
            "enabled": true,
            "weight": 110
          },
          "minorSeal": {
            "enabled": true,
            "weight": 110
          },
          "foxMask": {
            "enabled": true,
            "weight": 110
          },
          "abacus": {
            "enabled": true,
            "weight": 110
          },
          "courtiersBrooch": {
            "enabled": true,
            "weight": 84
          },
          "pilgrimsStaff": {
            "enabled": true,
            "weight": 84
          },
          "merchantsLens": {
            "enabled": true,
            "weight": 84
          },
          "hourglass": {
            "enabled": true,
            "weight": 84
          },
          "royalWarrant": {
            "enabled": true,
            "weight": 78
          },
          "scholarsCodex": {
            "enabled": true,
            "weight": 78
          },
          "crownOfAges": {
            "enabled": true,
            "weight": 24
          },
          "mandateOfHeaven": {
            "enabled": true,
            "weight": 24
          }
        }
      }
    },
    "columns": [],
    "bookends": {
      "founding": {
        "enabled": true,
        "depth": 0
      },
      "legacy": {
        "enabled": true,
        "depth": "end"
      }
    }
  },
  "weights": {
    "early": {
      "patronage": 5,
      "development": 5,
      "crossroads": 6,
      "practiceReform": 1,
      "publicWorks": 1,
      "crisis": 0,
      "relic": 1.5,
      "specialRelic": 0.5,
      "training": 0,
      "discovery": 0,
      "campaign": 0,
      "challenge": 0,
      "neutralMarket": 0.25,
      "classMarket": 0.25,
      "foodShop": 1,
      "housingShop": 1
    },
    "mid": {
      "patronage": 3,
      "development": 3,
      "crossroads": 6,
      "practiceReform": 3,
      "publicWorks": 3,
      "crisis": 1,
      "relic": 3,
      "specialRelic": 1,
      "training": 0,
      "discovery": 0,
      "campaign": 0,
      "challenge": 0,
      "neutralMarket": 0.5,
      "classMarket": 0.5,
      "foodShop": 1,
      "housingShop": 1
    },
    "late": {
      "patronage": 1,
      "development": 2,
      "crossroads": 6,
      "practiceReform": 4,
      "publicWorks": 4,
      "crisis": 5,
      "relic": 2.25,
      "specialRelic": 0.75,
      "training": 0,
      "discovery": 0,
      "campaign": 0,
      "challenge": 0,
      "neutralMarket": 1,
      "classMarket": 1,
      "foodShop": 1,
      "housingShop": 1
    }
  }
};

export const LIFEGRAPH_PREVIOUS_GENERATOR = {
  "schemaVersion": 14,
  "laneCount": 6,
  "normalDepthCount": 11,
  "routeCount": 6,
  "earlyDepthCount": 4,
  "midDepthCount": 4,
  "layoutSmoothing": 0.5,
  "minimumNodeGap": 0.12,
  "nonRepeatFamilyIds": [
    "crisis"
  ],
  "design": {
    "enabled": true,
    "pools": [
      {
        "id": "shops",
        "label": "Shops",
        "occurrence": "common",
        "maxConsecutive": 2
      },
      {
        "id": "growth",
        "label": "Personal growth",
        "occurrence": "common",
        "maxConsecutive": 2
      },
      {
        "id": "journey",
        "label": "Journey",
        "occurrence": "common",
        "maxConsecutive": 2
      },
      {
        "id": "class",
        "label": "Class actions",
        "occurrence": "uncommon",
        "maxConsecutive": 1
      },
      {
        "id": "danger",
        "label": "Danger",
        "occurrence": "uncommon",
        "maxConsecutive": 1
      },
      {
        "id": "relics",
        "label": "Relics",
        "occurrence": "uncommon",
        "maxConsecutive": 1
      }
    ],
    "nodes": {
      "patronage": {
        "enabled": true,
        "poolId": "growth",
        "scope": "common",
        "occurrence": "common",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "development": {
        "enabled": true,
        "poolId": "growth",
        "scope": "common",
        "occurrence": "common",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "crossroads": {
        "enabled": true,
        "poolId": "journey",
        "scope": "common",
        "occurrence": "common",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "practiceReform": {
        "enabled": true,
        "poolId": "shops",
        "scope": "common",
        "occurrence": "common",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "publicWorks": {
        "enabled": true,
        "poolId": "shops",
        "scope": "common",
        "occurrence": "common",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "crisis": {
        "enabled": true,
        "poolId": "danger",
        "scope": "common",
        "occurrence": "common",
        "timings": [
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "relic": {
        "enabled": true,
        "poolId": "relics",
        "scope": "common",
        "occurrence": "uncommon",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "training": {
        "enabled": true,
        "poolId": "class",
        "scope": "specialist",
        "occurrence": "common",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "discovery": {
        "enabled": true,
        "poolId": "class",
        "scope": "scholar",
        "occurrence": "common",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "campaign": {
        "enabled": true,
        "poolId": "class",
        "scope": "warrior",
        "occurrence": "common",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "challenge": {
        "enabled": true,
        "poolId": "class",
        "scope": "warrior",
        "occurrence": "common",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "neutralMarket": {
        "enabled": true,
        "poolId": "shops",
        "scope": "common",
        "occurrence": "rare",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "classMarket": {
        "enabled": true,
        "poolId": "shops",
        "scope": "specialist",
        "occurrence": "rare",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "foodShop": {
        "enabled": true,
        "poolId": "shops",
        "scope": "common",
        "occurrence": "common",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "housingShop": {
        "enabled": true,
        "poolId": "shops",
        "scope": "common",
        "occurrence": "common",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "stockShop": {
        "enabled": true,
        "poolId": "shops",
        "scope": "common",
        "occurrence": "common",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "legacy": {
        "enabled": true,
        "poolId": "journey",
        "scope": "common",
        "occurrence": "common",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "signature:settlement": {
        "enabled": true,
        "poolId": "journey",
        "scope": "common",
        "occurrence": "common",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "signature:legacyPlus": {
        "enabled": true,
        "poolId": "journey",
        "scope": "common",
        "occurrence": "common",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "signature:monsterHunt": {
        "enabled": true,
        "poolId": "journey",
        "scope": "warrior",
        "occurrence": "common",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "signature:removePractice": {
        "enabled": true,
        "poolId": "journey",
        "scope": "common",
        "occurrence": "common",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "signature:foodShop": {
        "enabled": true,
        "poolId": "journey",
        "scope": "common",
        "occurrence": "common",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "signature:knowledgeShop": {
        "enabled": true,
        "poolId": "journey",
        "scope": "common",
        "occurrence": "common",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "signature:housingShop": {
        "enabled": true,
        "poolId": "journey",
        "scope": "common",
        "occurrence": "common",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      },
      "specialRelic": {
        "enabled": true,
        "poolId": "relics",
        "scope": "common",
        "occurrence": "rare",
        "timings": [
          "early",
          "mid",
          "late"
        ],
        "milestonesOnly": false
      }
    },
    "occurrence": {
      "common": 6,
      "uncommon": 3,
      "rare": 1
    },
    "costBands": {
      "time": {
        "cheap": 2,
        "fair": 4,
        "expensive": 8
      },
      "prestige": {
        "cheap": 5,
        "fair": 10,
        "expensive": 20
      },
      "risk": {
        "cheap": 0.05,
        "fair": 0.15,
        "expensive": 0.35
      },
      "monsterPressure": {
        "cheap": 10,
        "fair": 20,
        "expensive": 40
      }
    },
    "optionCosts": {
      "patronage": {
        "immediateFavor": {
          "time": "cheap",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "free"
        },
        "longAppointment": {
          "time": "expensive",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "free"
        },
        "cultivateConnections": {
          "time": "fair",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "free"
        }
      },
      "development": {
        "deepStudy": {
          "time": "expensive",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "calculated"
        },
        "hardLesson": {
          "time": "fair",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "free"
        },
        "steadyPractice": {
          "time": "cheap",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "free"
        }
      },
      "crossroads": {
        "travel": {
          "time": "cheap",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "free"
        },
        "route": {
          "time": "fair",
          "prestige": "fair",
          "risk": "free",
          "monsterPressure": "free"
        },
        "tour": {
          "time": "cheap",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "free"
        }
      },
      "training": {
        "train-estate": {
          "time": "cheap",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "free"
        }
      },
      "discovery": {
        "discovery-research": {
          "time": "fair",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "free"
        },
        "discovery-frontier": {
          "time": "expensive",
          "prestige": "free",
          "risk": "cheap",
          "monsterPressure": "expensive"
        }
      },
      "challenge": {
        "challenge-3": {
          "time": "cheap",
          "prestige": "free",
          "risk": "cheap",
          "monsterPressure": "free"
        },
        "challenge-6": {
          "time": "fair",
          "prestige": "free",
          "risk": "fair",
          "monsterPressure": "free"
        },
        "challenge-9": {
          "time": "expensive",
          "prestige": "free",
          "risk": "expensive",
          "monsterPressure": "free"
        }
      },
      "campaign": {
        "attack": {
          "time": "fair",
          "prestige": "expensive",
          "risk": "calculated",
          "monsterPressure": "free"
        },
        "duel": {
          "time": "cheap",
          "prestige": "free",
          "risk": "calculated",
          "monsterPressure": "free"
        },
        "quest": {
          "time": "fair",
          "prestige": "free",
          "risk": "calculated",
          "monsterPressure": "free"
        },
        "leave": {
          "time": "free",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "free"
        }
      },
      "crisis": {
        "relief": {
          "time": "cheap",
          "prestige": "free",
          "risk": "fair",
          "monsterPressure": "free"
        },
        "buy-relief": {
          "time": "cheap",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "free"
        },
        "delay": {
          "time": "cheap",
          "prestige": "free",
          "risk": "fair",
          "monsterPressure": "free"
        },
        "rescue": {
          "time": "cheap",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "free"
        },
        "observe-crisis": {
          "time": "free",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "free"
        }
      },
      "legacy": {
        "found-settlement": {
          "time": "free",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "free"
        },
        "highest-stat": {
          "time": "free",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "free"
        },
        "accumulated-prestige": {
          "time": "free",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "free"
        }
      },
      "relic": {
        "search": {
          "time": "fair",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "calculated"
        }
      },
      "signature:legacyPlus": {
        "foundDynasty": {
          "time": "fair",
          "prestige": "expensive",
          "risk": "free",
          "monsterPressure": "free"
        },
        "enduringOffice": {
          "time": "fair",
          "prestige": "fair",
          "risk": "free",
          "monsterPressure": "free"
        },
        "humbleRemembrance": {
          "time": "free",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "free"
        }
      },
      "signature:settlement": {
        "found": {
          "time": "free",
          "prestige": "expensive",
          "risk": "free",
          "monsterPressure": "free"
        },
        "route": {
          "time": "cheap",
          "prestige": "fair",
          "risk": "free",
          "monsterPressure": "free"
        },
        "settlement-favor": {
          "time": "free",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "free"
        }
      },
      "signature:monsterHunt": {
        "attack": {
          "time": "fair",
          "prestige": "expensive",
          "risk": "calculated",
          "monsterPressure": "free"
        },
        "duel": {
          "time": "cheap",
          "prestige": "free",
          "risk": "calculated",
          "monsterPressure": "free"
        },
        "quest": {
          "time": "fair",
          "prestige": "free",
          "risk": "calculated",
          "monsterPressure": "free"
        },
        "leave": {
          "time": "free",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "free"
        }
      },
      "signature:removePractice": {
        "remove": {
          "time": "cheap",
          "prestige": "fair",
          "risk": "free",
          "monsterPressure": "free"
        },
        "removalFallback": {
          "time": "free",
          "prestige": "free",
          "risk": "free",
          "monsterPressure": "free"
        }
      },
      "practiceReform": {},
      "publicWorks": {},
      "neutralMarket": {},
      "classMarket": {},
      "foodShop": {},
      "housingShop": {},
      "stockShop": {},
      "signature:foodShop": {},
      "signature:housingShop": {},
      "signature:knowledgeShop": {},
      "specialRelic": {
        "search": {
          "time": "fair",
          "prestige": "free",
          "risk": "expensive",
          "monsterPressure": "calculated"
        }
      }
    },
    "shopPricing": {
      "enabled": true,
      "prices": {
        "practice": {
          "bronze": {
            "prestige": 10,
            "time": 2,
            "currency": 0
          },
          "silver": {
            "prestige": 20,
            "time": 3,
            "currency": 0
          },
          "gold": {
            "prestige": 30,
            "time": 4,
            "currency": 0
          },
          "diamond": {
            "prestige": 40,
            "time": 5,
            "currency": 0
          }
        },
        "structure": {
          "bronze": {
            "prestige": 12,
            "time": 2,
            "currency": 0
          },
          "silver": {
            "prestige": 24,
            "time": 3,
            "currency": 0
          },
          "gold": {
            "prestige": 36,
            "time": 4,
            "currency": 0
          },
          "diamond": {
            "prestige": 48,
            "time": 5,
            "currency": 0
          }
        }
      }
    },
    "stockSupply": {
      "enabled": true,
      "randomCount": 2,
      "unmetCount": 1,
      "minDepth": 2,
      "maxDepth": 11
    },
    "guarantees": [
      {
        "id": "training",
        "targetType": "node",
        "targetId": "training",
        "scope": "specialist",
        "count": 1,
        "minDepth": 1,
        "maxDepth": 3,
        "coverage": "map"
      },
      {
        "id": "discovery",
        "targetType": "node",
        "targetId": "discovery",
        "scope": "scholar",
        "count": 1,
        "minDepth": 4,
        "maxDepth": 7,
        "coverage": "eachRoute"
      },
      {
        "id": "campaign",
        "targetType": "node",
        "targetId": "campaign",
        "scope": "warrior",
        "count": 1,
        "minDepth": 4,
        "maxDepth": 8,
        "coverage": "eachRoute"
      }
    ],
    "shopServices": {
      "delve": {
        "time": 2
      },
      "emptyConfirm": {
        "time": 2
      }
    },
    "relicPools": {
      "relic": {
        "qualities": {
          "bronze": {
            "enabled": true,
            "weight": 55
          },
          "silver": {
            "enabled": true,
            "weight": 28
          },
          "gold": {
            "enabled": true,
            "weight": 13
          },
          "diamond": {
            "enabled": true,
            "weight": 4
          }
        }
      },
      "specialRelic": {
        "entries": {
          "signetRing": {
            "enabled": true,
            "weight": 110
          },
          "travellersBoots": {
            "enabled": true,
            "weight": 110
          },
          "tutorsNotebook": {
            "enabled": true,
            "weight": 110
          },
          "minorSeal": {
            "enabled": true,
            "weight": 110
          },
          "foxMask": {
            "enabled": true,
            "weight": 110
          },
          "abacus": {
            "enabled": true,
            "weight": 110
          },
          "courtiersBrooch": {
            "enabled": true,
            "weight": 84
          },
          "pilgrimsStaff": {
            "enabled": true,
            "weight": 84
          },
          "merchantsLens": {
            "enabled": true,
            "weight": 84
          },
          "hourglass": {
            "enabled": true,
            "weight": 84
          },
          "royalWarrant": {
            "enabled": true,
            "weight": 78
          },
          "scholarsCodex": {
            "enabled": true,
            "weight": 78
          },
          "crownOfAges": {
            "enabled": true,
            "weight": 24
          },
          "mandateOfHeaven": {
            "enabled": true,
            "weight": 24
          }
        }
      }
    },
    "columns": [],
    "bookends": {
      "founding": {
        "enabled": true,
        "depth": 0
      },
      "legacy": {
        "enabled": true,
        "depth": "end"
      }
    }
  },
  "weights": {
    "early": {
      "patronage": 5,
      "development": 5,
      "crossroads": 6,
      "practiceReform": 1,
      "publicWorks": 1,
      "crisis": 0,
      "relic": 1.5,
      "specialRelic": 0.5,
      "training": 0,
      "discovery": 0,
      "campaign": 0,
      "challenge": 0,
      "neutralMarket": 0.25,
      "classMarket": 0.25,
      "foodShop": 1,
      "housingShop": 1
    },
    "mid": {
      "patronage": 3,
      "development": 3,
      "crossroads": 6,
      "practiceReform": 3,
      "publicWorks": 3,
      "crisis": 1,
      "relic": 3,
      "specialRelic": 1,
      "training": 0,
      "discovery": 0,
      "campaign": 0,
      "challenge": 0,
      "neutralMarket": 0.5,
      "classMarket": 0.5,
      "foodShop": 1,
      "housingShop": 1
    },
    "late": {
      "patronage": 1,
      "development": 2,
      "crossroads": 6,
      "practiceReform": 4,
      "publicWorks": 4,
      "crisis": 5,
      "relic": 2.25,
      "specialRelic": 0.75,
      "training": 0,
      "discovery": 0,
      "campaign": 0,
      "challenge": 0,
      "neutralMarket": 1,
      "classMarket": 1,
      "foodShop": 1,
      "housingShop": 1
    }
  }
};
