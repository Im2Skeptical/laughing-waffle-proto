// Authored from Cam's first-pass Lifegraph export. Previous tuning remains an explicit Lab profile.
export const LIFEGRAPH_DEFAULT_GENERATOR = {
  "schemaVersion": 11,
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
        ]
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
        ]
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
        ]
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
        ]
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
        ]
      },
      "crisis": {
        "enabled": true,
        "poolId": "danger",
        "scope": "common",
        "occurrence": "common",
        "timings": [
          "mid",
          "late"
        ]
      },
      "relic": {
        "enabled": true,
        "poolId": "relics",
        "scope": "common",
        "occurrence": "common",
        "timings": [
          "early",
          "mid",
          "late"
        ]
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
        ]
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
        ]
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
        ]
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
        ]
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
        ]
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
        ]
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
        ]
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
        ]
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
        ]
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
        ]
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
        ]
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
        ]
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
        ]
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
        ]
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
        ]
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
        ]
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
        ]
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
      }
    },
    "optionCosts": {
      "patronage": {
        "immediateFavor": {
          "time": "cheap",
          "prestige": "free",
          "risk": "free"
        },
        "longAppointment": {
          "time": "expensive",
          "prestige": "free",
          "risk": "free"
        },
        "cultivateConnections": {
          "time": "fair",
          "prestige": "free",
          "risk": "free"
        }
      },
      "development": {
        "deepStudy": {
          "time": "expensive",
          "prestige": "free",
          "risk": "free"
        },
        "hardLesson": {
          "time": "fair",
          "prestige": "free",
          "risk": "free"
        },
        "steadyPractice": {
          "time": "cheap",
          "prestige": "free",
          "risk": "free"
        }
      },
      "crossroads": {
        "travel": {
          "time": "cheap",
          "prestige": "free",
          "risk": "free"
        },
        "route": {
          "time": "fair",
          "prestige": "fair",
          "risk": "free"
        },
        "tour": {
          "time": "cheap",
          "prestige": "free",
          "risk": "free"
        }
      },
      "training": {
        "train-estate": {
          "time": "cheap",
          "prestige": "free",
          "risk": "free"
        }
      },
      "discovery": {
        "discovery-research": {
          "time": "fair",
          "prestige": "free",
          "risk": "free"
        },
        "discovery-frontier": {
          "time": "expensive",
          "prestige": "free",
          "risk": "cheap"
        }
      },
      "challenge": {
        "challenge-3": {
          "time": "cheap",
          "prestige": "free",
          "risk": "cheap"
        },
        "challenge-6": {
          "time": "fair",
          "prestige": "free",
          "risk": "fair"
        },
        "challenge-9": {
          "time": "expensive",
          "prestige": "free",
          "risk": "expensive"
        }
      },
      "campaign": {
        "attack": {
          "time": "fair",
          "prestige": "expensive",
          "risk": "calculated"
        },
        "duel": {
          "time": "cheap",
          "prestige": "free",
          "risk": "calculated"
        },
        "quest": {
          "time": "fair",
          "prestige": "free",
          "risk": "calculated"
        },
        "leave": {
          "time": "free",
          "prestige": "free",
          "risk": "free"
        }
      },
      "crisis": {
        "relief": {
          "time": "cheap",
          "prestige": "free",
          "risk": "fair"
        },
        "buy-relief": {
          "time": "cheap",
          "prestige": "free",
          "risk": "free"
        },
        "delay": {
          "time": "cheap",
          "prestige": "free",
          "risk": "fair"
        },
        "rescue": {
          "time": "cheap",
          "prestige": "free",
          "risk": "free"
        },
        "observe-crisis": {
          "time": "free",
          "prestige": "free",
          "risk": "free"
        }
      },
      "legacy": {
        "found-settlement": {
          "time": "free",
          "prestige": "free",
          "risk": "free"
        },
        "highest-stat": {
          "time": "free",
          "prestige": "free",
          "risk": "free"
        },
        "accumulated-prestige": {
          "time": "free",
          "prestige": "free",
          "risk": "free"
        }
      },
      "relic": {
        "search": {
          "time": "fair",
          "prestige": "free",
          "risk": "free"
        },
        "dangerousSearch": {
          "time": "fair",
          "prestige": "free",
          "risk": "expensive"
        }
      },
      "signature:legacyPlus": {
        "foundDynasty": {
          "time": "fair",
          "prestige": "expensive",
          "risk": "free"
        },
        "enduringOffice": {
          "time": "fair",
          "prestige": "fair",
          "risk": "free"
        },
        "humbleRemembrance": {
          "time": "free",
          "prestige": "free",
          "risk": "free"
        }
      },
      "signature:settlement": {
        "found": {
          "time": "free",
          "prestige": "expensive",
          "risk": "free"
        },
        "route": {
          "time": "cheap",
          "prestige": "fair",
          "risk": "free"
        },
        "settlement-favor": {
          "time": "free",
          "prestige": "free",
          "risk": "free"
        }
      },
      "signature:monsterHunt": {
        "attack": {
          "time": "fair",
          "prestige": "expensive",
          "risk": "calculated"
        },
        "duel": {
          "time": "cheap",
          "prestige": "free",
          "risk": "calculated"
        },
        "quest": {
          "time": "fair",
          "prestige": "free",
          "risk": "calculated"
        },
        "leave": {
          "time": "free",
          "prestige": "free",
          "risk": "free"
        }
      },
      "signature:removePractice": {
        "remove": {
          "time": "cheap",
          "prestige": "fair",
          "risk": "free"
        },
        "removalFallback": {
          "time": "free",
          "prestige": "free",
          "risk": "free"
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
      "signature:knowledgeShop": {}
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
      "relic": 2,
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
      "relic": 4,
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
      "relic": 3,
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
  "schemaVersion": 11,
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
        ]
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
        ]
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
        ]
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
        ]
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
        ]
      },
      "crisis": {
        "enabled": true,
        "poolId": "danger",
        "scope": "common",
        "occurrence": "common",
        "timings": [
          "mid",
          "late"
        ]
      },
      "relic": {
        "enabled": true,
        "poolId": "relics",
        "scope": "common",
        "occurrence": "common",
        "timings": [
          "early",
          "mid",
          "late"
        ]
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
        ]
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
        ]
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
        ]
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
        ]
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
        ]
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
        ]
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
        ]
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
        ]
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
        ]
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
        ]
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
        ]
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
        ]
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
        ]
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
        ]
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
        ]
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
        ]
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
        ]
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
      }
    },
    "optionCosts": {
      "patronage": {
        "immediateFavor": {
          "time": "cheap",
          "prestige": "free",
          "risk": "free"
        },
        "longAppointment": {
          "time": "expensive",
          "prestige": "free",
          "risk": "free"
        },
        "cultivateConnections": {
          "time": "fair",
          "prestige": "free",
          "risk": "free"
        }
      },
      "development": {
        "deepStudy": {
          "time": "expensive",
          "prestige": "free",
          "risk": "free"
        },
        "hardLesson": {
          "time": "fair",
          "prestige": "free",
          "risk": "free"
        },
        "steadyPractice": {
          "time": "cheap",
          "prestige": "free",
          "risk": "free"
        }
      },
      "crossroads": {
        "travel": {
          "time": "cheap",
          "prestige": "free",
          "risk": "free"
        },
        "route": {
          "time": "fair",
          "prestige": "fair",
          "risk": "free"
        },
        "tour": {
          "time": "cheap",
          "prestige": "free",
          "risk": "free"
        }
      },
      "training": {
        "train-estate": {
          "time": "cheap",
          "prestige": "free",
          "risk": "free"
        }
      },
      "discovery": {
        "discovery-research": {
          "time": "fair",
          "prestige": "free",
          "risk": "free"
        },
        "discovery-frontier": {
          "time": "expensive",
          "prestige": "free",
          "risk": "cheap"
        }
      },
      "challenge": {
        "challenge-3": {
          "time": "cheap",
          "prestige": "free",
          "risk": "cheap"
        },
        "challenge-6": {
          "time": "fair",
          "prestige": "free",
          "risk": "fair"
        },
        "challenge-9": {
          "time": "expensive",
          "prestige": "free",
          "risk": "expensive"
        }
      },
      "campaign": {
        "attack": {
          "time": "fair",
          "prestige": "expensive",
          "risk": "calculated"
        },
        "duel": {
          "time": "cheap",
          "prestige": "free",
          "risk": "calculated"
        },
        "quest": {
          "time": "fair",
          "prestige": "free",
          "risk": "calculated"
        },
        "leave": {
          "time": "free",
          "prestige": "free",
          "risk": "free"
        }
      },
      "crisis": {
        "relief": {
          "time": "cheap",
          "prestige": "free",
          "risk": "fair"
        },
        "buy-relief": {
          "time": "cheap",
          "prestige": "free",
          "risk": "free"
        },
        "delay": {
          "time": "cheap",
          "prestige": "free",
          "risk": "fair"
        },
        "rescue": {
          "time": "cheap",
          "prestige": "free",
          "risk": "free"
        },
        "observe-crisis": {
          "time": "free",
          "prestige": "free",
          "risk": "free"
        }
      },
      "legacy": {
        "found-settlement": {
          "time": "free",
          "prestige": "free",
          "risk": "free"
        },
        "highest-stat": {
          "time": "free",
          "prestige": "free",
          "risk": "free"
        },
        "accumulated-prestige": {
          "time": "free",
          "prestige": "free",
          "risk": "free"
        }
      },
      "relic": {
        "search": {
          "time": "fair",
          "prestige": "free",
          "risk": "free"
        },
        "dangerousSearch": {
          "time": "fair",
          "prestige": "free",
          "risk": "expensive"
        }
      },
      "signature:legacyPlus": {
        "foundDynasty": {
          "time": "fair",
          "prestige": "expensive",
          "risk": "free"
        },
        "enduringOffice": {
          "time": "fair",
          "prestige": "fair",
          "risk": "free"
        },
        "humbleRemembrance": {
          "time": "free",
          "prestige": "free",
          "risk": "free"
        }
      },
      "signature:settlement": {
        "found": {
          "time": "free",
          "prestige": "expensive",
          "risk": "free"
        },
        "route": {
          "time": "cheap",
          "prestige": "fair",
          "risk": "free"
        },
        "settlement-favor": {
          "time": "free",
          "prestige": "free",
          "risk": "free"
        }
      },
      "signature:monsterHunt": {
        "attack": {
          "time": "fair",
          "prestige": "expensive",
          "risk": "calculated"
        },
        "duel": {
          "time": "cheap",
          "prestige": "free",
          "risk": "calculated"
        },
        "quest": {
          "time": "fair",
          "prestige": "free",
          "risk": "calculated"
        },
        "leave": {
          "time": "free",
          "prestige": "free",
          "risk": "free"
        }
      },
      "signature:removePractice": {
        "remove": {
          "time": "cheap",
          "prestige": "fair",
          "risk": "free"
        },
        "removalFallback": {
          "time": "free",
          "prestige": "free",
          "risk": "free"
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
      "signature:knowledgeShop": {}
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
      "relic": 2,
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
      "relic": 4,
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
      "relic": 3,
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
