import { remnantSupplyPracticeDefs, remnantBasicPracticeDefs, remnantBasicStructureDefs } from './remnant-supply-defs.js';
// Audited full-map experimental content. Structures support activating Practices; no independent conversion.
export const fullMapPractices = {
  "fm_oathSupper": {
    "id": "fm_oathSupper",
    "label": "Oath Supper",
    "pool": "warrior",
    "provenance": "warrior",
    "minimumQuality": "bronze",
    "tags": [
      "Civic"
    ],
    "effects": [
      {
        "op": "convertPopulation",
        "amount": 2,
        "filter": {
          "opposing": true,
          "kind": "adults",
          "specialty": "warrior"
        },
        "reach": "local"
      }
    ],
    "consume": [
      {
        "traits": [
          "Edible"
        ],
        "amount": 2
      }
    ],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Consume 2 Edible Stock. Faith phase: Convert up to 2 eligible adults warrior opposing residents to this institution's allegiance; local"
    },
    "category": "influence",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "faith"
    },
    "source": {
      "icon": "faith",
      "cadence": "faith"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [],
    "stockCapacity": 0,
    "costs": [],
    "flavor": "Bread is shared before the oath is spoken."
  },
  "fm_shieldEscorts": {
    "id": "fm_shieldEscorts",
    "label": "Shield Escorts",
    "pool": "warrior",
    "provenance": "warrior",
    "minimumQuality": "bronze",
    "tags": [
      "Civic"
    ],
    "effects": [
      {
        "op": "convertPopulation",
        "amount": 2,
        "filter": {
          "opposing": true,
          "kind": "adults"
        },
        "reach": "connectedAdjacent"
      }
    ],
    "consume": [
      {
        "traits": [
          "Arms"
        ],
        "amount": 1
      },
      {
        "traits": [
          "Edible"
        ],
        "amount": 1
      }
    ],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Consume 1 Arms Stock. Consume 1 Edible Stock. Migration phase: Convert up to 2 eligible adults opposing residents to this institution's allegiance; first eligible adjacent road-connected region"
    },
    "category": "influence",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "migration"
    },
    "source": {
      "icon": "migration",
      "cadence": "migration"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [],
    "stockCapacity": 0,
    "costs": [],
    "flavor": "A shield on the road can win a household at its end."
  },
  "fm_veteransTestimony": {
    "id": "fm_veteransTestimony",
    "label": "Veterans’ Testimony",
    "pool": "warrior",
    "provenance": "warrior",
    "minimumQuality": "bronze",
    "tags": [
      "Civic"
    ],
    "effects": [
      {
        "op": "convertPopulation",
        "amount": 3,
        "filter": {
          "opposing": true,
          "kind": "adults"
        },
        "reach": "local"
      }
    ],
    "consume": [],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Charge on Successful Defense in this settlement. Gain 1 base Charge. At 2 Charge, Discharge: Convert up to 3 eligible adults opposing residents to this institution's allegiance; local."
    },
    "category": "influence",
    "mode": "charge",
    "lane": "charge",
    "activation": {
      "type": "charge"
    },
    "source": {
      "icon": "charge",
      "cadence": "charge"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [],
    "stockCapacity": 0,
    "costs": [],
    "charge": {
      "gain": 1,
      "threshold": 2,
      "triggerText": "When this faction successfully defends this region, gain 1 Charge.",
      "trigger": {
        "any": [
          {
            "kind": "defenseSucceeded"
          }
        ]
      },
      "dischargeText": "Discharge: convert up to 3 opposing local adults to this piece’s faction."
    },
    "flavor": "Those who held the wall have earned a hearing."
  },
  "fm_publicDrills": {
    "id": "fm_publicDrills",
    "label": "Public Drills",
    "pool": "warrior",
    "provenance": "warrior",
    "minimumQuality": "bronze",
    "tags": [
      "Civic"
    ],
    "effects": [
      {
        "op": "convertPopulation",
        "amount": 1,
        "filter": {
          "opposing": true,
          "kind": "adults",
          "specialty": "ordinary"
        },
        "train": "warrior",
        "reach": "local"
      }
    ],
    "consume": [],
    "require": [
      {
        "traits": [
          "Arms"
        ],
        "amount": 1
      }
    ],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Require 1 Arms Stock (kept). Birth phase: Train as Warrior and convert up to 1 eligible adults non-specialist opposing residents to this institution's allegiance; local"
    },
    "category": "influence",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "birth"
    },
    "source": {
      "icon": "birth",
      "cadence": "birth"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [],
    "stockCapacity": 0,
    "costs": [],
    "flavor": "The village learns to stand together."
  },
  "fm_frontierRelief": {
    "id": "fm_frontierRelief",
    "label": "Frontier Relief",
    "pool": "warrior",
    "provenance": "warrior",
    "minimumQuality": "bronze",
    "tags": [
      "Civic"
    ],
    "effects": [
      {
        "op": "convertPopulation",
        "amount": 4,
        "filter": {
          "opposing": true,
          "kind": "adults"
        },
        "reach": "local"
      }
    ],
    "consume": [
      {
        "traits": [
          "Edible"
        ],
        "amount": 3
      }
    ],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Consume 3 Edible Stock. After local shortage: this allegiance must actually supply the civilian meal this Food phase. Food phase, after meals: Convert up to 4 eligible adults opposing residents to this institution's allegiance; local"
    },
    "category": "influence",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "food",
      "stage": "afterMeals"
    },
    "source": {
      "icon": "food",
      "cadence": "food"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [],
    "stockCapacity": 0,
    "costs": [],
    "populationCondition": "relief",
    "flavor": "A full bowl carries the promise of protection."
  },
  "fm_ransomedKin": {
    "id": "fm_ransomedKin",
    "label": "Ransomed Kin",
    "pool": "warrior",
    "provenance": "warrior",
    "minimumQuality": "bronze",
    "tags": [
      "Civic"
    ],
    "effects": [
      {
        "op": "convertPopulation",
        "amount": 2,
        "filter": {
          "opposing": true,
          "kind": "adults",
          "classId": "stranger"
        },
        "reach": "local"
      }
    ],
    "consume": [
      {
        "traits": [
          "Loot"
        ],
        "amount": 2
      }
    ],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Consume 2 Loot Stock. Migration phase: Convert up to 2 eligible stranger adults opposing residents to this institution's allegiance; local"
    },
    "category": "influence",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "migration"
    },
    "source": {
      "icon": "migration",
      "cadence": "migration"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [],
    "stockCapacity": 0,
    "costs": [],
    "flavor": "The spoils of war bring the missing home."
  },
  "fm_swornPatrols": {
    "id": "fm_swornPatrols",
    "label": "Sworn Patrols",
    "pool": "warrior",
    "provenance": "warrior",
    "minimumQuality": "bronze",
    "tags": [
      "Civic"
    ],
    "effects": [
      {
        "op": "convertPopulation",
        "amount": 1,
        "filter": {
          "opposing": true,
          "kind": "adults"
        },
        "reach": "local"
      },
      {
        "op": "politicalForce",
        "amount": 1,
        "defenseOnly": false,
        "duration": "moon"
      }
    ],
    "consume": [
      {
        "traits": [
          "Arms"
        ],
        "amount": 1
      },
      {
        "traits": [
          "Edible"
        ],
        "amount": 1
      }
    ],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Consume 1 Arms Stock. Consume 1 Edible Stock. Death phase: Convert up to 1 eligible adults opposing residents to this institution's allegiance; local Death phase: +1 supplied occupation Force until next moon (refreshes)"
    },
    "category": "influence",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "death"
    },
    "source": {
      "icon": "death",
      "cadence": "death"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [],
    "stockCapacity": 0,
    "costs": [],
    "flavor": "The oath walks the streets after dark."
  },
  "fm_openLessons": {
    "id": "fm_openLessons",
    "label": "Open Lessons",
    "pool": "scholar",
    "provenance": "scholar",
    "minimumQuality": "bronze",
    "tags": [
      "Civic",
      "Knowledge"
    ],
    "effects": [
      {
        "op": "convertPopulation",
        "amount": 2,
        "filter": {
          "opposing": true,
          "kind": "children"
        },
        "reach": "local"
      }
    ],
    "consume": [],
    "require": [
      {
        "traits": [
          "Record"
        ],
        "amount": 1
      }
    ],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Require 1 Record Stock (kept). Birth phase: Convert up to 2 eligible children opposing residents to this institution's allegiance; local"
    },
    "category": "influence",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "birth"
    },
    "source": {
      "icon": "birth",
      "cadence": "birth"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [],
    "stockCapacity": 0,
    "costs": [],
    "flavor": "The doors open before the children learn to knock."
  },
  "fm_civicRegisters": {
    "id": "fm_civicRegisters",
    "label": "Civic Registers",
    "pool": "scholar",
    "provenance": "scholar",
    "minimumQuality": "bronze",
    "tags": [
      "Civic",
      "Knowledge"
    ],
    "effects": [
      {
        "op": "convertPopulation",
        "amount": 2,
        "filter": {
          "opposing": true,
          "kind": "adults"
        },
        "reach": "local"
      }
    ],
    "consume": [
      {
        "traits": [
          "Record"
        ],
        "amount": 1
      }
    ],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Consume 1 Record Stock. Housing must cover every local resident. Housing phase: Convert up to 2 eligible adults opposing residents to this institution's allegiance; local"
    },
    "category": "influence",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "housing"
    },
    "source": {
      "icon": "housing",
      "cadence": "housing"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [],
    "stockCapacity": 0,
    "costs": [],
    "populationCondition": "housed",
    "flavor": "A name in the register becomes a place in the realm."
  },
  "fm_publicDisputation": {
    "id": "fm_publicDisputation",
    "label": "Public Disputation",
    "pool": "scholar",
    "provenance": "scholar",
    "minimumQuality": "bronze",
    "tags": [
      "Civic",
      "Knowledge"
    ],
    "effects": [
      {
        "op": "research",
        "amount": 2
      },
      {
        "op": "convertPopulation",
        "amount": 1,
        "filter": {
          "opposing": true,
          "specialty": "scholar"
        },
        "reach": "local"
      }
    ],
    "consume": [
      {
        "traits": [
          "Record"
        ],
        "amount": 1
      }
    ],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Consume 1 Record Stock. Faith phase: Gain 2 Research Faith phase: Convert up to 1 eligible scholar opposing residents to this institution's allegiance; local"
    },
    "category": "influence",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "faith"
    },
    "source": {
      "icon": "faith",
      "cadence": "faith"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [],
    "stockCapacity": 0,
    "costs": [],
    "flavor": "A crowded hall can change the mind of a city."
  },
  "fm_travellingTutors": {
    "id": "fm_travellingTutors",
    "label": "Travelling Tutors",
    "pool": "scholar",
    "provenance": "scholar",
    "minimumQuality": "bronze",
    "tags": [
      "Civic",
      "Knowledge"
    ],
    "effects": [
      {
        "op": "convertPopulation",
        "amount": 2,
        "filter": {
          "opposing": true,
          "kind": "children"
        },
        "reach": "connectedAdjacent"
      }
    ],
    "consume": [
      {
        "traits": [
          "Paper"
        ],
        "amount": 1
      },
      {
        "traits": [
          "Edible"
        ],
        "amount": 1
      }
    ],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Consume 1 Paper Stock. Consume 1 Edible Stock. Migration phase: Convert up to 2 eligible children opposing residents to this institution's allegiance; first eligible adjacent road-connected region"
    },
    "category": "influence",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "migration"
    },
    "source": {
      "icon": "migration",
      "cadence": "migration"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [],
    "stockCapacity": 0,
    "costs": [],
    "flavor": "Lessons follow the road beyond the city walls."
  },
  "fm_commonMeasures": {
    "id": "fm_commonMeasures",
    "label": "Common Measures",
    "pool": "scholar",
    "provenance": "scholar",
    "minimumQuality": "bronze",
    "tags": [
      "Civic",
      "Knowledge"
    ],
    "effects": [
      {
        "op": "generateStock",
        "amount": 2
      }
    ],
    "consume": [
      {
        "traits": [
          "Tool"
        ],
        "amount": 1
      }
    ],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Consume 1 Tool Stock. Birth phase: Produce 2 Stock"
    },
    "category": "resource",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "birth"
    },
    "source": {
      "icon": "birth",
      "cadence": "birth"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [
      "Currency"
    ],
    "stockCapacity": 4,
    "costs": [],
    "flavor": "A trusted measure makes a market possible."
  },
  "fm_copiedCharters": {
    "id": "fm_copiedCharters",
    "label": "Copied Charters",
    "pool": "scholar",
    "provenance": "scholar",
    "minimumQuality": "bronze",
    "tags": [
      "Civic",
      "Knowledge"
    ],
    "effects": [
      {
        "op": "convertPopulation",
        "amount": 2,
        "filter": {
          "opposing": true,
          "kind": "adults"
        },
        "reach": "local"
      }
    ],
    "consume": [],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Charge on Stock production in this settlement (Stock with Record); another Practice only. Gain 1 base Charge. At 3 Charge, Discharge: Convert up to 2 eligible adults opposing residents to this institution's allegiance; local."
    },
    "category": "influence",
    "mode": "charge",
    "lane": "charge",
    "activation": {
      "type": "charge"
    },
    "source": {
      "icon": "charge",
      "cadence": "charge"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [],
    "stockCapacity": 0,
    "costs": [],
    "charge": {
      "gain": 1,
      "threshold": 3,
      "triggerText": "When another local Practice generates Record Stock, gain 1 Charge.",
      "trigger": {
        "any": [
          {
            "kind": "stockGenerated",
            "traitsAny": [
              "Record"
            ]
          }
        ],
        "anotherPractice": true
      },
      "dischargeText": "Discharge: convert up to 2 opposing local adults to this piece’s faction."
    },
    "flavor": "One charter becomes a hundred promises."
  },
  "fm_sharedWorkshops": {
    "id": "fm_sharedWorkshops",
    "label": "Shared Workshops",
    "pool": "scholar",
    "provenance": "scholar",
    "minimumQuality": "bronze",
    "tags": [
      "Civic",
      "Knowledge"
    ],
    "effects": [
      {
        "op": "convertPopulation",
        "amount": 1,
        "filter": {
          "opposing": true,
          "kind": "adults",
          "specialty": "ordinary"
        },
        "train": "scholar",
        "reach": "local"
      }
    ],
    "consume": [
      {
        "traits": [
          "Tool"
        ],
        "amount": 1
      }
    ],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Consume 1 Tool Stock. Housing phase: Train as Scholar and convert up to 1 eligible adults non-specialist opposing residents to this institution's allegiance; local"
    },
    "category": "influence",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "housing"
    },
    "source": {
      "icon": "housing",
      "cadence": "housing"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [],
    "stockCapacity": 0,
    "costs": [],
    "flavor": "At the same bench, strangers learn the same craft."
  },
  "fm_fallowFields": {
    "id": "fm_fallowFields",
    "label": "Fallow Fields",
    "pool": "common",
    "provenance": "neutral",
    "minimumQuality": "bronze",
    "tags": [
      "Civic",
      "Food"
    ],
    "effects": [
      {
        "op": "generateStock",
        "amount": 2
      }
    ],
    "consume": [],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Autumn: Produce 2 Stock"
    },
    "category": "resource",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "season",
      "seasonKeys": [
        "autumn"
      ]
    },
    "source": {
      "icon": "season",
      "cadence": "season"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [
      "Grain",
      "Edible"
    ],
    "stockCapacity": 4,
    "costs": [],
    "flavor": "The old furrows still yield a little grain."
  },
  "fm_handQuern": {
    "id": "fm_handQuern",
    "label": "Hand Quern",
    "pool": "common",
    "provenance": "neutral",
    "minimumQuality": "bronze",
    "tags": [
      "Civic",
      "Food"
    ],
    "effects": [
      {
        "op": "generateStock",
        "amount": 2
      }
    ],
    "consume": [
      {
        "traits": [
          "Grain"
        ],
        "amount": 1
      }
    ],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Consume 1 Grain Stock. Food phase, before meals: Produce 2 Stock"
    },
    "category": "resource",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "food",
      "stage": "preRouting"
    },
    "source": {
      "icon": "food",
      "cadence": "food"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [
      "Edible"
    ],
    "stockCapacity": 4,
    "costs": [],
    "flavor": "The stone turns by hand, one meal at a time."
  },
  "fm_woodlotRights": {
    "id": "fm_woodlotRights",
    "label": "Woodlot Rights",
    "pool": "common",
    "provenance": "neutral",
    "minimumQuality": "bronze",
    "tags": [
      "Civic"
    ],
    "effects": [
      {
        "op": "generateStock",
        "amount": 1
      }
    ],
    "consume": [],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Spring: Produce 1 Stock Summer: Produce 1 Stock Autumn: Produce 1 Stock"
    },
    "category": "resource",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "season",
      "seasonKeys": [
        "spring",
        "summer",
        "autumn"
      ]
    },
    "source": {
      "icon": "season",
      "cadence": "season"
    },
    "workerCapacity": 1,
    "workerBonus": 1,
    "stockTraits": [
      "Timber",
      "Construction"
    ],
    "stockCapacity": 3,
    "costs": [],
    "flavor": "The village takes what the old grant still allows."
  },
  "fm_rubblePicking": {
    "id": "fm_rubblePicking",
    "label": "Rubble Picking",
    "pool": "common",
    "provenance": "neutral",
    "minimumQuality": "bronze",
    "tags": [
      "Civic"
    ],
    "effects": [
      {
        "op": "generateStock",
        "amount": 1
      }
    ],
    "consume": [],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Summer: Produce 1 Stock Autumn: Produce 1 Stock"
    },
    "category": "resource",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "season",
      "seasonKeys": [
        "summer",
        "autumn"
      ]
    },
    "source": {
      "icon": "season",
      "cadence": "season"
    },
    "workerCapacity": 1,
    "workerBonus": 1,
    "stockTraits": [
      "Stone",
      "Construction"
    ],
    "stockCapacity": 2,
    "costs": [],
    "flavor": "Yesterday's wall becomes tomorrow's foundation."
  },
  "fm_villageWell": {
    "id": "fm_villageWell",
    "label": "Village Well",
    "pool": "common",
    "provenance": "neutral",
    "minimumQuality": "bronze",
    "tags": [
      "Civic"
    ],
    "effects": [
      {
        "op": "generateStock",
        "amount": 1
      }
    ],
    "consume": [],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Spring: Produce 1 Stock Summer: Produce 1 Stock Autumn: Produce 1 Stock"
    },
    "category": "resource",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "season",
      "seasonKeys": [
        "spring",
        "summer",
        "autumn"
      ]
    },
    "source": {
      "icon": "season",
      "cadence": "season"
    },
    "workerCapacity": 1,
    "workerBonus": 1,
    "stockTraits": [
      "Water"
    ],
    "stockCapacity": 2,
    "costs": [],
    "flavor": "A worn rope still brings water into the light."
  },
  "fm_patchworkSmithy": {
    "id": "fm_patchworkSmithy",
    "label": "Patchwork Smithy",
    "pool": "common",
    "provenance": "neutral",
    "minimumQuality": "bronze",
    "tags": [
      "Civic"
    ],
    "effects": [
      {
        "op": "generateStock",
        "amount": 1
      }
    ],
    "consume": [
      {
        "traits": [
          "Ore"
        ],
        "amount": 1
      },
      {
        "traits": [
          "Fuel"
        ],
        "amount": 1
      }
    ],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Consume 1 Ore Stock. Consume 1 Fuel Stock. Summer: Produce 1 Stock"
    },
    "category": "resource",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "season",
      "seasonKeys": [
        "summer"
      ]
    },
    "source": {
      "icon": "season",
      "cadence": "season"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [
      "Tool",
      "Metal"
    ],
    "stockCapacity": 2,
    "costs": [],
    "flavor": "The forge survives on repairs to its own repairs."
  },
  "fm_scrapGathering": {
    "id": "fm_scrapGathering",
    "label": "Scrap Gathering",
    "pool": "common",
    "provenance": "neutral",
    "minimumQuality": "bronze",
    "tags": [
      "Civic"
    ],
    "effects": [
      {
        "op": "generateStock",
        "amount": 1
      }
    ],
    "consume": [],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Death phase: Produce 1 Stock"
    },
    "category": "resource",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "death"
    },
    "source": {
      "icon": "death",
      "cadence": "death"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [
      "Metal"
    ],
    "stockCapacity": 2,
    "costs": [],
    "flavor": "What the old city discarded still has a use."
  },
  "fm_peatCutting": {
    "id": "fm_peatCutting",
    "label": "Peat Cutting",
    "pool": "common",
    "provenance": "neutral",
    "minimumQuality": "bronze",
    "tags": [
      "Civic"
    ],
    "effects": [
      {
        "op": "generateStock",
        "amount": 2
      }
    ],
    "consume": [],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Autumn: Produce 2 Stock"
    },
    "category": "resource",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "season",
      "seasonKeys": [
        "autumn"
      ]
    },
    "source": {
      "icon": "season",
      "cadence": "season"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [
      "Fuel",
      "Plant"
    ],
    "stockCapacity": 3,
    "costs": [],
    "flavor": "The wet ground keeps a poor hearth burning."
  },
  "fm_ragPulping": {
    "id": "fm_ragPulping",
    "label": "Rag Pulping",
    "pool": "common",
    "provenance": "neutral",
    "minimumQuality": "bronze",
    "tags": [
      "Civic"
    ],
    "effects": [
      {
        "op": "generateStock",
        "amount": 2
      }
    ],
    "consume": [
      {
        "traits": [
          "Cloth"
        ],
        "amount": 1
      }
    ],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Consume 1 Cloth Stock. Birth phase: Produce 2 Stock"
    },
    "category": "resource",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "birth"
    },
    "source": {
      "icon": "birth",
      "cadence": "birth"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [
      "Paper"
    ],
    "stockCapacity": 4,
    "costs": [],
    "flavor": "Worn cloth finds one last service in the vat."
  },
  "fm_hearthBarter": {
    "id": "fm_hearthBarter",
    "label": "Hearth Barter",
    "pool": "common",
    "provenance": "neutral",
    "minimumQuality": "bronze",
    "tags": [
      "Civic"
    ],
    "effects": [
      {
        "op": "generateStock",
        "amount": 1
      }
    ],
    "consume": [],
    "require": [],
    "condition": "diverseStock",
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Requires two stocked Practices with different Stock traits in the supply network. Food phase, before meals: Produce 1 Stock"
    },
    "category": "resource",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "food",
      "stage": "preRouting"
    },
    "source": {
      "icon": "food",
      "cadence": "food"
    },
    "workerCapacity": 1,
    "workerBonus": 1,
    "stockTraits": [
      "Currency"
    ],
    "stockCapacity": 1,
    "costs": [],
    "flavor": "A little changes hands beside the common fire."
  },
  "fm_debtService": {
    "id": "fm_debtService",
    "label": "Debt Service",
    "pool": "common",
    "provenance": "neutral",
    "minimumQuality": "bronze",
    "tags": [
      "Civic"
    ],
    "effects": [
      {
        "op": "convertPopulation",
        "amount": 2,
        "filter": {
          "opposing": true,
          "kind": "adults"
        },
        "reach": "local"
      }
    ],
    "consume": [
      {
        "traits": [
          "Currency"
        ],
        "amount": 2
      }
    ],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Consume 2 Currency Stock. Birth phase: Convert up to 2 eligible adults opposing residents to this institution's allegiance; local"
    },
    "category": "influence",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "birth"
    },
    "source": {
      "icon": "birth",
      "cadence": "birth"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [],
    "stockCapacity": 0,
    "costs": [],
    "flavor": "The creditor remembers what the village would forget."
  },
  "fm_forcedPageantry": {
    "id": "fm_forcedPageantry",
    "label": "Forced Pageantry",
    "pool": "common",
    "provenance": "neutral",
    "minimumQuality": "bronze",
    "tags": [
      "Civic"
    ],
    "effects": [
      {
        "op": "convertPopulation",
        "amount": 1,
        "filter": {
          "opposing": true,
          "kind": "children"
        },
        "reach": "local"
      }
    ],
    "consume": [
      {
        "traits": [
          "Edible"
        ],
        "amount": 1
      }
    ],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Consume 1 Edible Stock. Faith phase: Convert up to 1 eligible children opposing residents to this institution's allegiance; local"
    },
    "category": "influence",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "faith"
    },
    "source": {
      "icon": "faith",
      "cadence": "faith"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [],
    "stockCapacity": 0,
    "costs": [],
    "flavor": "The children learn the song before they learn its meaning."
  },
  "fm_taxFarming": {
    "id": "fm_taxFarming",
    "label": "Tax Farming",
    "pool": "common",
    "provenance": "neutral",
    "minimumQuality": "bronze",
    "tags": [
      "Civic"
    ],
    "effects": [
      {
        "op": "generateStock",
        "amount": 1
      }
    ],
    "consume": [
      {
        "traits": [
          "Edible"
        ],
        "amount": 2
      }
    ],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Consume 2 Edible Stock. Autumn: Produce 1 Stock"
    },
    "category": "resource",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "season",
      "seasonKeys": [
        "autumn"
      ]
    },
    "source": {
      "icon": "season",
      "cadence": "season"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [
      "Currency"
    ],
    "stockCapacity": 3,
    "costs": [],
    "flavor": "The collector's table fills before the village stores."
  },
  "fm_grainTithe": {
    "id": "fm_grainTithe",
    "label": "Grain Tithe",
    "pool": "common",
    "provenance": "neutral",
    "minimumQuality": "bronze",
    "tags": [
      "Civic"
    ],
    "effects": [
      {
        "op": "convertPopulation",
        "amount": 1,
        "filter": {
          "opposing": true,
          "kind": "adults"
        },
        "reach": "local"
      }
    ],
    "consume": [
      {
        "traits": [
          "Grain"
        ],
        "amount": 2
      }
    ],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Consume 2 Grain Stock. Autumn: Convert up to 1 eligible adults opposing residents to this institution's allegiance; local"
    },
    "category": "influence",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "season",
      "seasonKeys": [
        "autumn"
      ]
    },
    "source": {
      "icon": "season",
      "cadence": "season"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [],
    "stockCapacity": 0,
    "costs": [],
    "flavor": "The last sack still belongs to the lord."
  },
  "fm_seigneurialMuster": {
    "id": "fm_seigneurialMuster",
    "label": "Seigneurial Muster",
    "pool": "warrior",
    "provenance": "neutral",
    "minimumQuality": "bronze",
    "tags": [
      "Civic"
    ],
    "effects": [
      {
        "op": "convertPopulation",
        "amount": 1,
        "filter": {
          "opposing": true,
          "kind": "adults",
          "specialty": "ordinary"
        },
        "train": "warrior",
        "reach": "local"
      }
    ],
    "consume": [],
    "require": [
      {
        "traits": [
          "Arms"
        ],
        "amount": 1
      }
    ],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Require 1 Arms Stock (kept). Birth phase: Train as Warrior and convert up to 1 eligible adults non-specialist opposing residents to this institution's allegiance; local"
    },
    "category": "influence",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "birth"
    },
    "source": {
      "icon": "birth",
      "cadence": "birth"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [],
    "stockCapacity": 0,
    "costs": [],
    "flavor": "The lord calls; the village takes up arms."
  },
  "fm_closedSchool": {
    "id": "fm_closedSchool",
    "label": "Closed School",
    "pool": "common",
    "provenance": "neutral",
    "minimumQuality": "bronze",
    "tags": [
      "Civic"
    ],
    "effects": [
      {
        "op": "research",
        "amount": 1
      },
      {
        "op": "convertPopulation",
        "amount": 1,
        "filter": {
          "opposing": true,
          "kind": "children"
        },
        "reach": "local"
      }
    ],
    "consume": [
      {
        "traits": [
          "Record"
        ],
        "amount": 1
      }
    ],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Consume 1 Record Stock. Birth phase: Gain 1 Research Birth phase: Convert up to 1 eligible children opposing residents to this institution's allegiance; local"
    },
    "category": "influence",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "birth"
    },
    "source": {
      "icon": "birth",
      "cadence": "birth"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [],
    "stockCapacity": 0,
    "costs": [],
    "flavor": "The shutters open only for a favoured few."
  },
  "fm_guildFees": {
    "id": "fm_guildFees",
    "label": "Guild Fees",
    "pool": "common",
    "provenance": "neutral",
    "minimumQuality": "bronze",
    "tags": [
      "Civic"
    ],
    "effects": [
      {
        "op": "generateStock",
        "amount": 1
      }
    ],
    "consume": [
      {
        "traits": [
          "Tool"
        ],
        "amount": 1
      }
    ],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Consume 1 Tool Stock. Housing phase: Produce 1 Stock"
    },
    "category": "resource",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "housing"
    },
    "source": {
      "icon": "housing",
      "cadence": "housing"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [
      "Currency"
    ],
    "stockCapacity": 2,
    "costs": [],
    "flavor": "The bench is shared only after the fee is paid."
  },
  "fm_spoiledStores": {
    "id": "fm_spoiledStores",
    "label": "Spoiled Stores",
    "pool": "common",
    "provenance": "neutral",
    "minimumQuality": "bronze",
    "tags": [
      "Civic"
    ],
    "effects": [],
    "consume": [
      {
        "traits": [
          "Edible"
        ],
        "amount": 1
      }
    ],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Consume 1 Edible Stock. Death phase: Lose 1 Edible Stock"
    },
    "category": "resource",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "death"
    },
    "source": {
      "icon": "death",
      "cadence": "death"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [],
    "stockCapacity": 0,
    "costs": [],
    "flavor": "Another meal is lost behind the locked door."
  },
  "fm_courtGossip": {
    "id": "fm_courtGossip",
    "label": "Court Gossip",
    "pool": "common",
    "provenance": "neutral",
    "minimumQuality": "bronze",
    "tags": [
      "Civic"
    ],
    "effects": [
      {
        "op": "convertPopulation",
        "amount": 1,
        "filter": {
          "opposing": true,
          "kind": "adults"
        },
        "reach": "local"
      }
    ],
    "consume": [
      {
        "traits": [
          "Currency"
        ],
        "amount": 1
      }
    ],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Consume 1 Currency Stock. Faith phase: Convert up to 1 eligible adults opposing residents to this institution's allegiance; local"
    },
    "category": "influence",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "faith"
    },
    "source": {
      "icon": "faith",
      "cadence": "faith"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [],
    "stockCapacity": 0,
    "costs": [],
    "flavor": "A paid whisper travels farther than a public promise."
  },
  "fm_roadsideAlms": {
    "id": "fm_roadsideAlms",
    "label": "Roadside Alms",
    "pool": "common",
    "provenance": "neutral",
    "minimumQuality": "bronze",
    "tags": [
      "Civic"
    ],
    "effects": [
      {
        "op": "convertPopulation",
        "amount": 1,
        "filter": {
          "opposing": true,
          "kind": "adults",
          "classId": "stranger"
        },
        "reach": "local"
      }
    ],
    "consume": [
      {
        "traits": [
          "Edible"
        ],
        "amount": 1
      }
    ],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Consume 1 Edible Stock. Migration phase: Convert up to 1 eligible stranger adults opposing residents to this institution's allegiance; local"
    },
    "category": "influence",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "migration"
    },
    "source": {
      "icon": "migration",
      "cadence": "migration"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [],
    "stockCapacity": 0,
    "costs": [],
    "flavor": "A stranger remembers the hand that offered bread."
  },
  "fe_rationRoll": {
    "id": "fe_rationRoll",
    "label": "Ration Roll",
    "pool": "warrior",
    "provenance": "dictator",
    "minimumQuality": "bronze",
    "tags": [
      "Civic"
    ],
    "effects": [
      {
        "op": "convertPopulation",
        "amount": 1,
        "filter": {
          "opposing": true,
          "kind": "adults",
          "specialty": "warrior"
        },
        "reach": "local"
      }
    ],
    "consume": [
      {
        "traits": [
          "Edible"
        ],
        "amount": 1
      }
    ],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Consume 1 Edible Stock. Food phase, before meals: Convert up to 1 eligible adults warrior opposing residents to this institution's allegiance; local"
    },
    "category": "influence",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "food",
      "stage": "preRouting"
    },
    "source": {
      "icon": "food",
      "cadence": "food"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [],
    "stockCapacity": 0,
    "costs": [],
    "flavor": "The soldier's name is called before the bowl is filled."
  },
  "fe_barrackLevy": {
    "id": "fe_barrackLevy",
    "label": "Barrack Levy",
    "pool": "warrior",
    "provenance": "dictator",
    "minimumQuality": "bronze",
    "tags": [
      "Civic"
    ],
    "effects": [
      {
        "op": "convertPopulation",
        "amount": 1,
        "filter": {
          "opposing": true,
          "kind": "adults",
          "specialty": "ordinary"
        },
        "train": "warrior",
        "reach": "local"
      }
    ],
    "consume": [],
    "require": [
      {
        "traits": [
          "Arms"
        ],
        "amount": 1
      }
    ],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Require 1 Arms Stock (kept). Birth phase: Train as Warrior and convert up to 1 eligible adults non-specialist opposing residents to this institution's allegiance; local"
    },
    "category": "influence",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "birth"
    },
    "source": {
      "icon": "birth",
      "cadence": "birth"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [],
    "stockCapacity": 0,
    "costs": [],
    "flavor": "Every empty bunk waits for another recruit."
  },
  "fe_roadRequisition": {
    "id": "fe_roadRequisition",
    "label": "Road Requisition",
    "pool": "warrior",
    "provenance": "dictator",
    "minimumQuality": "bronze",
    "tags": [
      "Civic"
    ],
    "effects": [
      {
        "op": "generateStock",
        "amount": 1
      }
    ],
    "consume": [
      {
        "traits": [
          "Edible"
        ],
        "amount": 2
      }
    ],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Consume 2 Edible Stock. Migration phase: Produce 1 Stock"
    },
    "category": "resource",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "migration"
    },
    "source": {
      "icon": "migration",
      "cadence": "migration"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [
      "Arms"
    ],
    "stockCapacity": 3,
    "costs": [],
    "flavor": "The road feeds the garrison before it feeds the town."
  },
  "fe_salvageDetail": {
    "id": "fe_salvageDetail",
    "label": "Salvage Detail",
    "pool": "warrior",
    "provenance": "dictator",
    "minimumQuality": "bronze",
    "tags": [
      "Civic"
    ],
    "effects": [
      {
        "op": "generateStock",
        "amount": 2
      }
    ],
    "consume": [],
    "require": [
      {
        "traits": [
          "Arms"
        ],
        "amount": 1
      }
    ],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Require 1 Arms Stock (kept). Death phase: Produce 2 Stock"
    },
    "category": "resource",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "death"
    },
    "source": {
      "icon": "death",
      "cadence": "death"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [
      "Metal"
    ],
    "stockCapacity": 3,
    "costs": [],
    "flavor": "The armed detail takes what the ruins still hold."
  },
  "fe_curfewRounds": {
    "id": "fe_curfewRounds",
    "label": "Curfew Rounds",
    "pool": "warrior",
    "provenance": "dictator",
    "minimumQuality": "bronze",
    "tags": [
      "Civic"
    ],
    "effects": [
      {
        "op": "politicalForce",
        "amount": 1,
        "defenseOnly": false,
        "duration": "moon"
      }
    ],
    "consume": [
      {
        "traits": [
          "Edible"
        ],
        "amount": 1
      }
    ],
    "require": [
      {
        "traits": [
          "Arms"
        ],
        "amount": 1
      }
    ],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Consume 1 Edible Stock. Require 1 Arms Stock (kept). Death phase: +1 supplied occupation Force until next moon (refreshes)"
    },
    "category": "influence",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "death"
    },
    "source": {
      "icon": "death",
      "cadence": "death"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [],
    "stockCapacity": 0,
    "costs": [],
    "flavor": "The streets belong to the patrol after dusk."
  },
  "fe_arsenalQuotas": {
    "id": "fe_arsenalQuotas",
    "label": "Arsenal Quotas",
    "pool": "warrior",
    "provenance": "dictator",
    "minimumQuality": "silver",
    "tags": [
      "Civic"
    ],
    "effects": [
      {
        "op": "generateStock",
        "amount": 3
      }
    ],
    "consume": [
      {
        "traits": [
          "Metal"
        ],
        "amount": 1
      },
      {
        "traits": [
          "Fuel"
        ],
        "amount": 2
      }
    ],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Consume 1 Metal Stock. Consume 2 Fuel Stock. Summer: Produce 3 Stock"
    },
    "category": "resource",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "season",
      "seasonKeys": [
        "summer"
      ]
    },
    "source": {
      "icon": "season",
      "cadence": "season"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [
      "Arms"
    ],
    "stockCapacity": 6,
    "costs": [],
    "flavor": "The furnace must meet its count before the workers rest."
  },
  "fe_billetingOrders": {
    "id": "fe_billetingOrders",
    "label": "Billeting Orders",
    "pool": "warrior",
    "provenance": "dictator",
    "minimumQuality": "silver",
    "tags": [
      "Civic"
    ],
    "effects": [
      {
        "op": "convertPopulation",
        "amount": 2,
        "filter": {
          "opposing": true,
          "kind": "adults"
        },
        "reach": "local"
      }
    ],
    "consume": [
      {
        "traits": [
          "Edible"
        ],
        "amount": 2
      }
    ],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Consume 2 Edible Stock. Housing phase: Convert up to 2 eligible adults opposing residents to this institution's allegiance; local"
    },
    "category": "influence",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "housing"
    },
    "source": {
      "icon": "housing",
      "cadence": "housing"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [],
    "stockCapacity": 0,
    "costs": [],
    "flavor": "The garrison makes its home at another household's table."
  },
  "fe_victoryProcession": {
    "id": "fe_victoryProcession",
    "label": "Victory Procession",
    "pool": "warrior",
    "provenance": "dictator",
    "minimumQuality": "silver",
    "tags": [
      "Civic"
    ],
    "effects": [
      {
        "op": "convertPopulation",
        "amount": 3,
        "filter": {
          "opposing": true,
          "kind": "adults"
        },
        "reach": "local"
      }
    ],
    "consume": [
      {
        "traits": [
          "Loot"
        ],
        "amount": 1
      },
      {
        "traits": [
          "Edible"
        ],
        "amount": 1
      }
    ],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Consume 1 Loot Stock. Consume 1 Edible Stock. Faith phase: Convert up to 3 eligible adults opposing residents to this institution's allegiance; local"
    },
    "category": "influence",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "faith"
    },
    "source": {
      "icon": "faith",
      "cadence": "faith"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [],
    "stockCapacity": 0,
    "costs": [],
    "flavor": "The spoils are paraded before they are divided."
  },
  "fe_borderOaths": {
    "id": "fe_borderOaths",
    "label": "Border Oaths",
    "pool": "warrior",
    "provenance": "dictator",
    "minimumQuality": "silver",
    "tags": [
      "Civic"
    ],
    "effects": [
      {
        "op": "convertPopulation",
        "amount": 2,
        "filter": {
          "opposing": true,
          "kind": "adults",
          "specialty": "warrior"
        },
        "reach": "connectedAdjacent"
      }
    ],
    "consume": [
      {
        "traits": [
          "Arms"
        ],
        "amount": 1
      },
      {
        "traits": [
          "Record"
        ],
        "amount": 1
      }
    ],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Consume 1 Arms Stock. Consume 1 Record Stock. Migration phase: Convert up to 2 eligible adults warrior opposing residents to this institution's allegiance; first eligible adjacent road-connected region"
    },
    "category": "influence",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "migration"
    },
    "source": {
      "icon": "migration",
      "cadence": "migration"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [],
    "stockCapacity": 0,
    "costs": [],
    "flavor": "The oath crosses the border under armed escort."
  },
  "fe_capitalDole": {
    "id": "fe_capitalDole",
    "label": "Capital Dole",
    "pool": "warrior",
    "provenance": "dictator",
    "minimumQuality": "gold",
    "tags": [
      "Civic"
    ],
    "effects": [
      {
        "op": "convertPopulation",
        "amount": 5,
        "filter": {
          "opposing": true,
          "kind": "adults"
        },
        "reach": "local"
      }
    ],
    "consume": [
      {
        "traits": [
          "Edible"
        ],
        "amount": 4
      }
    ],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Consume 4 Edible Stock. Housing must cover every local resident. Food phase, before meals: Convert up to 5 eligible adults opposing residents to this institution's allegiance; local"
    },
    "category": "influence",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "food",
      "stage": "preRouting"
    },
    "source": {
      "icon": "food",
      "cadence": "food"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [],
    "stockCapacity": 0,
    "costs": [],
    "populationCondition": "housed",
    "flavor": "The capital measures loyalty by the bread it gives."
  },
  "fe_officersFeast": {
    "id": "fe_officersFeast",
    "label": "Officers’ Feast",
    "pool": "warrior",
    "provenance": "dictator",
    "minimumQuality": "gold",
    "tags": [
      "Civic"
    ],
    "effects": [
      {
        "op": "convertPopulation",
        "amount": 3,
        "filter": {
          "opposing": true,
          "specialty": "warrior"
        },
        "reach": "local"
      }
    ],
    "consume": [
      {
        "traits": [
          "Edible"
        ],
        "amount": 3
      },
      {
        "traits": [
          "Currency"
        ],
        "amount": 2
      }
    ],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Consume 3 Edible Stock. Consume 2 Currency Stock. Faith phase: Convert up to 3 eligible warrior opposing residents to this institution's allegiance; local"
    },
    "category": "influence",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "faith"
    },
    "source": {
      "icon": "faith",
      "cadence": "faith"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [],
    "stockCapacity": 0,
    "costs": [],
    "flavor": "The officers renew their promises over a costly table."
  },
  "fe_siegeRehearsals": {
    "id": "fe_siegeRehearsals",
    "label": "Siege Rehearsals",
    "pool": "warrior",
    "provenance": "dictator",
    "minimumQuality": "gold",
    "tags": [
      "Civic"
    ],
    "effects": [
      {
        "op": "politicalForce",
        "amount": 4,
        "defenseOnly": true,
        "duration": "year"
      }
    ],
    "consume": [
      {
        "traits": [
          "Arms"
        ],
        "amount": 2
      },
      {
        "traits": [
          "Edible"
        ],
        "amount": 2
      }
    ],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Consume 2 Arms Stock. Consume 2 Edible Stock. Summer: +4 supplied monster defence Force until next year (refreshes)"
    },
    "category": "influence",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "season",
      "seasonKeys": [
        "summer"
      ]
    },
    "source": {
      "icon": "season",
      "cadence": "season"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [],
    "stockCapacity": 0,
    "costs": [],
    "flavor": "The walls are defended long before the siege arrives."
  },
  "cp_ironCommunion": {
    "id": "cp_ironCommunion",
    "label": "Iron Communion",
    "pool": "warrior",
    "provenance": "dictator",
    "minimumQuality": "gold",
    "tags": [
      "Civic"
    ],
    "effects": [
      {
        "op": "generateStock",
        "amount": 4
      }
    ],
    "consume": [],
    "require": [
      {
        "traits": [
          "Arms"
        ],
        "amount": 2
      }
    ],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Require 2 Arms Stock (kept). Sacrifice 1 local adults warrior; any allegiance. One real death, never multiplied. Keep 6 other local adults warrior. Complete base Stock output must fit before activation. Summer: Produce 4 Stock"
    },
    "category": "resource",
    "mode": "scheduled",
    "lane": "scheduled",
    "activation": {
      "type": "season",
      "seasonKeys": [
        "summer"
      ]
    },
    "source": {
      "icon": "season",
      "cadence": "season"
    },
    "workerCapacity": 2,
    "workerBonus": 1,
    "stockTraits": [
      "Arms"
    ],
    "stockCapacity": 8,
    "costs": [],
    "populationConsume": [
      {
        "amount": 1,
        "filter": {
          "kind": "adults",
          "specialty": "warrior"
        }
      }
    ],
    "populationRequire": [
      {
        "amount": 6,
        "filter": {
          "kind": "adults",
          "specialty": "warrior"
        },
        "other": true
      }
    ],
    "requireBaseHeadroom": true,
    "flavor": "The forge receives what the living will not name."
  }
};
export const fullMapStructures = {
  "fm_oathHall": {
    "id": "fm_oathHall",
    "label": "Oath Hall",
    "pool": "warrior",
    "provenance": "warrior",
    "minimumQuality": "bronze",
    "tags": [
      "Civic"
    ],
    "effects": [],
    "consume": [],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Successful local Warrior Influence Practices convert 1 additional eligible opposing residents to that Practice's allegiance. Copies do not stack."
    },
    "footprint": 1,
    "housing": 0,
    "modifiers": [],
    "construction": {
      "cycles": 3,
      "activation": {
        "type": "housing"
      },
      "consume": [
        {
          "traits": [
            "Construction"
          ],
          "amount": 2
        }
      ]
    },
    "localCurrencyCost": 0,
    "conversionSupport": {
      "amount": 1,
      "query": {
        "pool": "warrior"
      }
    },
    "flavor": "An oath spoken here is heard beyond the speaker."
  },
  "fm_frontierWatch": {
    "id": "fm_frontierWatch",
    "label": "Frontier Watch",
    "pool": "warrior",
    "provenance": "warrior",
    "minimumQuality": "bronze",
    "tags": [
      "Civic"
    ],
    "effects": [],
    "consume": [],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "+2 supplied occupation Force with 1 loyal adult Warriors and 1 local Arms; may be assigned to one adjacent road-connected allied holding"
    },
    "footprint": 1,
    "housing": 0,
    "modifiers": [
      {
        "kind": "occupation",
        "amount": 2,
        "arms": 1,
        "adjacent": true
      }
    ],
    "construction": {
      "cycles": 3,
      "activation": {
        "type": "housing"
      },
      "consume": [
        {
          "traits": [
            "Construction"
          ],
          "amount": 2
        },
        {
          "traits": [
            "Arms"
          ],
          "amount": 1
        }
      ]
    },
    "localCurrencyCost": 0,
    "flavor": "One watchfire cannot guard two frontiers at once."
  },
  "fm_veteransHearth": {
    "id": "fm_veteransHearth",
    "label": "Veterans’ Hearth",
    "pool": "warrior",
    "provenance": "warrior",
    "minimumQuality": "bronze",
    "tags": [
      "Civic",
      "Housing"
    ],
    "effects": [],
    "consume": [],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "+30 Housing Capacity Successful local Warrior Influence Practices convert 1 additional eligible warrior opposing residents to that Practice's allegiance. Copies do not stack."
    },
    "footprint": 1,
    "housing": 30,
    "modifiers": [],
    "construction": {
      "cycles": 4,
      "activation": {
        "type": "housing"
      },
      "consume": [
        {
          "traits": [
            "Construction"
          ],
          "amount": 2
        }
      ]
    },
    "localCurrencyCost": 0,
    "conversionSupport": {
      "amount": 1,
      "query": {
        "pool": "warrior"
      },
      "filter": {
        "specialty": "warrior"
      }
    },
    "flavor": "The old guard makes room beside its fire."
  },
  "fm_villageSchool": {
    "id": "fm_villageSchool",
    "label": "Village School",
    "pool": "scholar",
    "provenance": "scholar",
    "minimumQuality": "bronze",
    "tags": [
      "Civic",
      "Knowledge"
    ],
    "effects": [],
    "consume": [],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Successful local Influence Practices convert 1 additional eligible children opposing residents to that Practice's allegiance; Require 1 Record Stock (kept). Copies do not stack."
    },
    "footprint": 1,
    "housing": 0,
    "modifiers": [],
    "construction": {
      "cycles": 3,
      "activation": {
        "type": "housing"
      },
      "consume": [
        {
          "traits": [
            "Construction"
          ],
          "amount": 2
        },
        {
          "traits": [
            "Record"
          ],
          "amount": 1
        }
      ]
    },
    "localCurrencyCost": 0,
    "conversionSupport": {
      "amount": 1,
      "filter": {
        "kind": "children"
      },
      "require": [
        {
          "traits": [
            "Record"
          ],
          "amount": 1
        }
      ]
    },
    "flavor": "The youngest voices learn the words of the realm."
  },
  "fm_openArchive": {
    "id": "fm_openArchive",
    "label": "Open Archive",
    "pool": "scholar",
    "provenance": "scholar",
    "minimumQuality": "bronze",
    "tags": [
      "Civic",
      "Knowledge"
    ],
    "effects": [],
    "consume": [],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "+1 Output Multiplier for local Practices with Record Stock; while a local Practice holds Paper Stock Successful local Influence consuming Record Practices convert 1 additional eligible opposing residents to that Practice's allegiance. Copies do not stack."
    },
    "footprint": 1,
    "housing": 0,
    "modifiers": [
      {
        "kind": "outputMultiplier",
        "amount": 1,
        "query": {
          "traitsAny": [
            "Record"
          ],
          "stockedTraitsAny": [
            "Paper"
          ]
        }
      }
    ],
    "construction": {
      "cycles": 4,
      "activation": {
        "type": "housing"
      },
      "consume": [
        {
          "traits": [
            "Construction"
          ],
          "amount": 2
        },
        {
          "traits": [
            "Paper"
          ],
          "amount": 1
        }
      ]
    },
    "localCurrencyCost": 0,
    "conversionSupport": {
      "amount": 1,
      "consumeTrait": "Record"
    },
    "flavor": "Knowledge travels further when the shelves are open."
  },
  "fm_roadsideLectureHall": {
    "id": "fm_roadsideLectureHall",
    "label": "Roadside Lecture Hall",
    "pool": "scholar",
    "provenance": "scholar",
    "minimumQuality": "bronze",
    "tags": [
      "Civic",
      "Knowledge"
    ],
    "effects": [],
    "consume": [],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Local Influence Practices may convert in the first eligible adjacent road-connected region after local targets are exhausted. Copies do not stack."
    },
    "footprint": 1,
    "housing": 0,
    "modifiers": [],
    "construction": {
      "cycles": 4,
      "activation": {
        "type": "housing"
      },
      "consume": [
        {
          "traits": [
            "Construction"
          ],
          "amount": 2
        },
        {
          "traits": [
            "Record"
          ],
          "amount": 1
        }
      ]
    },
    "localCurrencyCost": 0,
    "conversionSupport": {
      "reach": "connectedAdjacent"
    },
    "flavor": "A lesson can reach further than its walls."
  },
  "fm_leakingGranary": {
    "id": "fm_leakingGranary",
    "label": "Leaking Granary",
    "pool": "common",
    "provenance": "neutral",
    "minimumQuality": "bronze",
    "tags": [
      "Civic"
    ],
    "effects": [],
    "consume": [],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "+0.5 Capacity Multiplier for Edible Death: Consume 1 Edible Stock; bonuses remain active after missed payment."
    },
    "footprint": 1,
    "housing": 0,
    "modifiers": [
      {
        "kind": "capacity",
        "amount": 0.5,
        "query": {
          "traitsAny": [
            "Edible"
          ]
        }
      }
    ],
    "construction": {
      "cycles": 3,
      "activation": {
        "type": "housing"
      },
      "consume": [
        {
          "traits": [
            "Construction"
          ],
          "amount": 1
        }
      ]
    },
    "localCurrencyCost": 0,
    "upkeep": {
      "activation": "death",
      "consume": [
        {
          "traits": [
            "Edible"
          ],
          "amount": 1
        }
      ],
      "disables": false
    },
    "flavor": "The harvest shelters beneath a roof that no longer holds."
  },
  "fm_crowdedTenement": {
    "id": "fm_crowdedTenement",
    "label": "Crowded Tenement",
    "pool": "common",
    "provenance": "neutral",
    "minimumQuality": "bronze",
    "tags": [
      "Civic",
      "Housing"
    ],
    "effects": [],
    "consume": [],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "+60 Housing Capacity Civilian meals consume 1 additional Edible Stock."
    },
    "footprint": 2,
    "housing": 60,
    "modifiers": [],
    "construction": {
      "cycles": 3,
      "activation": {
        "type": "housing"
      },
      "consume": [
        {
          "traits": [
            "Construction"
          ],
          "amount": 1
        }
      ]
    },
    "localCurrencyCost": 0,
    "mealExtra": 1,
    "flavor": "There is room for another family, if there is another meal."
  },
  "fm_villagePalisade": {
    "id": "fm_villagePalisade",
    "label": "Village Palisade",
    "pool": "common",
    "provenance": "neutral",
    "minimumQuality": "bronze",
    "tags": [
      "Civic"
    ],
    "effects": [],
    "consume": [],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "+1 supplied local monster defence with an armed loyal Warrior"
    },
    "footprint": 1,
    "housing": 0,
    "modifiers": [
      {
        "kind": "localDefense",
        "amount": 1,
        "arms": 1
      }
    ],
    "construction": {
      "cycles": 3,
      "activation": {
        "type": "housing"
      },
      "consume": [
        {
          "traits": [
            "Construction"
          ],
          "amount": 1
        }
      ]
    },
    "localCurrencyCost": 0,
    "flavor": "Rough timber gives the watch somewhere to stand."
  },
  "fm_tollGate": {
    "id": "fm_tollGate",
    "label": "Toll Gate",
    "pool": "common",
    "provenance": "neutral",
    "minimumQuality": "bronze",
    "tags": [
      "Civic"
    ],
    "effects": [],
    "consume": [],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Successful local Influence Practices convert 1 additional eligible opposing residents to that Practice's allegiance; Consume 1 Currency Stock. Copies do not stack."
    },
    "footprint": 1,
    "housing": 0,
    "modifiers": [],
    "construction": {
      "cycles": 3,
      "activation": {
        "type": "housing"
      },
      "consume": [
        {
          "traits": [
            "Construction"
          ],
          "amount": 1
        }
      ]
    },
    "localCurrencyCost": 0,
    "conversionSupport": {
      "amount": 1,
      "consume": [
        {
          "traits": [
            "Currency"
          ],
          "amount": 1
        }
      ]
    },
    "flavor": "The gate opens after the keeper has counted the coin."
  },
  "fm_patronsHall": {
    "id": "fm_patronsHall",
    "label": "Patron’s Hall",
    "pool": "common",
    "provenance": "neutral",
    "minimumQuality": "bronze",
    "tags": [
      "Civic"
    ],
    "effects": [],
    "consume": [],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Successful local Influence Practices convert 1 additional eligible opposing residents to that Practice's allegiance; Require 1 Currency Stock (kept). Copies do not stack."
    },
    "footprint": 2,
    "housing": 0,
    "modifiers": [],
    "construction": {
      "cycles": 3,
      "activation": {
        "type": "housing"
      },
      "consume": [
        {
          "traits": [
            "Construction"
          ],
          "amount": 1
        }
      ]
    },
    "localCurrencyCost": 0,
    "conversionSupport": {
      "amount": 1,
      "require": [
        {
          "traits": [
            "Currency"
          ],
          "amount": 1
        }
      ]
    },
    "flavor": "The patron's purse buys a place at every table."
  },
  "fm_abandonedShrine": {
    "id": "fm_abandonedShrine",
    "label": "Abandoned Shrine",
    "pool": "common",
    "provenance": "neutral",
    "minimumQuality": "bronze",
    "tags": [
      "Civic"
    ],
    "effects": [],
    "consume": [],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Successful local Influence Practices convert 1 additional eligible children opposing residents to that Practice's allegiance; Requires 60 local residents. Copies do not stack."
    },
    "footprint": 1,
    "housing": 0,
    "modifiers": [],
    "construction": {
      "cycles": 3,
      "activation": {
        "type": "housing"
      },
      "consume": [
        {
          "traits": [
            "Construction"
          ],
          "amount": 1
        }
      ]
    },
    "localCurrencyCost": 0,
    "conversionSupport": {
      "amount": 1,
      "filter": {
        "kind": "children"
      },
      "minimumPopulation": 60
    },
    "flavor": "The old stones still gather the village children."
  },
  "fm_crumblingCottages": {
    "id": "fm_crumblingCottages",
    "label": "Crumbling Cottages",
    "pool": "common",
    "provenance": "neutral",
    "minimumQuality": "bronze",
    "tags": [
      "Civic",
      "Housing"
    ],
    "effects": [],
    "consume": [],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "+15 Housing Capacity"
    },
    "footprint": 1,
    "housing": 15,
    "modifiers": [],
    "construction": {
      "cycles": 3,
      "activation": {
        "type": "housing"
      },
      "consume": [
        {
          "traits": [
            "Construction"
          ],
          "amount": 1
        }
      ]
    },
    "localCurrencyCost": 0,
    "flavor": "A little shelter remains beneath the broken thatch."
  },
  "fm_publicBakehouse": {
    "id": "fm_publicBakehouse",
    "label": "Public Bakehouse",
    "pool": "common",
    "provenance": "neutral",
    "minimumQuality": "bronze",
    "tags": [
      "Civic"
    ],
    "effects": [],
    "consume": [],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "+1 Output Multiplier for local Practices with Edible Stock; while a local Practice holds Fuel Stock"
    },
    "footprint": 1,
    "housing": 0,
    "modifiers": [
      {
        "kind": "outputMultiplier",
        "amount": 1,
        "query": {
          "traitsAny": [
            "Edible"
          ],
          "stockedTraitsAny": [
            "Fuel"
          ]
        }
      }
    ],
    "construction": {
      "cycles": 3,
      "activation": {
        "type": "housing"
      },
      "consume": [
        {
          "traits": [
            "Construction"
          ],
          "amount": 1
        }
      ]
    },
    "localCurrencyCost": 0,
    "flavor": "A kept fire turns the village stores into full tables."
  },
  "fm_lockedArchive": {
    "id": "fm_lockedArchive",
    "label": "Locked Archive",
    "pool": "common",
    "provenance": "neutral",
    "minimumQuality": "bronze",
    "tags": [
      "Civic"
    ],
    "effects": [],
    "consume": [],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "+1 Capacity Multiplier for Record Successful local Influence Practices convert 1 additional eligible scholar opposing residents to that Practice's allegiance. Copies do not stack."
    },
    "footprint": 1,
    "housing": 0,
    "modifiers": [
      {
        "kind": "capacity",
        "amount": 1,
        "query": {
          "traitsAny": [
            "Record"
          ]
        }
      }
    ],
    "construction": {
      "cycles": 3,
      "activation": {
        "type": "housing"
      },
      "consume": [
        {
          "traits": [
            "Construction"
          ],
          "amount": 1
        }
      ]
    },
    "localCurrencyCost": 0,
    "conversionSupport": {
      "amount": 1,
      "filter": {
        "specialty": "scholar"
      }
    },
    "flavor": "The shelves preserve more than the keeper will share."
  },
  "fm_imperialWaystation": {
    "id": "fm_imperialWaystation",
    "label": "Imperial Waystation",
    "pool": "common",
    "provenance": "neutral",
    "minimumQuality": "bronze",
    "tags": [
      "Civic"
    ],
    "effects": [],
    "consume": [],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "+1 Capacity Multiplier for Edible / Arms Local Influence Practices may convert in the first eligible adjacent road-connected region after local targets are exhausted. Copies do not stack."
    },
    "footprint": 2,
    "housing": 0,
    "modifiers": [
      {
        "kind": "capacity",
        "amount": 1,
        "query": {
          "traitsAny": [
            "Edible",
            "Arms"
          ]
        }
      }
    ],
    "construction": {
      "cycles": 3,
      "activation": {
        "type": "housing"
      },
      "consume": [
        {
          "traits": [
            "Construction"
          ],
          "amount": 1
        }
      ]
    },
    "localCurrencyCost": 0,
    "conversionSupport": {
      "reach": "connectedAdjacent"
    },
    "flavor": "Supplies wait where the imperial roads meet."
  },
  "fe_levyPost": {
    "id": "fe_levyPost",
    "label": "Levy Post",
    "pool": "warrior",
    "provenance": "dictator",
    "minimumQuality": "bronze",
    "tags": [
      "Civic"
    ],
    "effects": [],
    "consume": [],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Successful local Influence training Warriors Practices convert 1 additional eligible opposing residents to that Practice's allegiance. Copies do not stack."
    },
    "footprint": 1,
    "housing": 0,
    "modifiers": [],
    "construction": {
      "cycles": 3,
      "activation": {
        "type": "housing"
      },
      "consume": [
        {
          "traits": [
            "Construction"
          ],
          "amount": 1
        }
      ]
    },
    "localCurrencyCost": 0,
    "conversionSupport": {
      "amount": 1,
      "train": "warrior"
    },
    "flavor": "Every notice on the post asks for another soldier."
  },
  "fe_garrisonBarracks": {
    "id": "fe_garrisonBarracks",
    "label": "Garrison Barracks",
    "pool": "warrior",
    "provenance": "dictator",
    "minimumQuality": "silver",
    "tags": [
      "Civic",
      "Housing"
    ],
    "effects": [],
    "consume": [],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "+60 Housing Capacity +2 supplied occupation Force with 4 loyal adult Warriors and 2 local Arms"
    },
    "footprint": 2,
    "housing": 60,
    "modifiers": [
      {
        "kind": "occupation",
        "amount": 2,
        "warriors": 4,
        "arms": 2
      }
    ],
    "construction": {
      "cycles": 3,
      "activation": {
        "type": "housing"
      },
      "consume": [
        {
          "traits": [
            "Construction"
          ],
          "amount": 1
        }
      ]
    },
    "localCurrencyCost": 0,
    "flavor": "The bunks are full; the town pays to keep them so."
  },
  "fe_provostCourt": {
    "id": "fe_provostCourt",
    "label": "Provost Court",
    "pool": "warrior",
    "provenance": "dictator",
    "minimumQuality": "silver",
    "tags": [
      "Civic"
    ],
    "effects": [],
    "consume": [],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Successful local Influence Practices convert 1 additional eligible adults warrior opposing residents to that Practice's allegiance; Require 1 Record Stock (kept). Copies do not stack."
    },
    "footprint": 1,
    "housing": 0,
    "modifiers": [],
    "construction": {
      "cycles": 3,
      "activation": {
        "type": "housing"
      },
      "consume": [
        {
          "traits": [
            "Construction"
          ],
          "amount": 1
        }
      ]
    },
    "localCurrencyCost": 0,
    "conversionSupport": {
      "amount": 1,
      "filter": {
        "kind": "adults",
        "specialty": "warrior"
      },
      "require": [
        {
          "traits": [
            "Record"
          ],
          "amount": 1
        }
      ]
    },
    "flavor": "The record speaks with the authority of a drawn sword."
  },
  "fe_rationDepot": {
    "id": "fe_rationDepot",
    "label": "Ration Depot",
    "pool": "warrior",
    "provenance": "dictator",
    "minimumQuality": "silver",
    "tags": [
      "Civic"
    ],
    "effects": [],
    "consume": [],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "+1 Capacity Multiplier for Edible Food: Consume 1 Edible Stock; bonuses remain active after missed payment."
    },
    "footprint": 1,
    "housing": 0,
    "modifiers": [
      {
        "kind": "capacity",
        "amount": 1,
        "query": {
          "traitsAny": [
            "Edible"
          ]
        }
      }
    ],
    "construction": {
      "cycles": 3,
      "activation": {
        "type": "housing"
      },
      "consume": [
        {
          "traits": [
            "Construction"
          ],
          "amount": 1
        }
      ]
    },
    "localCurrencyCost": 0,
    "upkeep": {
      "activation": "food",
      "consume": [
        {
          "traits": [
            "Edible"
          ],
          "amount": 1
        }
      ],
      "disables": false
    },
    "flavor": "The stores feed those charged with guarding the stores."
  },
  "fe_signalBastion": {
    "id": "fe_signalBastion",
    "label": "Signal Bastion",
    "pool": "warrior",
    "provenance": "dictator",
    "minimumQuality": "silver",
    "tags": [
      "Civic"
    ],
    "effects": [],
    "consume": [],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "This supplied garrison may serve one adjacent road-connected allied holding instead of its source; no duplicated Warriors, Arms or Force"
    },
    "footprint": 1,
    "housing": 0,
    "modifiers": [
      {
        "kind": "networkGarrison"
      }
    ],
    "construction": {
      "cycles": 3,
      "activation": {
        "type": "housing"
      },
      "consume": [
        {
          "traits": [
            "Construction"
          ],
          "amount": 1
        }
      ]
    },
    "localCurrencyCost": 0,
    "flavor": "One signal sends the garrison beyond its own walls."
  },
  "fe_marshalsCitadel": {
    "id": "fe_marshalsCitadel",
    "label": "Marshal’s Citadel",
    "pool": "warrior",
    "provenance": "dictator",
    "minimumQuality": "gold",
    "tags": [
      "Civic"
    ],
    "effects": [],
    "consume": [],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "+5 supplied occupation Force with 8 loyal adult Warriors and 3 local Arms Pay 2 additional Edible after civilian meals; missed payment disables supplied Force"
    },
    "footprint": 3,
    "housing": 0,
    "modifiers": [
      {
        "kind": "occupation",
        "amount": 5,
        "warriors": 8,
        "arms": 3
      },
      {
        "kind": "garrisonUpkeep",
        "amount": 2
      }
    ],
    "construction": {
      "cycles": 3,
      "activation": {
        "type": "housing"
      },
      "consume": [
        {
          "traits": [
            "Construction"
          ],
          "amount": 1
        }
      ]
    },
    "localCurrencyCost": 0,
    "flavor": "The town labours beneath the weight of its protection."
  },
  "fe_paradeSquare": {
    "id": "fe_paradeSquare",
    "label": "Parade Square",
    "pool": "warrior",
    "provenance": "dictator",
    "minimumQuality": "gold",
    "tags": [
      "Civic"
    ],
    "effects": [],
    "consume": [],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Successful local Influence activating at Faith Practices convert 2 additional eligible opposing residents to that Practice's allegiance; Requires 6 local adults warrior loyal to that Practice. Copies do not stack."
    },
    "footprint": 2,
    "housing": 0,
    "modifiers": [],
    "construction": {
      "cycles": 3,
      "activation": {
        "type": "housing"
      },
      "consume": [
        {
          "traits": [
            "Construction"
          ],
          "amount": 1
        }
      ]
    },
    "localCurrencyCost": 0,
    "conversionSupport": {
      "amount": 2,
      "activation": "faith",
      "populationRequire": {
        "amount": 6,
        "filter": {
          "kind": "adults",
          "specialty": "warrior",
          "allegiance": "beneficiary"
        }
      }
    },
    "flavor": "The formation lends its voice to the speaker."
  },
  "fe_imperialArmoury": {
    "id": "fe_imperialArmoury",
    "label": "Imperial Armoury",
    "pool": "warrior",
    "provenance": "dictator",
    "minimumQuality": "gold",
    "tags": [
      "Civic"
    ],
    "effects": [],
    "consume": [],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "+1 Output Multiplier for local Practices with Arms Stock +1 Capacity Multiplier for Arms Summer: Consume 1 Tool Stock; missed payment disables this Structure until its next upkeep payment."
    },
    "footprint": 2,
    "housing": 0,
    "modifiers": [
      {
        "kind": "outputMultiplier",
        "amount": 1,
        "query": {
          "traitsAny": [
            "Arms"
          ]
        }
      },
      {
        "kind": "capacity",
        "amount": 1,
        "query": {
          "traitsAny": [
            "Arms"
          ]
        }
      }
    ],
    "construction": {
      "cycles": 3,
      "activation": {
        "type": "housing"
      },
      "consume": [
        {
          "traits": [
            "Construction"
          ],
          "amount": 1
        }
      ]
    },
    "localCurrencyCost": 0,
    "upkeep": {
      "activation": "summer",
      "consume": [
        {
          "traits": [
            "Tool"
          ],
          "amount": 1
        }
      ],
      "disables": true
    },
    "flavor": "A kept workshop fills the racks of the empire."
  },
  "cp_citadelOfStillness": {
    "id": "cp_citadelOfStillness",
    "label": "Citadel of Stillness",
    "pool": "warrior",
    "provenance": "dictator",
    "minimumQuality": "gold",
    "tags": [
      "Civic"
    ],
    "effects": [],
    "consume": [],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "+1 Output Multiplier for local Practices with Arms Stock +1 Capacity Multiplier for Arms"
    },
    "footprint": 3,
    "housing": 0,
    "modifiers": [
      {
        "kind": "outputMultiplier",
        "amount": 1,
        "query": {
          "traitsAny": [
            "Arms"
          ]
        }
      },
      {
        "kind": "capacity",
        "amount": 1,
        "query": {
          "traitsAny": [
            "Arms"
          ]
        }
      }
    ],
    "construction": {
      "cycles": 3,
      "activation": {
        "type": "housing"
      },
      "consume": [
        {
          "traits": [
            "Construction"
          ],
          "amount": 1
        }
      ]
    },
    "localCurrencyCost": 0,
    "flavor": "The racks fill beneath walls where no hammer is heard."
  }
};

