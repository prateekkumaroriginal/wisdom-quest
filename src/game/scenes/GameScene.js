import { QUESTIONS } from "../data/questions.js";
import { UPGRADES } from "../data/upgrades.js";
import { DEFAULT_LEVEL_ID, LEVELS } from "../data/levels.js";
import { emitGameEvent, gameEvents } from "../gameEvents.js";
import { getMusicVolume, getSoundEnabled, getSoundVolume } from "../settings.js";

const CHALLENGE_SECONDS = 18;
const IS_DEV = import.meta.env.DEV || Boolean(window.edgecase?.isDev);

const DIFFICULTY = {
  easy: { reward: 24, enemySpeed: 75, hazardCount: 4, questionMix: ["easy", "easy", "medium"] },
  normal: { reward: 32, enemySpeed: 95, hazardCount: 6, questionMix: ["easy", "medium", "hard"] },
  hard: { reward: 44, enemySpeed: 125, hazardCount: 8, questionMix: ["medium", "hard", "hard"] }
};

const ITEM_SIZES = {
  platform: { width: 220, height: 36 },
  coin: { width: 24, height: 24 },
  hazard: { width: 36, height: 32 },
  enemy: { width: 40, height: 40 },
  challenge: { width: 172, height: 112 },
  merchant: { width: 240, height: 120 },
  exitGate: { width: 116, height: 140 },
  playerSpawn: { width: 36, height: 48 }
};

export class GameScene extends Phaser.Scene {
  constructor() {
    super("GameScene");
  }

