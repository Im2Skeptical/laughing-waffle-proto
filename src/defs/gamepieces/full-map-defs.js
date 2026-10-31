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
      "rule": "Consume 2 Edible. Convert up to 2 × workers multiplier adults warrior opposing residents to this institution’s allegiance; local. Zero workers activates at base output."
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
    "costs": []
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
      "rule": "Consume 1 Arms. Consume 1 Edible. Convert up to 2 × workers multiplier adults opposing residents to this institution’s allegiance; first eligible adjacent road-connected region (authored order). Zero workers activates at base output."
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
    "costs": []
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
      "rule": "Convert up to 3 × workers multiplier adults opposing residents to this institution’s allegiance; local."
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
    }
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
      "rule": "Require 1 Arms (kept). Train and convert up to 1 × workers multiplier adults ordinary opposing residents to this institution’s allegiance; local."
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
    "costs": []
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
      "rule": "Consume 3 Edible. Convert up to 4 × workers multiplier adults opposing residents to this institution’s allegiance; local."
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
    "populationCondition": "relief"
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
      "rule": "Consume 2 Loot. Convert up to 2 × workers multiplier adults stranger opposing residents to this institution’s allegiance; local."
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
    "costs": []
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
      "rule": "Consume 1 Arms. Consume 1 Edible. Convert up to 1 × workers multiplier adults opposing residents to this institution’s allegiance; local. +1 supplied occupation Force until next moon. Zero workers activates at base output."
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
    "costs": []
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
      "rule": "Require 1 Record (kept). Convert up to 2 × workers multiplier children opposing residents to this institution’s allegiance; local. Zero workers activates at base output."
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
    "costs": []
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
      "rule": "Consume 1 Record. Convert up to 2 × workers multiplier adults opposing residents to this institution’s allegiance; local."
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
    "populationCondition": "housed"
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
      "rule": "Consume 1 Record. 2 research. Convert up to 1 × workers multiplier scholar opposing residents to this institution’s allegiance; local. Zero workers activates at base output."
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
    "costs": []
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
      "rule": "Consume 1 Paper. Consume 1 Edible. Convert up to 2 × workers multiplier children opposing residents to this institution’s allegiance; first eligible adjacent road-connected region (authored order). Zero workers activates at base output."
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
    "costs": []
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
      "rule": "Consume 1 Tool. Generate 2 hosted Stock. Removed political clause: Resource Practice produces only its visible Stock and authored nonpolitical effects."
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
    "costs": []
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
      "rule": "Convert up to 2 × workers multiplier adults opposing residents to this institution’s allegiance; local."
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
    }
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
      "rule": "Consume 1 Tool. Train and convert up to 1 × workers multiplier adults ordinary opposing residents to this institution’s allegiance; local."
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
    "costs": []
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
      "rule": "Generate 2 hosted Stock."
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
    "costs": []
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
      "rule": "Consume 1 Grain. Generate 2 hosted Stock."
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
    "costs": []
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
      "rule": "Generate 1 hosted Stock. Removed political clause: Resource Practice produces only its visible Stock and authored nonpolitical effects."
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
      "Timber",
      "Construction"
    ],
    "stockCapacity": 4,
    "costs": []
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
      "rule": "Generate 1 hosted Stock."
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
      "Stone",
      "Construction"
    ],
    "stockCapacity": 3,
    "costs": []
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
        "amount": 2
      }
    ],
    "consume": [],
    "require": [],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Generate 2 hosted Stock."
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
      "Water"
    ],
    "stockCapacity": 4,
    "costs": []
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
      "rule": "Consume 1 Ore. Consume 1 Fuel. Generate 1 hosted Stock."
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
    "costs": []
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
      "rule": "Generate 1 hosted Stock."
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
    "costs": []
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
      "rule": "Generate 2 hosted Stock."
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
    "costs": []
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
      "rule": "Consume 1 Cloth. Generate 2 hosted Stock."
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
    "costs": []
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
    "require": [
      {
        "traits": [
          "Edible"
        ],
        "amount": 1
      }
    ],
    "vassalPrestigeCost": 10,
    "vassalPhaseCost": 12,
    "ui": {
      "rule": "Require 1 Edible (kept). Generate 1 hosted Stock."
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
      "Currency"
    ],
    "stockCapacity": 3,
    "costs": []
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
      "rule": "Consume 2 Currency. Convert up to 2 × workers multiplier adults opposing residents to this institution’s allegiance; local."
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
    "costs": []
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
      "rule": "Consume 1 Edible. Convert up to 1 × workers multiplier children opposing residents to this institution’s allegiance; local."
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
    "costs": []
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
      "rule": "Consume 2 Edible. Generate 1 hosted Stock. Removed political clause: Resource Practice produces only its visible Stock and authored nonpolitical effects."
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
    "costs": []
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
      "rule": "Consume 2 Grain. Convert up to 1 × workers multiplier adults opposing residents to this institution’s allegiance; local."
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
    "costs": []
  },
  "fm_seigneurialMuster": {
    "id": "fm_seigneurialMuster",
    "label": "Seigneurial Muster",
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
      "rule": "Require 1 Arms (kept). Train and convert up to 1 × workers multiplier adults ordinary opposing residents to this institution’s allegiance; local."
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
    "costs": []
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
      "rule": "Consume 1 Record. 1 research. Convert up to 1 × workers multiplier children opposing residents to this institution’s allegiance; local."
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
    "costs": []
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
      "rule": "Consume 1 Tool. Generate 1 hosted Stock."
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
    "costs": []
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
      "rule": "Consume 1 Edible."
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
    "costs": []
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
      "rule": "Consume 1 Currency. Convert up to 1 × workers multiplier adults opposing residents to this institution’s allegiance; local."
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
    "costs": []
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
      "rule": "Consume 1 Edible. Convert up to 1 × workers multiplier adults stranger opposing residents to this institution’s allegiance; local."
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
    "costs": []
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
      "rule": "Consume 1 Edible. Convert up to 1 × workers multiplier adults warrior opposing residents to this institution’s allegiance; local."
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
    "costs": []
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
      "rule": "Require 1 Arms (kept). Train and convert up to 1 × workers multiplier adults ordinary opposing residents to this institution’s allegiance; local."
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
    "costs": []
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
      "rule": "Consume 2 Edible. Generate 1 hosted Stock. Zero workers activates at base output."
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
    "costs": []
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
      "rule": "Require 1 Arms (kept). Generate 2 hosted Stock."
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
    "costs": []
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
      "rule": "Consume 1 Edible. Require 1 Arms (kept). +1 supplied occupation Force until next moon. Zero workers activates at base output."
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
    "costs": []
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
      "rule": "Consume 1 Metal. Consume 2 Fuel. Generate 3 hosted Stock."
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
    "costs": []
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
      "rule": "Consume 2 Edible. Convert up to 2 × workers multiplier adults opposing residents to this institution’s allegiance; local. Zero workers activates at base output."
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
    "costs": []
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
      "rule": "Consume 1 Loot. Consume 1 Edible. Convert up to 3 × workers multiplier adults opposing residents to this institution’s allegiance; local. Zero workers activates at base output."
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
    "costs": []
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
      "rule": "Consume 1 Arms. Consume 1 Record. Convert up to 2 × workers multiplier adults warrior opposing residents to this institution’s allegiance; first eligible adjacent road-connected region (authored order). Zero workers activates at base output."
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
    "costs": []
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
      "rule": "Consume 4 Edible. Convert up to 5 × workers multiplier adults opposing residents to this institution’s allegiance; local. Zero workers activates at base output."
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
    "populationCondition": "housed"
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
      "rule": "Consume 3 Edible. Consume 2 Currency. Convert up to 3 × workers multiplier warrior opposing residents to this institution’s allegiance; local. Zero workers activates at base output."
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
    "costs": []
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
      "rule": "Consume 2 Arms. Consume 2 Edible. +4 supplied defence Force until next year. Zero workers activates at base output."
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
    "costs": []
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
      "rule": "Require 2 Arms (kept). Generate 4 hosted Stock. Victim and six other adult Warrior reserves are local, any allegiance. One real death per Summer; full base Arms yield must fit."
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
    "requireBaseHeadroom": true
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
      "rule": "Each successful  warrior Influence activation  converts up to 1 additional eligible  opposing residents, using that Practice’s allegiance. Copies do not stack. No independent conversion or stored allegiance."
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
    }
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
      "rule": "With a supplied local loyal armed Warrior, +2 occupation Force here or in one adjacent road-connected allied region. The assigned Warrior and Force cannot also hold here."
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
    "localCurrencyCost": 0
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
      "rule": "+30 Housing. Each successful  warrior Influence activation  converts up to 1 additional eligible  opposing residents, using that Practice’s allegiance. Copies do not stack. No independent conversion or stored allegiance. Revision: replaces independent retirement conversion with ongoing Warlord Influence support."
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
      }
    }
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
      "rule": "Each successful   Influence activation  converts up to 1 additional eligible children opposing residents, using that Practice’s allegiance. Support requires 1 Record (kept). Copies do not stack. No independent conversion or stored allegiance."
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
    }
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
      "rule": "+1 capacity Record. Each successful   Influence activation  consuming Record converts up to 1 additional eligible  opposing residents, using that Practice’s allegiance. Copies do not stack. No independent conversion or stored allegiance."
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
    }
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
      "rule": "Qualifying Influence Practices may reach the first eligible adjacent road-connected region after local targets are exhausted. Copies do not stack. No independent conversion or stored allegiance."
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
    }
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
      "rule": "+1 capacity Edible. death: Consume 1 Edible; capacity remains active."
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
    }
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
      "rule": "+60 Housing. Civilian meals cost 1 additional Edible."
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
    "mealExtra": 1
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
      "rule": "+1 localDefense . Local supplied garrison contribution; no global Force sharing."
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
    "localCurrencyCost": 0
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
      "rule": "Each successful   Influence activation  converts up to 1 additional eligible  opposing residents, using that Practice’s allegiance. Support consumes 1 Currency. Copies do not stack. No independent conversion or stored allegiance."
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
    }
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
      "rule": "Each successful   Influence activation  converts up to 1 additional eligible  opposing residents, using that Practice’s allegiance. Support requires 1 Currency (kept). Copies do not stack. No independent conversion or stored allegiance."
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
    }
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
      "rule": "Each successful   Influence activation  converts up to 1 additional eligible children opposing residents, using that Practice’s allegiance. Requires 60 local residents. Copies do not stack. No independent conversion or stored allegiance."
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
    }
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
      "rule": "+15 Housing."
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
    "localCurrencyCost": 0
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
      "rule": "+1 outputMultiplier Edible."
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
    "localCurrencyCost": 0
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
      "rule": "+1 capacity Record. Each successful   Influence activation  converts up to 1 additional eligible scholar opposing residents, using that Practice’s allegiance. Copies do not stack. No independent conversion or stored allegiance."
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
    }
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
      "rule": "+1 capacity Edible/Arms. Qualifying Influence Practices may reach the first eligible adjacent road-connected region after local targets are exhausted. Copies do not stack. No independent conversion or stored allegiance."
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
    }
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
      "rule": "Each successful   Influence activation training warrior converts up to 1 additional eligible  opposing residents, using that Practice’s allegiance. Copies do not stack. No independent conversion or stored allegiance."
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
    }
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
      "rule": "+60 Housing. +2 occupation . Local supplied garrison contribution; no global Force sharing."
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
    "localCurrencyCost": 0
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
      "rule": "Each successful   Influence activation  converts up to 1 additional eligible adults warrior opposing residents, using that Practice’s allegiance. Support requires 1 Record (kept). Copies do not stack. No independent conversion or stored allegiance."
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
    }
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
      "rule": "+1 capacity Edible. food: Consume 1 Edible; capacity remains active."
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
    }
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
      "rule": "Assign this supplied local garrison to one adjacent road-connected allied region. Its Warriors, equipment and Force cannot also hold here. The recipient still needs local loyal armed Warriors."
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
    "localCurrencyCost": 0
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
      "rule": "+5 occupation . +2 garrisonUpkeep . Local supplied garrison contribution; no global Force sharing."
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
    "localCurrencyCost": 0
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
      "rule": "Each successful faith  Influence activation  converts up to 2 additional eligible  opposing residents, using that Practice’s allegiance. Requires 6 local adult Warriors loyal to that Practice. Copies do not stack. No independent conversion or stored allegiance."
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
    }
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
      "rule": "+1 outputMultiplier Arms. +1 capacity Arms. summer: Consume 1 Tool; bonuses require payment."
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
    }
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
      "rule": "+1 outputMultiplier Arms. +1 capacity Arms."
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
    "localCurrencyCost": 0
  }
};

// The experimental offer surface is intentionally finite. Older cards remain in
// the registry for authored labs, but abstract markets/Support are not fork offers.
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
  'copyingTexts', 'monsterHunting',
]);
export function isFullMapOfferDefinition(def) {
  return !!def && !!(fullMapPractices[def.id] || fullMapStructures[def.id]
    || FULL_MAP_SUPPLY_DEPENDENCIES.includes(def.id) || FULL_MAP_MAINLINE_PRACTICES.includes(def.id));
}