// The experimental offer surface is intentionally finite. Older cards remain in
// the registry for authored labs, but abstract markets/Support are not fork offers.
// This list admits legacy supply definitions; their authored class still gates shops.
export const FULL_MAP_SUPPLY_DEPENDENCIES = Object.freeze([
  'forage', 'dryFarming', 'logging', 'quarrying', 'surfaceMining', 'charcoalBurning',
  'smelting', 'toolmaking', 'pastoralism', 'sheepHusbandry', 'saltGathering',
  'papermaking', 'recordKeeping', 'bowmaking', 'weaponsmithing', 'observation', 'borderSkirmishing',
  'mudHouses', 'timberHouse', 'stoneHouse', 'longhouse', 'granary', 'storehouse',
]);
// Recent mainline content remains part of ordinary acquisition after the map
// redesign; the finite remnant candidate set must not hide class disciplines.
export const FULL_MAP_MAINLINE_PRACTICES = Object.freeze([
  'fieldStudy', 'floodAlmanacs', 'marginalia', 'measuredRations', 'patternCarving',
  'beastRendering', 'scarredShields', 'trailProvisioning', 'trophyRubbings',
  'copyingTexts', 'monsterHunting', 'irrigating',
]);
// Inherited neutral starting cards and enemy/remnant institutions belong on the
// map, never in acquisition pools. Use authored IDs so edited class/quality/lock
// fields cannot accidentally turn an inherited card into a shop offer.
export const FULL_MAP_SEED_CARD_IDS = Object.freeze(
  [...Object.values(fullMapPractices), ...Object.values(fullMapStructures)]
    .filter(def => def.pool === 'common' || /^(fe_|cp_)/.test(def.id)).map(def => def.id)
    .concat(Object.keys(remnantSupplyPracticeDefs),Object.keys(remnantBasicPracticeDefs),Object.keys(remnantBasicStructureDefs))
);
export function isFullMapOfferDefinition(def) {
  return !!def && !FULL_MAP_SEED_CARD_IDS.includes(def.id) && !!(fullMapPractices[def.id] || fullMapStructures[def.id]
    || FULL_MAP_SUPPLY_DEPENDENCIES.includes(def.id) || FULL_MAP_MAINLINE_PRACTICES.includes(def.id));
}