  create() {
    this.difficulty = this.registry.get("difficulty") || "normal";
    this.isEditorPlaytest = Boolean(this.registry.get("draftLevel"));
    this.tuning = DIFFICULTY[this.difficulty];
    this.level = this.getActiveLevel();
    this.worldWidth = this.level.worldWidth || 4300;
    this.worldHeight = this.level.worldHeight || 720;
    this.floorY = this.level.floorY || this.worldHeight - 68;
    this.coins = 0;
    this.maxHealth = 5;
    this.health = this.maxHealth;
    this.answerStreak = 0;
    this.runEnded = false;
    this.quiz = null;
    this.merchantOpen = false;
    this.nearMerchant = false;
    this.nearExit = false;
    this.lastShieldUse = -99999;
    this.lastDamageAt = -99999;
    this.paused = false;
    this.pauseStartedAt = 0;
    this.pauseSelectedIndex = 0;
    this.merchantSelectedIndex = 0;
    this.merchantHoldStartedAt = null;
    this.merchantHoldComplete = false;
    this.merchantHoldDenied = false;
    this.merchantChargeOsc = null;
    this.merchantChargeGain = null;
    this.musicEvent = null;
    this.musicStep = 0;
    this.audioReady = false;

    this.upgrades = {
      dash: false,
      doubleJump: false,
      shield: false,
      magnet: false
    };
    this.tempBuffs = {
      speedUntil: 0,
      magnetUntil: 0,
      shieldUntil: 0
    };

    this.createTextures();
    this.createWorld();
    this.createPlayer();
    this.createCollectibles();
    this.createHazardsAndEnemies();
    this.createChallenges();
    this.createMerchant();
    this.createExitGate();
    this.createHud();
    this.createInputs();

    this.cameras.main.startFollow(this.player, true, 0.09, 0.09);
    this.cameras.main.setBounds(0, 0, this.worldWidth, this.worldHeight);
    this.physics.world.setBounds(0, 0, this.worldWidth, this.worldHeight);
    this.input.once("pointerdown", () => this.ensureAudio());
    this.input.keyboard.once("keydown", () => this.ensureAudio());
    this.pauseActionHandler = (event) => this.executePauseAction(event.detail?.action);
    this.merchantActionHandler = (event) => this.executeMerchantAction(event.detail);
    this.endRunActionHandler = (event) => this.executeEndRunAction(event.detail?.action);
    gameEvents.addEventListener("edgecase:pause-action", this.pauseActionHandler);
    gameEvents.addEventListener("edgecase:merchant-action", this.merchantActionHandler);
    gameEvents.addEventListener("edgecase:end-run-action", this.endRunActionHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      gameEvents.removeEventListener("edgecase:pause-action", this.pauseActionHandler);
      gameEvents.removeEventListener("edgecase:merchant-action", this.merchantActionHandler);
      gameEvents.removeEventListener("edgecase:end-run-action", this.endRunActionHandler);
      this.destroyPauseMenu();
      this.closeMerchant();
      emitGameEvent("edgecase:end-run-close");
      emitGameEvent("edgecase:hud-clear");
      this.stopMusic();
    });
    this.events.once(Phaser.Scenes.Events.DESTROY, () => {
      gameEvents.removeEventListener("edgecase:pause-action", this.pauseActionHandler);
      gameEvents.removeEventListener("edgecase:merchant-action", this.merchantActionHandler);
      gameEvents.removeEventListener("edgecase:end-run-action", this.endRunActionHandler);
      this.destroyPauseMenu();
      this.closeMerchant();
      emitGameEvent("edgecase:end-run-close");
      emitGameEvent("edgecase:hud-clear");
      this.stopMusic();
    });
  }

  getActiveLevel() {
    const draftLevel = this.registry.get("draftLevel");
    if (draftLevel) {
      return structuredClone(draftLevel);
    }

    const selectedLevelId = this.registry.get("selectedLevelId") || DEFAULT_LEVEL_ID;
    const devSavedLevels = IS_DEV ? this.registry.get("devSavedLevels") || [] : [];
    if (IS_DEV && this.registry.get("devSavedLevelsLoaded")) {
      const level = devSavedLevels.find((item) => item.id === selectedLevelId) || devSavedLevels[0] || LEVELS[0];
      return structuredClone(level);
    }

    const levelsById = new Map(LEVELS.map((item) => [item.id, item]));
    for (const item of devSavedLevels) {
      levelsById.set(item.id, item);
    }
    const level = levelsById.get(selectedLevelId) || LEVELS[0];
    return structuredClone(level);
  }

  createTextures() {
    const g = this.add.graphics();

    g.fillStyle(0xf0f4df, 1);
    g.fillRoundedRect(0, 0, 36, 48, 8);
    g.fillStyle(0x18231d, 1);
    g.fillRect(8, 10, 20, 8);
    g.fillStyle(0xd7c96d, 1);
    g.fillRect(22, 31, 9, 11);
    g.generateTexture("player", ITEM_SIZES.playerSpawn.width, ITEM_SIZES.playerSpawn.height);
    g.clear();

    g.fillStyle(0xd8cd6c, 1);
    g.fillCircle(12, 12, 12);
    g.lineStyle(3, 0xfff3a6, 1);
    g.strokeCircle(12, 12, 8);
    g.generateTexture("coin", 24, 24);
    g.clear();

    g.fillStyle(0x17231d, 1);
    g.fillRoundedRect(0, 0, 64, 36, 4);
    g.fillStyle(0x2f4b3e, 1);
    g.fillRect(0, 0, 64, 7);
    g.lineStyle(2, 0xb9a44c, 0.65);
    g.strokeRect(1, 1, 62, 34);
    g.generateTexture("platform", 64, 36);
    g.clear();

    g.fillStyle(0xd65f4f, 1);
    g.fillTriangle(0, 32, 18, 0, 36, 32);
    g.generateTexture("spike", ITEM_SIZES.hazard.width, ITEM_SIZES.hazard.height);
    g.clear();

    g.fillStyle(0x2d7f6d, 1);
    g.fillRoundedRect(0, 0, 40, 40, 6);
    g.fillStyle(0xe7d66b, 1);
    g.fillRect(9, 12, 22, 7);
    g.generateTexture("enemy", ITEM_SIZES.enemy.width, ITEM_SIZES.enemy.height);
    g.destroy();
  }

  createWorld() {
    this.add.rectangle(this.worldWidth / 2, this.worldHeight / 2, this.worldWidth, this.worldHeight, 0x07100f);
    this.drawParallaxBands();

    this.platforms = this.physics.add.staticGroup();
    for (const platform of this.level.platforms || []) {
      this.addPlatform(platform);
    }

    for (const sign of this.level.signs || []) {
      this.add.text(sign.x, sign.y, sign.text, this.signStyle()).setAngle(Number(sign.rotation) || 0).setDepth(3);
    }
  }

  drawParallaxBands() {
    const graphics = this.add.graphics();
    const bandY = Math.max(0, this.floorY - 144);
    graphics.fillStyle(0x0f1a18, 1);
    graphics.fillRect(0, bandY, this.worldWidth, 144);
    graphics.fillStyle(0x16251f, 1);
    for (let x = 0; x < this.worldWidth; x += 180) {
      const height = 80 + ((x / 180) % 4) * 34;
      graphics.fillRect(x, bandY - height, 92, height);
      graphics.fillRect(x + 110, bandY - height * 0.7, 54, height * 0.7);
    }
    graphics.lineStyle(2, 0x385346, 0.45);
    for (let x = 0; x < this.worldWidth; x += 120) {
      graphics.strokeLineShape(new Phaser.Geom.Line(x, bandY + 2, x + 90, bandY - 38));
    }
  }

  createPlayer() {
    const spawn = this.level.playerSpawn || { x: 90, y: 560 };
    const center = this.centerFromTopLeft("playerSpawn", spawn);
    this.player = this.physics.add.sprite(center.x, center.y, "player");
    this.player.setCollideWorldBounds(true);
    this.player.setDragX(1550);
    this.player.setMaxVelocity(420, 920);
    this.physics.add.collider(this.player, this.platforms, () => {
      if (this.player.body.blocked.down) {
        this.jumpsUsed = 0;
      }
    });
    this.jumpsUsed = 0;
    this.dashReadyAt = 0;
  }

  createCollectibles() {
    this.coinGroup = this.physics.add.group({ allowGravity: false, immovable: true });

    for (const item of this.level.coins || []) {
      const center = this.centerFromTopLeft("coin", item);
      const coin = this.coinGroup.create(center.x, center.y, "coin");
      coin.setAngle(Number(item.rotation) || 0);
      coin.body.setCircle(12);
      coin.setData("value", 1);
    }

    this.physics.add.overlap(this.player, this.coinGroup, (_, coin) => this.collectCoin(coin));
  }

  createHazardsAndEnemies() {
    this.hazards = this.physics.add.staticGroup();
    const spikes = (this.level.hazards || []).slice(0, this.tuning.hazardCount);

    for (const hazard of spikes) {
      const center = this.centerFromTopLeft("hazard", hazard);
      const spike = this.hazards.create(center.x, center.y, "spike");
      spike.setAngle(Number(hazard.rotation) || 0);
      spike.refreshBody();
    }

    this.enemies = this.physics.add.group({ allowGravity: true });
    const patrols = this.level.enemies || [];

    for (const patrol of patrols.slice(0, this.difficulty === "easy" ? 1 : 3)) {
      const center = this.centerFromTopLeft("enemy", patrol);
      const enemy = this.enemies.create(center.x, center.y, "enemy");
      enemy.setAngle(Number(patrol.rotation) || 0);
      enemy.setData("min", patrol.min);
      enemy.setData("max", patrol.max);
      enemy.setVelocityX(this.tuning.enemySpeed);
      enemy.setBounce(0);
      enemy.setCollideWorldBounds(false);
    }

    this.physics.add.collider(this.enemies, this.platforms);
    this.physics.add.overlap(this.player, this.hazards, () => this.takeDamage("spike"));
    this.physics.add.overlap(this.player, this.enemies, () => this.takeDamage("sentry"));
  }

  createChallenges() {
    this.challengeZones = [];
    const questionLevels = this.tuning.questionMix;
    const positions = this.level.challenges || [];

    positions.forEach((pos, index) => {
      const center = this.centerFromTopLeft("challenge", pos);
      const size = this.itemSize("challenge", pos);
      const zone = this.add
        .rectangle(center.x, center.y, size.width, size.height, 0x2d7f6d, 0.22)
        .setAngle(Number(pos.rotation) || 0)
        .setStrokeStyle(3, 0xd8cd6c, 0.85);
      this.physics.add.existing(zone, true);
      zone.setData("id", index);
      zone.setData("locked", false);
      zone.setData("completed", false);
      zone.setData("question", this.pickQuestion(pos.difficulty || questionLevels[index] || "easy", index));
      this.challengeZones.push(zone);

      this.add.text(pos.x, pos.y - 28, pos.label || `CHALLENGE ${String(index + 1).padStart(2, "0")}`, this.signStyle()).setDepth(3);
      this.physics.add.overlap(this.player, zone, () => this.tryStartChallenge(zone));
    });
  }

  createMerchant() {
    const merchant = this.level.merchant;
    if (!merchant) {
      this.merchantZone = null;
      return;
    }

    const center = this.centerFromTopLeft("merchant", merchant);
    const size = this.itemSize("merchant", merchant);
    this.merchantZone = this.add.rectangle(center.x, center.y, size.width, size.height, 0x345347, 0.25).setStrokeStyle(3, 0xe7d66b);
    this.merchantZone.setAngle(Number(merchant.rotation) || 0);
    this.physics.add.existing(this.merchantZone, true);
    this.physics.add.overlap(this.player, this.merchantZone, () => {
      this.nearMerchant = true;
    });

    this.add
      .text(merchant.x, merchant.y - 8, "MERCHANT", this.signStyle())
      .setOrigin(0, 1)
      .setDepth(3);
  }

  createExitGate() {
    const gate = this.level.exitGate;
    if (!gate) {
      this.exitGate = null;
      return;
    }

    const center = this.centerFromTopLeft("exitGate", gate);
    const size = this.itemSize("exitGate", gate);
    this.exitGate = this.add.rectangle(center.x, center.y, size.width, size.height, 0x8a7440, 0.58).setStrokeStyle(4, 0xe7d66b);
    this.exitGate.setAngle(Number(gate.rotation) || 0);
    this.physics.add.existing(this.exitGate, true);
    this.physics.add.overlap(this.player, this.exitGate, () => {
      this.nearExit = true;
    });
  }

  createHud() {
    this.lastHudKey = "";
    this.updateHud();
  }

  createInputs() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys({
      a: Phaser.Input.Keyboard.KeyCodes.A,
      d: Phaser.Input.Keyboard.KeyCodes.D,
      w: Phaser.Input.Keyboard.KeyCodes.W,
      s: Phaser.Input.Keyboard.KeyCodes.S,
      e: Phaser.Input.Keyboard.KeyCodes.E,
      shift: Phaser.Input.Keyboard.KeyCodes.SHIFT,
      esc: Phaser.Input.Keyboard.KeyCodes.ESC,
      r: Phaser.Input.Keyboard.KeyCodes.R,
      m: Phaser.Input.Keyboard.KeyCodes.M,
      enter: Phaser.Input.Keyboard.KeyCodes.ENTER,
      one: Phaser.Input.Keyboard.KeyCodes.ONE,
      two: Phaser.Input.Keyboard.KeyCodes.TWO,
      three: Phaser.Input.Keyboard.KeyCodes.THREE,
      four: Phaser.Input.Keyboard.KeyCodes.FOUR
    });
  }

  update(time, delta) {
    if (this.runEnded) {
      return;
    }

    if (this.paused) return;

    if (this.merchantOpen) {
      this.updateHud();
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.esc)) {
      this.togglePause();
      return;
    }

    this.nearMerchant = false;
    this.nearExit = false;

    this.updateEnemies();
    this.updateMovement(time);
    this.updateMagnet(delta);
    this.updateQuiz(time);
    this.updateProximity();
    this.handleInteractions();
    this.updateHud();
  }

  updateMovement(time) {
    if (this.merchantOpen || this.paused || this.runEnded) {
      this.player.setAccelerationX(0);
      return;
    }

    const speedBuff = time < this.tempBuffs.speedUntil ? 1.22 : 1;
    const runSpeed = 335 * speedBuff;
    const left = this.cursors.left.isDown || this.keys.a.isDown;
    const right = this.cursors.right.isDown || this.keys.d.isDown;

    if (left) {
      this.player.setAccelerationX(-1700);
      this.player.setMaxVelocity(runSpeed, 920);
      this.player.setFlipX(true);
    } else if (right) {
      this.player.setAccelerationX(1700);
      this.player.setMaxVelocity(runSpeed, 920);
      this.player.setFlipX(false);
    } else {
      this.player.setAccelerationX(0);
    }

    const jumpPressed =
      Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
      Phaser.Input.Keyboard.JustDown(this.cursors.space) ||
      Phaser.Input.Keyboard.JustDown(this.keys.w);
    if (jumpPressed) {
      this.tryJump();
      this.playTone("jump");
    }

    if (this.upgrades.dash && Phaser.Input.Keyboard.JustDown(this.keys.shift) && time >= this.dashReadyAt) {
      const direction = this.player.flipX ? -1 : 1;
      this.player.setVelocityX(direction * 640);
      this.player.setVelocityY(Math.min(this.player.body.velocity.y, -40));
      this.dashReadyAt = time + 1150;
      this.showToast("Dash ready again in 1s");
      this.playTone("dash");
    }
  }

  clearGameplayInput(stopHorizontal = true) {
    this.input.keyboard?.resetKeys?.();
    if (stopHorizontal && this.player?.body) {
      this.player.setAccelerationX(0);
      this.player.setVelocityX(0);
    }
  }

  tryJump() {
    const grounded = this.player.body.blocked.down;
    const maxJumps = this.upgrades.doubleJump ? 2 : 1;

    if (grounded) {
      this.jumpsUsed = 0;
    }

    if (this.jumpsUsed < maxJumps) {
      this.player.setVelocityY(this.jumpsUsed === 0 ? -575 : -520);
      this.jumpsUsed += 1;
    }
  }

  updateEnemies() {
    for (const enemy of this.enemies.getChildren()) {
      const min = enemy.getData("min");
      const max = enemy.getData("max");
      const left = enemy.x - ITEM_SIZES.enemy.width / 2;
      if (left <= min) {
        enemy.setVelocityX(this.tuning.enemySpeed);
      } else if (left >= max) {
        enemy.setVelocityX(-this.tuning.enemySpeed);
      }
    }
  }

  updateMagnet(delta) {
    const active = this.upgrades.magnet || this.time.now < this.tempBuffs.magnetUntil;
    if (!active) {
      return;
    }

    for (const coin of this.coinGroup.getChildren()) {
      if (!coin.active) continue;
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, coin.x, coin.y);
      if (distance < 180) {
        const angle = Phaser.Math.Angle.Between(coin.x, coin.y, this.player.x, this.player.y);
        coin.x += Math.cos(angle) * delta * 0.34;
        coin.y += Math.sin(angle) * delta * 0.34;
        coin.body.updateFromGameObject();
      }
    }
  }

  updateProximity() {
    const playerBounds = this.player.getBounds();
    this.nearMerchant = this.merchantZone ? Phaser.Geom.Intersects.RectangleToRectangle(playerBounds, this.merchantZone.getBounds()) : false;
    this.nearExit = this.exitGate ? Phaser.Geom.Intersects.RectangleToRectangle(playerBounds, this.exitGate.getBounds()) : false;
  }

  isInMerchantSafeZone() {
    return this.merchantZone && Phaser.Geom.Intersects.RectangleToRectangle(this.player.getBounds(), this.merchantZone.getBounds());
  }

  updateQuiz(time) {
    if (!this.quiz) {
      return;
    }

    if (this.quiz.closing) {
      return;
    }

    const remaining = Math.max(0, (this.quiz.endsAt - time) / 1000);
    this.quiz.timerText.setText(`TIME ${remaining.toFixed(1)}s`);
    this.updateSelectedAnswerDoor();

    if (remaining <= 0) {
      this.finishChallenge(false, "Timeout");
    }
  }

  handleInteractions() {
    if (Phaser.Input.Keyboard.JustDown(this.keys.e)) {
      this.ensureAudio();
      if (this.quiz && !this.quiz.closing) {
        this.confirmSelectedAnswer();
      } else if (this.nearMerchant && !this.merchantOpen) {
        this.openMerchant();
      } else if (this.nearExit && !this.merchantOpen) {
        this.endRun();
      }
    }

  }

  togglePause() {
    this.ensureAudio();

    if (this.isEditorPlaytest) {
      this.registry.remove("draftLevel");
      this.scene.start("LevelEditorScene");
      return;
    }

    if (this.paused) {
      this.paused = false;
      this.clearGameplayInput();
      this.physics.resume();
      if (this.quiz) {
        this.quiz.endsAt += this.time.now - this.pauseStartedAt;
      }
      this.destroyPauseMenu();
      this.playTone("resume");
      return;
    }

    this.paused = true;
    this.pauseStartedAt = this.time.now;
    this.clearGameplayInput();
    this.physics.pause();
    this.createPauseMenu();
    this.playTone("pause");
  }

  createPauseMenu() {
    this.pauseSelectedIndex = 0;
    emitGameEvent("edgecase:pause-open");
  }

  executePauseAction(action) {
    if (!this.paused || !action) {
      return;
    }

    if (action === "resume") {
      this.togglePause();
      return;
    }

    this.physics.resume();
    this.paused = false;
    this.clearGameplayInput();
    this.destroyPauseMenu();

    if (action === "restart") {
      this.scene.restart();
    } else if (action === "level-select") {
      this.scene.stop();
      emitGameEvent("edgecase:navigate-level-select");
    } else {
      this.scene.start("MenuScene");
    }
  }

  destroyPauseMenu() {
    emitGameEvent("edgecase:pause-close");
  }

  tryStartChallenge(zone) {
    if (this.quiz || this.merchantOpen || zone.getData("locked") || zone.getData("completed")) {
      return;
    }

    this.startChallenge(zone);
  }

  startChallenge(zone) {
    const question = zone.getData("question");
    const id = zone.getData("id");
    const baseX = zone.x + (id === 2 ? -250 : 120);
    const doorY = 585;
    const doors = [];
    const uiItems = [];

    const panel = this.add.container(0, 0).setScrollFactor(0).setDepth(70);
    panel.add(this.add.rectangle(640, 118, 1110, 178, 0x08100f, 0.94).setStrokeStyle(3, 0xe7d66b));
    panel.add(this.add.text(110, 48, question.prompt, {
      fontFamily: "Cascadia Mono, Consolas, monospace",
      fontSize: "24px",
      color: "#edf8ed",
      wordWrap: { width: 760 }
    }));
    const timerText = this.add.text(1010, 50, "", {
      fontFamily: "Cascadia Mono, Consolas, monospace",
      fontSize: "28px",
      color: "#e7d66b"
    });
    panel.add(timerText);
    panel.setAlpha(0);
    panel.y = -18;

    question.options.forEach((option, index) => {
      const door = this.add.rectangle(baseX + index * 105, doorY, 78, 112, 0x18231d, 0.92).setStrokeStyle(4, 0xe7d66b);
      this.physics.add.existing(door, true);
      door.setData("answer", index);
      door.setDepth(25);
      door.setAlpha(0);
      door.setScale(1, 0.08);
      doors.push(door);
      uiItems.push(door);

      const letter = String.fromCharCode(65 + index);
      const optionX = 112 + (index % 2) * 450;
      const optionY = 104 + Math.floor(index / 2) * 44;
      panel.add(this.add.rectangle(optionX + 205, optionY + 15, 410, 32, 0x13201b, 1).setStrokeStyle(1, 0x3f5d4f));
      panel.add(this.add.text(optionX, optionY, `${letter}: ${option}`, {
        fontFamily: "Cascadia Mono, Consolas, monospace",
        fontSize: "15px",
        color: "#edf8ed",
        wordWrap: { width: 390 }
      }));

      const label = this.add.text(door.x - 21, door.y - 80, letter, {
        fontFamily: "EdgecaseTitle, Bahnschrift, Impact",
        fontSize: "38px",
        color: "#e7d66b",
        stroke: "#08100f",
        strokeThickness: 4
      }).setDepth(26);
      label.setAlpha(0);

      uiItems.push(label);
    });

    this.quiz = {
      zone,
      question,
      panel,
      doors,
      uiItems,
      selectedAnswer: null,
      startedAt: this.time.now,
      endsAt: this.time.now + CHALLENGE_SECONDS * 1000,
      timerText,
      closing: false
    };
    this.animateChallengeIn();
    this.showToast("Stand at a door and press E");
  }

  updateSelectedAnswerDoor() {
    if (!this.quiz) {
      return;
    }

    const playerBounds = this.player.getBounds();
    let selectedAnswer = null;

    for (const door of this.quiz.doors) {
      const isSelected = Phaser.Geom.Intersects.RectangleToRectangle(playerBounds, door.getBounds());
      if (isSelected) {
        selectedAnswer = door.getData("answer");
      }

      door.setFillStyle(isSelected ? 0x35594b : 0x18231d, isSelected ? 1 : 0.92);
      door.setStrokeStyle(isSelected ? 5 : 4, isSelected ? 0xf4e786 : 0xe7d66b);
    }

    this.quiz.selectedAnswer = selectedAnswer;
  }

  confirmSelectedAnswer() {
    if (!this.quiz || this.quiz.selectedAnswer === null) {
      this.showToast("Stand inside an answer door first");
      return;
    }

    const selected = this.quiz.selectedAnswer;
    const correct = selected === this.quiz.question.correct;
    this.finishChallenge(correct, correct ? "Correct" : "Wrong");
  }

  animateChallengeIn() {
    if (!this.quiz) {
      return;
    }

    this.tweens.add({
      targets: this.quiz.panel,
      alpha: 1,
      y: 0,
      duration: 120,
      ease: "Quad.easeOut"
    });

    this.quiz.uiItems.forEach((item, index) => {
      this.tweens.add({
        targets: item,
        alpha: 1,
        scaleY: 1,
        duration: 105,
        delay: 18 * index,
        ease: "Back.easeOut"
      });
    });
  }

  finishChallenge(success, reason) {
    if (!this.quiz) {
      return;
    }

    if (this.quiz.closing) {
      return;
    }

    const quiz = this.quiz;
    quiz.closing = true;

    const { zone, panel, uiItems, startedAt } = quiz;
    const elapsed = (this.time.now - startedAt) / 1000;
    const remaining = Math.max(0, CHALLENGE_SECONDS - elapsed);

    this.tweens.add({
      targets: panel,
      alpha: 0,
      y: -18,
      duration: 100,
      ease: "Quad.easeIn"
    });

    uiItems.forEach((item, index) => {
      this.tweens.add({
        targets: item,
        alpha: 0,
        scaleY: item.type === "Rectangle" ? 0.08 : 1,
        duration: 95,
        delay: 12 * index,
        ease: "Quad.easeIn"
      });
    });

    if (success) {
      const speedBonus = Math.round(remaining * 1.4);
      const multiplier = 1 + (this.answerStreak * 0.08);
      const earned = Math.round((this.tuning.reward + speedBonus) * multiplier);
      this.answerStreak += 1;
      zone.setData("completed", true);
      zone.setFillStyle(0x3fa68f, 0.14);
      zone.setStrokeStyle(3, 0x3fa68f, 0.65);

      this.coins += earned;
      this.showToast(`Correct: +${earned}`);
      this.playTone("correct");
    } else {
      this.answerStreak = 0;
      this.coins = Math.max(0, this.coins - 5);
      zone.setData("locked", true);
      zone.setFillStyle(0x5d2020, 0.2);
      zone.setStrokeStyle(3, 0xd65f4f, 0.8);
      this.addPenaltyHazard(zone.x + 120);
      this.showToast(`${reason}: zone locked, -5 coins`);
      this.playTone(reason === "Timeout" ? "timeout" : "wrong");
    }

    this.time.delayedCall(155, () => {
      panel.destroy(true);
      for (const item of uiItems) {
        item.destroy();
      }

      if (this.quiz === quiz) {
        this.quiz = null;
      }
    });
  }

  grantFastBuff() {
    const buffs = ["speed", "magnet", "shield"];
    const buff = buffs[this.answerStreak % buffs.length];
    const until = this.time.now + 12000;

    if (buff === "speed") {
      this.tempBuffs.speedUntil = until;
      return "speed boost";
    } else if (buff === "magnet") {
      this.tempBuffs.magnetUntil = until;
      return "coin magnet";
    }

    this.tempBuffs.shieldUntil = until;
    return "shield";
  }

  addPenaltyHazard(x) {
    const spike = this.hazards.create(x, this.floorY - 14, "spike");
    spike.refreshBody();
  }

  openMerchant() {
    this.merchantOpen = true;
    this.merchantSelectedIndex = Phaser.Math.Clamp(this.merchantSelectedIndex, 0, UPGRADES.length - 1);
    this.merchantHoldStartedAt = null;
    this.merchantHoldComplete = false;
    this.clearGameplayInput();
    this.player.setVelocity(0, 0);
    this.physics.pause();
    this.playTone("menu");
    this.emitMerchantState("edgecase:merchant-open");
  }

  closeMerchant() {
    if (!this.merchantOpen) {
      emitGameEvent("edgecase:merchant-close");
      return;
    }

    this.merchantOpen = false;
    this.clearGameplayInput();
    this.resetMerchantHold();
    if (!this.paused && !this.runEnded) {
      this.physics.resume();
    }
    emitGameEvent("edgecase:merchant-close");
  }

  resetMerchantHold() {
    this.merchantHoldStartedAt = null;
    this.merchantHoldComplete = false;
    this.merchantHoldDenied = false;
    this.stopMerchantChargeTone();
  }

  updateMerchantFocus() {
    if (!this.merchantOpen) {
      return;
    }

    this.emitMerchantState("edgecase:merchant-update");
  }

  emitMerchantState(type = "edgecase:merchant-update") {
    emitGameEvent(type, {
      coins: this.coins,
      selectedIndex: this.merchantSelectedIndex,
      upgrades: UPGRADES.map((upgrade) => ({
        ...upgrade,
        owned: Boolean(this.upgrades[upgrade.id]),
        affordable: this.coins >= upgrade.cost
      }))
    });
  }

  executeMerchantAction(action) {
    if (!this.merchantOpen || !action) {
      return;
    }

    if (action.type === "close") {
      this.closeMerchant();
      return;
    }

    if (action.type === "select") {
      this.merchantSelectedIndex = Phaser.Math.Clamp(action.index || 0, 0, UPGRADES.length - 1);
      this.resetMerchantHold();
      this.updateMerchantFocus();
      return;
    }

    if (action.type === "charge-start") {
      this.startMerchantChargeTone();
      return;
    }

    if (action.type === "charge") {
      this.updateMerchantChargeTone(Phaser.Math.Clamp(action.progress || 0, 0, 1));
      return;
    }

    if (action.type === "charge-stop") {
      this.stopMerchantChargeTone();
      return;
    }

    if (action.type === "deny") {
      const upgrade = UPGRADES.find((item) => item.id === action.id);
      this.showToast(this.upgrades[upgrade?.id] ? "Already owned" : "Not enough coins");
      this.playTone("deny");
      return;
    }

    if (action.type === "buy") {
      const upgrade = UPGRADES.find((item) => item.id === action.id);
      this.stopMerchantChargeTone();
      this.buyUpgrade(upgrade);
    }
  }

  startMerchantChargeTone() {
    if (!getSoundEnabled()) {
      this.stopMerchantChargeTone();
      return;
    }

    const audio = this.ensureAudio();
    if (!audio || !this.masterGain || this.merchantChargeOsc) {
      return;
    }

    const now = audio.currentTime;
    this.merchantChargeOsc = audio.createOscillator();
    this.merchantChargeGain = audio.createGain();
    this.merchantChargeOsc.type = "triangle";
    this.merchantChargeOsc.frequency.setValueAtTime(220, now);
    this.merchantChargeGain.gain.setValueAtTime(0.001, now);
    this.merchantChargeGain.gain.exponentialRampToValueAtTime(0.085, now + 0.04);
    this.merchantChargeOsc.connect(this.merchantChargeGain);
    this.merchantChargeGain.connect(this.masterGain);
    this.merchantChargeOsc.start(now);
  }

  updateMerchantChargeTone(progress) {
    if (!getSoundEnabled()) {
      this.stopMerchantChargeTone();
      return;
    }

    if (!this.audioContext || !this.merchantChargeOsc || !this.merchantChargeGain) {
      return;
    }

    const now = this.audioContext.currentTime;
    const frequency = Phaser.Math.Linear(220, 760, progress);
    const gain = Phaser.Math.Linear(0.055, 0.14, progress);
    this.merchantChargeOsc.frequency.setTargetAtTime(frequency, now, 0.025);
    this.merchantChargeGain.gain.setTargetAtTime(gain, now, 0.025);
  }

  stopMerchantChargeTone() {
    if (!this.audioContext || !this.merchantChargeOsc || !this.merchantChargeGain) {
      this.merchantChargeOsc = null;
      this.merchantChargeGain = null;
      return;
    }

    const now = this.audioContext.currentTime;
    const osc = this.merchantChargeOsc;
    const gain = this.merchantChargeGain;
    this.merchantChargeOsc = null;
    this.merchantChargeGain = null;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(0.001, now, 0.02);
    osc.stop(now + 0.08);
  }

  buyUpgrade(upgrade) {
    if (!upgrade || this.upgrades[upgrade.id]) {
      this.showToast("Already owned");
      this.playTone("deny");
      return;
    }

    if (this.coins < upgrade.cost) {
      this.showToast("Not enough coins");
      this.playTone("deny");
      return;
    }

    this.coins -= upgrade.cost;
    this.upgrades[upgrade.id] = true;
    this.showToast(`${upgrade.name} purchased`);
    this.playTone("buy");
    this.closeMerchant();
    this.openMerchant();
  }

  endRun(title = "RUN COMPLETE") {
    this.runEnded = true;
    this.merchantOpen = false;
    emitGameEvent("edgecase:merchant-close");
    this.clearGameplayInput();
    this.nearMerchant = false;
    this.nearExit = false;
    this.quiz = null;
    this.player.setAccelerationX(0);
    this.player.setVelocity(0, 0);
    if (this.player.body) {
      this.player.body.enable = false;
    }
    if (this.enemies) {
      for (const enemy of this.enemies.getChildren()) {
        enemy.setVelocity(0, 0);
      }
    }
    emitGameEvent("edgecase:end-run-open", {
      title,
      coins: this.coins,
      health: this.health,
      maxHealth: this.maxHealth,
      difficulty: this.difficulty,
      isEditorPlaytest: this.isEditorPlaytest
    });
  }

  executeEndRunAction(action) {
    if (!this.runEnded || !action) {
      return;
    }

    emitGameEvent("edgecase:end-run-close");
    emitGameEvent("edgecase:hud-clear");

    if (action === "play-again") {
      this.scene.start("GameScene");
    } else if (action === "back-editor") {
      this.returnToLevelEditor();
    } else {
      this.scene.start("MenuScene");
    }
  }

  returnToLevelEditor() {
    this.registry.remove("draftLevel");
    this.scene.start("LevelEditorScene");
  }

  collectCoin(coin) {
    this.coins += coin.getData("value") || 1;
    coin.disableBody(true, true);
    this.playTone("coin");
  }

  takeDamage(source) {
    const time = this.time.now;
    if (this.merchantOpen || this.isInMerchantSafeZone()) {
      return;
    }

    if (time - this.lastDamageAt < 900) {
      return;
    }

    const hasShield = time < this.tempBuffs.shieldUntil || (this.upgrades.shield && time - this.lastShieldUse > 18000);
    if (hasShield) {
      this.lastShieldUse = time;
      this.tempBuffs.shieldUntil = 0;
      this.player.setVelocityY(-360);
      this.showToast(`Shield blocked ${source}`);
      this.playTone("shield");
      this.lastDamageAt = time;
      return;
    }

    this.health = Math.max(0, this.health - 1);
    this.player.setVelocity(this.player.flipX ? 300 : -300, -430);
    this.cameras.main.shake(130, 0.01);
    this.showToast(`${source} hit: -1 HP`);
    this.playTone("hit");
    this.lastDamageAt = time;

    if (this.health <= 0) {
      this.endRun("DEFEATED");
    }
  }

  updateHud() {
    const buffs = [];
    if (this.upgrades.dash) buffs.push("Dash");
    if (this.upgrades.doubleJump) buffs.push("Double jump");
    if (this.upgrades.shield) buffs.push("Shield");
    if (this.upgrades.magnet) buffs.push("Magnet");
    if (this.time.now < this.tempBuffs.speedUntil) buffs.push("Speed buff");
    if (this.time.now < this.tempBuffs.magnetUntil) buffs.push("Magnet buff");
    if (this.time.now < this.tempBuffs.shieldUntil) buffs.push("Shield buff");
    const status = `FIELD ${this.level.name || "Tech"}  |  ${this.difficulty.toUpperCase()}  |  ${buffs.join(", ") || "No upgrades"}`;
    let prompt = "";

    if (this.merchantOpen) {
      prompt = "";
    } else if (this.nearMerchant) {
      prompt = "Press E: Merchant";
    } else if (this.nearExit) {
      prompt = "Press E: End run";
    } else if (this.quiz) {
      prompt = this.quiz.selectedAnswer === null ? "Stand in a door" : "Press E: Lock answer";
    }

    const hud = {
      coins: this.coins,
      health: this.health,
      maxHealth: this.maxHealth,
      status,
      prompt
    };
    const key = JSON.stringify(hud);
    if (key !== this.lastHudKey) {
      this.lastHudKey = key;
      emitGameEvent("edgecase:hud-update", hud);
    }
  }

  showToast(message) {
    emitGameEvent("edgecase:toast", { message });
  }

  menuUpPressed() {
    return Phaser.Input.Keyboard.JustDown(this.cursors.up) || Phaser.Input.Keyboard.JustDown(this.keys.w);
  }

  menuDownPressed() {
    return Phaser.Input.Keyboard.JustDown(this.cursors.down) || Phaser.Input.Keyboard.JustDown(this.keys.s);
  }

  ensureAudio() {
    if (!getSoundEnabled()) {
      this.stopMerchantChargeTone();
      this.stopMusic();
      return null;
    }

    if (!this.audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        return null;
      }
      this.audioContext = new AudioContextClass();
      this.masterGain = this.audioContext.createGain();
      this.musicGain = this.audioContext.createGain();
      this.masterGain.gain.value = 0.24;
      this.musicGain.gain.value = 0.001;
      this.masterGain.connect(this.audioContext.destination);
      this.musicGain.connect(this.audioContext.destination);
    }

    if (this.audioContext.state === "suspended") {
      this.audioContext.resume();
    }

    this.updateMusicVolume();
    this.startMusic();
    return this.audioContext;
  }

  playTone(type) {
    if (!getSoundEnabled()) {
      this.stopMerchantChargeTone();
      return;
    }

    const audio = this.ensureAudio();
    if (!audio || !this.masterGain) {
      return;
    }

    const now = audio.currentTime;
    const presets = {
      coin: { frequency: 920, end: 1320, duration: 0.08, wave: "square", gain: 0.32 },
      jump: { frequency: 260, end: 440, duration: 0.09, wave: "triangle", gain: 0.24 },
      dash: { frequency: 180, end: 90, duration: 0.11, wave: "sawtooth", gain: 0.2 },
      correct: { frequency: 520, end: 880, duration: 0.18, wave: "triangle", gain: 0.3 },
      wrong: { frequency: 180, end: 90, duration: 0.2, wave: "sawtooth", gain: 0.22 },
      timeout: { frequency: 150, end: 70, duration: 0.26, wave: "sawtooth", gain: 0.18 },
      hit: { frequency: 120, end: 55, duration: 0.16, wave: "square", gain: 0.26 },
      shield: { frequency: 360, end: 620, duration: 0.14, wave: "triangle", gain: 0.28 },
      buy: { frequency: 420, end: 760, duration: 0.16, wave: "triangle", gain: 0.3 },
      deny: { frequency: 160, end: 145, duration: 0.11, wave: "square", gain: 0.2 },
      menu: { frequency: 340, end: 420, duration: 0.07, wave: "triangle", gain: 0.16 },
      pause: { frequency: 260, end: 180, duration: 0.1, wave: "triangle", gain: 0.18 },
      resume: { frequency: 180, end: 260, duration: 0.1, wave: "triangle", gain: 0.18 }
    };
    const preset = presets[type] || presets.menu;
    const effectVolume = getSoundVolume();

    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = preset.wave;
    osc.frequency.setValueAtTime(preset.frequency, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, preset.end), now + preset.duration);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, preset.gain * effectVolume), now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + preset.duration);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + preset.duration + 0.02);
  }

  startMusic() {
    return;
  }

  stopMusic() {
    this.musicEvent?.remove(false);
    this.musicEvent = null;
    if (this.musicGain && this.audioContext) {
      this.musicGain.gain.setTargetAtTime(0.001, this.audioContext.currentTime, 0.04);
    }
  }

  updateMusicVolume() {
    if (!this.musicGain || !this.audioContext) {
      return;
    }
    const volume = getSoundEnabled() ? getMusicVolume() * 0.32 : 0;
    this.musicGain.gain.setTargetAtTime(Math.max(0.001, volume), this.audioContext.currentTime, 0.08);
  }

  playMusicStep() {
    if (!this.audioContext || !this.musicGain || !getSoundEnabled()) {
      this.stopMusic();
      return;
    }

    this.updateMusicVolume();
    const now = this.audioContext.currentTime;
    const bass = [82.41, 82.41, 110, 98, 73.42, 73.42, 98, 110];
    const lead = [329.63, 0, 392, 440, 493.88, 0, 440, 392];
    const step = this.musicStep % bass.length;
    this.playMusicNote(bass[step], 0.32, 0.18, "triangle", now);
    this.playMusicNote(bass[step] * 2, 0.2, 0.055, "sawtooth", now + 0.02);
    if (lead[step]) {
      this.playMusicNote(lead[step], 0.2, 0.11, "square", now + 0.03);
    }
    this.musicStep += 1;
  }

  playMusicNote(frequency, duration, gainValue, wave, startTime) {
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(frequency, startTime);
    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.exponentialRampToValueAtTime(gainValue, startTime + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }

  pickQuestion(difficulty, offset) {
    const pool = QUESTIONS.filter((question) => question.difficulty === difficulty);
    return pool[offset % pool.length];
  }

  addPlatform(data) {
    const { x, y, width, height } = data;
    const platform = this.platforms.create(x + width / 2, y + height / 2, "platform");
    platform.setDisplaySize(width, height);
    platform.setAngle(Number(data.rotation) || 0);
    platform.refreshBody();
  }

  itemSize(type, data = {}) {
    const defaults = ITEM_SIZES[type] || ITEM_SIZES.platform;
    return {
      width: data.width || defaults.width,
      height: data.height || defaults.height
    };
  }

  centerFromTopLeft(type, data) {
    const size = this.itemSize(type, data);
    return {
      x: data.x + size.width / 2,
      y: data.y + size.height / 2
    };
  }

  signStyle() {
    return {
      fontFamily: "Cascadia Mono, Consolas, monospace",
      fontSize: "15px",
      color: "#e7d66b",
      backgroundColor: "#08100f",
      padding: { x: 7, y: 5 }
    };
  }

  hudStyle(color) {
    return {
      fontFamily: "Cascadia Mono, Consolas, monospace",
      fontSize: "18px",
      color
    };
  }
}
