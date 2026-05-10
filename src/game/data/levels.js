export const DEFAULT_LEVEL_ID = "level-1";

export const LEVELS = [
  {
    id: "level-1",
    name: "Tech Field",
    worldWidth: 4300,
    floorY: 652,
    playerSpawn: {
      x: 72,
      y: 536
    },
    platforms: [
      {
        x: 0,
        y: 652,
        width: 4300,
        height: 64
      },
      {
        x: 0,
        y: 652,
        width: 4300,
        height: 64
      },
      {
        x: 230,
        y: 502,
        width: 220,
        height: 36
      },
      {
        x: 560,
        y: 422,
        width: 220,
        height: 36
      },
      {
        x: 880,
        y: 517,
        width: 300,
        height: 36
      },
      {
        x: 1304,
        y: 437,
        width: 232,
        height: 36
      },
      {
        x: 1624,
        y: 537,
        width: 272,
        height: 36
      },
      {
        x: 2030,
        y: 457,
        width: 240,
        height: 36
      },
      {
        x: 2440,
        y: 530,
        width: 320,
        height: 36
      },
      {
        x: 2920,
        y: 442,
        width: 240,
        height: 36
      },
      {
        x: 3244,
        y: 522,
        width: 272,
        height: 36
      },
      {
        x: 3644,
        y: 420,
        width: 232,
        height: 36
      }
    ],
    coins: [
      {
        x: 333,
        y: 463
      },
      {
        x: 428,
        y: 463
      },
      {
        x: 628,
        y: 383
      },
      {
        x: 708,
        y: 383
      },
      {
        x: 1098,
        y: 478
      },
      {
        x: 1358,
        y: 398
      },
      {
        x: 1478,
        y: 398
      },
      {
        x: 1818,
        y: 498
      },
      {
        x: 2098,
        y: 418
      },
      {
        x: 2183,
        y: 418
      },
      {
        x: 2658,
        y: 493
      },
      {
        x: 2768,
        y: 493
      },
      {
        x: 3048,
        y: 403
      },
      {
        x: 3138,
        y: 403
      },
      {
        x: 3428,
        y: 483
      },
      {
        x: 3538,
        y: 483
      },
      {
        x: 3758,
        y: 382
      },
      {
        x: 3848,
        y: 382
      }
    ],
    hazards: [
      {
        x: 772,
        y: 622
      },
      {
        x: 812,
        y: 622
      },
      {
        x: 1562,
        y: 622
      },
      {
        x: 1602,
        y: 622
      },
      {
        x: 2842,
        y: 622
      },
      {
        x: 2882,
        y: 622
      },
      {
        x: 3302,
        y: 622
      },
      {
        x: 3962,
        y: 622
      }
    ],
    enemies: [
      {
        x: 1190,
        y: 580,
        min: 1030,
        max: 1300
      },
      {
        x: 2330,
        y: 580,
        min: 2230,
        max: 2470
      },
      {
        x: 3540,
        y: 580,
        min: 3360,
        max: 3680
      }
    ],
    challenges: [
      {
        x: 834,
        y: 529,
        width: 172,
        height: 112,
        label: "CHALLENGE 01"
      },
      {
        x: 1894,
        y: 529,
        width: 172,
        height: 112,
        label: "CHALLENGE 02"
      },
      {
        x: 3174,
        y: 529,
        width: 172,
        height: 112,
        label: "CHALLENGE 03"
      }
    ],
    merchant: {
      x: 2300,
      y: 530,
      width: 240,
      height: 120,
      npcX: 2402,
      npcY: 555
    },
    exitGate: {
      x: 4012,
      y: 512,
      width: 116,
      height: 140
    },
    signs: [
      {
        x: 44,
        y: 567,
        text: "START"
      },
      {
        x: 2194,
        y: 567,
        text: "MERCHANT SAFE ZONE"
      },
      {
        x: 3864,
        y: 567,
        text: "EXIT RUN"
      }
    ],
    worldHeight: 720
  },
  {
    id: "level-two",
    name: "LEVEL TWO",
    worldWidth: 4300,
    floorY: 652,
    playerSpawn: {
      x: 39,
      y: 486
    },
    platforms: [
      {
        x: 0,
        y: 652,
        width: 4300,
        height: 64
      },
      {
        x: 200,
        y: 544,
        width: 220,
        height: 32
      },
      {
        x: 800,
        y: 544,
        width: 220,
        height: 32
      },
      {
        x: 2100,
        y: 544,
        width: 220,
        height: 32
      },
      {
        x: 1780,
        y: 442,
        width: 220,
        height: 36
      },
      {
        x: 1380,
        y: 242,
        width: 220,
        height: 36
      }
    ],
    coins: [
      {
        x: 238,
        y: 508
      },
      {
        x: 358,
        y: 508
      },
      {
        x: 838,
        y: 508
      },
      {
        x: 958,
        y: 508
      },
      {
        x: 2108,
        y: 478
      },
      {
        x: 1028,
        y: 588
      },
      {
        x: 1068,
        y: 588
      },
      {
        x: 1818,
        y: 408
      },
      {
        x: 1888,
        y: 408
      },
      {
        x: 1958,
        y: 408
      }
    ],
    hazards: [
      {
        x: 1022,
        y: 624
      },
      {
        x: 1062,
        y: 624
      },
      {
        x: 2102,
        y: 514
      }
    ],
    enemies: [
      {
        x: 430,
        y: 590,
        min: 310,
        max: 550
      },
      {
        x: 1280,
        y: 590,
        min: 1160,
        max: 1400
      },
      {
        x: 1580,
        y: 590,
        min: 1460,
        max: 1700
      },
      {
        x: 1880,
        y: 590,
        min: 1760,
        max: 2000
      }
    ],
    challenges: [
      {
        x: 524,
        y: 534,
        width: 172,
        height: 112,
        label: "CHALLENGE 01",
        difficulty: "hard"
      },
      {
        x: 2504,
        y: 484,
        width: 172,
        height: 112,
        label: "CHALLENGE 02",
        difficulty: "medium"
      }
    ],
    merchant: {
      x: 2900,
      y: 530,
      width: 240,
      height: 120,
      npcX: 2852,
      npcY: 535
    },
    exitGate: {
      x: 1432,
      y: 100,
      width: 116,
      height: 140
    },
    signs: [],
    worldHeight: 720
  },
  {
    id: "new-level-ewoifnw123",
    name: "New Level ewoifnw123",
    worldWidth: 4300,
    floorY: 652,
    playerSpawn: {
      x: 162,
      y: 466
    },
    platforms: [
      {
        x: 0,
        y: 652,
        width: 4300,
        height: 64
      }
    ],
    coins: [],
    hazards: [],
    enemies: [
      {
        x: 360,
        y: 520,
        min: 240,
        max: 480
      }
    ],
    challenges: [],
    merchant: null,
    exitGate: {
      x: 542,
      y: 410,
      width: 116,
      height: 140
    },
    signs: [
      {
        x: 304,
        y: 160,
        text: "SIGN"
      },
      {
        x: 344,
        y: 140,
        text: "SIGN"
      }
    ],
    worldHeight: 720
  },
  {
    id: "new-level",
    name: "New Level",
    worldWidth: 4300,
    worldHeight: 720,
    floorY: 652,
    playerSpawn: {
      x: 624,
      y: 448
    },
    platforms: [
      {
        x: 0,
        y: 652,
        width: 4300,
        height: 64
      }
    ],
    coins: [],
    hazards: [],
    enemies: [],
    challenges: [],
    merchant: null,
    exitGate: {
      x: 208,
      y: 496,
      width: 116,
      height: 140
    },
    signs: []
  },
  {
    id: "de939543-fcff-4ab1-a5dd-9433c3c2a16c",
    name: "New Level",
    worldWidth: 4300,
    worldHeight: 720,
    floorY: 652,
    playerSpawn: {
      x: 112,
      y: 480
    },
    platforms: [
      {
        x: 0,
        y: 652,
        width: 4300,
        height: 64
      }
    ],
    coins: [],
    hazards: [],
    enemies: [],
    challenges: [],
    merchant: null,
    exitGate: {
      x: 512,
      y: 496,
      width: 116,
      height: 140
    },
    signs: [
      {
        x: 192,
        y: 336,
        text: "napunsak"
      }
    ]
  },
  {
    id: "58b9f552-90e3-4c12-a51a-2e56f5dae77c",
    name: "New Level",
    worldWidth: 4300,
    worldHeight: 720,
    floorY: 652,
    playerSpawn: {
      x: 272,
      y: 604
    },
    platforms: [
      {
        x: 0,
        y: 652,
        width: 4300,
        height: 64
      },
      {
        x: 208,
        y: 592,
        width: 220,
        height: 36
      }
    ],
    coins: [],
    hazards: [],
    enemies: [],
    challenges: [],
    merchant: null,
    exitGate: {
      x: 304,
      y: 448,
      width: 116,
      height: 140
    },
    signs: []
  }
];
