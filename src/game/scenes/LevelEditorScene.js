import { Group, Redo2, Trash2, Undo2, Ungroup } from "lucide";
import { LEVELS } from "../data/levels.js";
import {
  getEditorCoordinatesVisible,
  getEditorDisplaySettingsOpen,
  getEditorGridVisible,
  getEditorZoomHudVisible,
  setEditorCoordinatesVisible,
  setEditorDisplaySettingsOpen,
  setEditorGridVisible,
  setEditorZoomHudVisible
} from "../settings.js";

const TOOL_DEFS = [
  { id: "platform", label: "Platform" },
  { id: "coin", label: "Coin" },
  { id: "hazard", label: "Spike" },
  { id: "enemy", label: "Enemy" },
  { id: "challenge", label: "Challenge" },
  { id: "merchant", label: "Merchant" },
  { id: "exitGate", label: "Exit" },
  { id: "playerSpawn", label: "Spawn" },
  { id: "sign", label: "Sign" }
];

const COLORS = {
  platform: { fill: 0x17231d, stroke: 0xb9a44c },
  coin: { fill: 0xd8cd6c, stroke: 0xfff3a6 },
  hazard: { fill: 0xd65f4f, stroke: 0xffb0a6 },
  enemy: { fill: 0x2d7f6d, stroke: 0xe7d66b },
  challenge: { fill: 0x2d7f6d, stroke: 0xd8cd6c },
  merchant: { fill: 0x345347, stroke: 0xe7d66b },
  exitGate: { fill: 0x8a7440, stroke: 0xe7d66b },
  playerSpawn: { fill: 0xf0f4df, stroke: 0xd7c96d },
  sign: { fill: 0x08100f, stroke: 0xe7d66b }
};

const ITEM_SIZES = {
  platform: { width: 220, height: 36 },
  coin: { width: 24, height: 24 },
  hazard: { width: 36, height: 32 },
  enemy: { width: 40, height: 40 },
  challenge: { width: 172, height: 112 },
  merchant: { width: 240, height: 120 },
  exitGate: { width: 116, height: 140 },
  playerSpawn: { width: 36, height: 48 },
  sign: { width: 92, height: 36 }
};

const STROKE_WIDTH = 3;

const DEFAULT_WORLD_WIDTH = 4300;
const DEFAULT_WORLD_HEIGHT = 720;
const MIN_WORLD_WIDTH = 1280;
const MIN_WORLD_HEIGHT = 720;
const DEAD_CANVAS_RIGHT = 900;
const DEAD_CANVAS_TOP = 420;
const DEAD_CANVAS_BOTTOM = 420;
const WORLD_EXPAND_PADDING = 120;
const GROUND_HEIGHT = 64;
const GROUND_BOTTOM_MARGIN = 4;
const HUD_LEFT_WIDTH = 246;
const HUD_RIGHT_X = 1035;
const WORLD_VIEW_WIDTH = HUD_RIGHT_X - HUD_LEFT_WIDTH;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.1;
const DEFAULT_ZOOM = 1;
const GRID_SIZES = [4, 8, 16, 32, 64];
const DEFAULT_GRID_SIZE = 16;
const MIN_RESIZE_SIZE = 8;
const NUDGE_INITIAL_REPEAT_DELAY_MS = 250;
const NUDGE_REPEAT_MS = 55;
const HISTORY_LIMIT = 100;

const FIELD_CONFIG = {
  platform: [
    ["x", "number"], ["y", "number"], ["width", "number"], ["height", "number"], ["rotation", "number"]
  ],
  coin: [["x", "number"], ["y", "number"], ["rotation", "number"]],
  hazard: [["x", "number"], ["y", "number"], ["rotation", "number"]],
  enemy: [["x", "number"], ["y", "number"], ["min", "number"], ["max", "number"], ["rotation", "number"]],
  challenge: [
    ["x", "number"], ["y", "number"], ["width", "number"], ["height", "number"], ["rotation", "number"], ["label", "text"], ["difficulty", "select"]
  ],
  merchant: [
    ["x", "number"], ["y", "number"], ["width", "number"], ["height", "number"], ["rotation", "number"], ["npcX", "number"], ["npcY", "number"]
  ],
  exitGate: [["x", "number"], ["y", "number"], ["width", "number"], ["height", "number"], ["rotation", "number"]],
  playerSpawn: [["x", "number"], ["y", "number"], ["rotation", "number"]],
  sign: [["x", "number"], ["y", "number"], ["rotation", "number"], ["text", "text"]]
};

export class LevelEditorScene extends Phaser.Scene {
  constructor() {
    super("LevelEditorScene");
  }

  create() {
    this.cameras.main.setBackgroundColor("#07100f");
    this.activeTool = null;
    this.selected = null;
    this.selection = [];
    this.dragging = null;
    this.resizing = null;
    this.rotating = null;
    this.cameraDrag = null;
    this.areaSelection = null;
    this.hoveredObject = null;
    this.placementPreview = null;
    this.selectionOverlay = null;
    this.nudgeRepeat = { signature: "", startedAt: 0, lastAt: 0 };
    this.hudVisible = true;
    this.zoomHudVisible = getEditorZoomHudVisible();
    this.gridVisible = getEditorGridVisible();
    this.coordinatesVisible = getEditorCoordinatesVisible();
    this.displaySettingsOpen = getEditorDisplaySettingsOpen();
    this.gridSize = DEFAULT_GRID_SIZE;
    this.snapEnabled = true;
    this.cursorWorldPoint = null;
    this.savedSnapshot = null;
    this.undoStack = [];
    this.redoStack = [];
    this.domEditHistoryActive = false;
    this.nudgeHistoryActive = false;
    this.restoringHistory = false;
    this.canvasFocused = false;
    this.nextChallenge = 1;
    this.draft = this.makeDraftLevel();
    this.updateNextChallengeCounter();
    this.objects = [];

    this.createWorldChrome();
    this.createInputs();
    this.createDomHud();
    this.rebuildObjects();
    this.resizeWorldViewport();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroyDomHud());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.destroyDomHud());
  }

  makeDraftLevel() {
    const retainedDraft = this.registry.get("editorDraft");
    if (retainedDraft) {
      return this.normalizeDraftDimensions(this.stripFixedGround(structuredClone(retainedDraft)));
    }

    return this.normalizeDraftDimensions(this.createBlankLevel());
  }

  createWorldChrome() {
    this.worldChrome = this.add.container(0, 0).setDepth(-20);
    this.redrawWorldChrome();
  }

  createInputs() {
    this.handleCanvasContextMenu = (event) => event.preventDefault();
    this.game.canvas.addEventListener("contextmenu", this.handleCanvasContextMenu);
    this.game.canvas.tabIndex = 0;
    this.input.on("pointerdown", (pointer) => this.onPointerDown(pointer));
    this.input.on("pointermove", (pointer) => this.onPointerMove(pointer));
    this.input.on("pointerup", () => this.onPointerUp());
    window.addEventListener("keydown", this.handleHistoryKeyDown, true);
    window.addEventListener("pointerup", this.handleWindowPointerUp);
    window.addEventListener("blur", this.handleWindowPointerCancel);
    this.input.on("wheel", (pointer, _objects, dx, dy, event) => this.onWheel(pointer, dx, dy, event));

    this.keys = this.input.keyboard.addKeys({
      del: Phaser.Input.Keyboard.KeyCodes.DELETE,
      d: Phaser.Input.Keyboard.KeyCodes.D,
      c: Phaser.Input.Keyboard.KeyCodes.C,
      ctrl: Phaser.Input.Keyboard.KeyCodes.CTRL,
      shift: Phaser.Input.Keyboard.KeyCodes.SHIFT,
      alt: Phaser.Input.Keyboard.KeyCodes.ALT,
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      up: Phaser.Input.Keyboard.KeyCodes.UP,
      down: Phaser.Input.Keyboard.KeyCodes.DOWN,
      zero: Phaser.Input.Keyboard.KeyCodes.ZERO,
      z: Phaser.Input.Keyboard.KeyCodes.Z,
      y: Phaser.Input.Keyboard.KeyCodes.Y,
      i: Phaser.Input.Keyboard.KeyCodes.I,
      q: Phaser.Input.Keyboard.KeyCodes.Q,
      e: Phaser.Input.Keyboard.KeyCodes.E,
      esc: Phaser.Input.Keyboard.KeyCodes.ESC
    });
    this.input.keyboard.addCapture([
      Phaser.Input.Keyboard.KeyCodes.LEFT,
      Phaser.Input.Keyboard.KeyCodes.RIGHT,
      Phaser.Input.Keyboard.KeyCodes.UP,
      Phaser.Input.Keyboard.KeyCodes.DOWN
    ]);
  }

  createDomHud() {
    const host = document.getElementById("game-root") || document.body;
    this.hudRoot = document.createElement("div");
    this.hudRoot.className = "pointer-events-none absolute inset-0 z-10 font-mono text-[#edf8ed]";
    this.hudRoot.innerHTML = `
      <div data-zoom-control class="pointer-events-auto absolute left-1/2 top-3 flex -translate-x-1/2 items-center overflow-hidden rounded-sm border border-[#385346] bg-[#06100e]/90 text-xs font-bold text-[#f4e786] shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
        <button data-zoom-out type="button" title="Zoom out" class="grid h-8 w-8 place-items-center border-r border-[#385346] text-lg leading-none transition hover:bg-[#102019] hover:text-[#fff3a6]">-</button>
        <button data-zoom-indicator type="button" title="Reset zoom" class="h-8 min-w-24 px-3 transition hover:bg-[#102019] hover:text-[#fff3a6]">ZOOM 100%</button>
        <button data-zoom-in type="button" title="Zoom in" class="grid h-8 w-8 place-items-center border-l border-[#385346] text-lg leading-none transition hover:bg-[#102019] hover:text-[#fff3a6]">+</button>
      </div>
      <div data-grid-control class="pointer-events-auto absolute left-1/2 top-14 flex -translate-x-1/2 items-center overflow-hidden rounded-sm border border-[#385346] bg-[#06100e]/90 text-xs font-bold text-[#edf8ed] shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
        <div class="border-r border-[#385346] px-3 text-[#8fa89d]">GRID</div>
        ${GRID_SIZES.map((size) => `<button data-grid-size="${size}" type="button" title="Grid ${size}px" class="h-8 min-w-10 border-r border-[#385346] px-2 transition hover:bg-[#102019] hover:text-[#fff3a6]">${size}</button>`).join("")}
        <button data-snap-toggle type="button" title="Toggle snapping" class="h-8 min-w-24 border-r border-[#385346] px-3 transition hover:bg-[#102019] hover:text-[#fff3a6]">SNAP ON</button>
        <div data-snap-modifier class="min-w-20 px-3 text-center text-[#8fa89d]">ALT: SNAP</div>
      </div>
      <div data-cursor-coords class="pointer-events-none absolute bottom-3 left-1/2 min-w-40 -translate-x-1/2 rounded-sm border border-[#385346] bg-[#06100e]/90 px-3 py-2 text-center text-xs font-bold text-[#8fa89d] shadow-[0_8px_24px_rgba(0,0,0,0.3)]">X: ---- Y: ----</div>
      <aside data-left-panel class="pointer-events-auto absolute left-0 top-0 flex h-full w-[246px] flex-col border-r border-[#385346] bg-[#06100e]/95 p-4 shadow-[18px_0_36px_rgba(0,0,0,0.35)]">
        <div class="font-[EdgecaseTitle] text-3xl text-[#e7d66b]">LEVEL MAKER</div>
        <div class="mt-2 text-xs text-[#8fa89d]">Ctrl+I hides panels</div>
        <div class="mt-4 grid grid-cols-2 gap-2">
          <button data-action="undo" type="button" title="Undo (Ctrl+Z)" class="flex items-center justify-center gap-2 rounded-sm border border-[#385346] bg-[#102019] px-2 py-2 text-sm font-bold text-[#edf8ed] transition-colors hover:border-[#6d8e78] hover:bg-[#21372e] hover:text-[#f4e786] disabled:cursor-not-allowed disabled:border-[#263d35] disabled:bg-[#0a1411] disabled:text-[#526a60]">${this.lucideSvg(Undo2, 16)}UNDO</button>
          <button data-action="redo" type="button" title="Redo (Ctrl+Y)" class="flex items-center justify-center gap-2 rounded-sm border border-[#385346] bg-[#102019] px-2 py-2 text-sm font-bold text-[#edf8ed] transition-colors hover:border-[#6d8e78] hover:bg-[#21372e] hover:text-[#f4e786] disabled:cursor-not-allowed disabled:border-[#263d35] disabled:bg-[#0a1411] disabled:text-[#526a60]">${this.lucideSvg(Redo2, 16)}REDO</button>
        </div>
        <label class="mt-5 flex flex-col gap-1 text-xs font-bold text-[#8fa89d]">
          LEVEL NAME
          <input data-level-name type="text" value="${this.escapeHtml(this.draft.name)}" class="rounded-sm border border-[#385346] bg-[#102019] px-2 py-2 text-sm text-[#edf8ed] outline-none transition focus:border-[#f4e786]" />
        </label>
        <div data-canvas-size class="mt-4 grid grid-cols-2 gap-2">
          <label class="flex flex-col gap-1 text-xs font-bold text-[#8fa89d]">
            WIDTH
            <input data-world-width type="number" min="${MIN_WORLD_WIDTH}" step="10" value="${this.worldWidth()}" class="rounded-sm border border-[#385346] bg-[#102019] px-2 py-2 text-sm text-[#edf8ed] outline-none transition focus:border-[#f4e786]" />
          </label>
          <label class="flex flex-col gap-1 text-xs font-bold text-[#8fa89d]">
            HEIGHT
            <input data-world-height type="number" min="${MIN_WORLD_HEIGHT}" step="10" value="${this.worldHeight()}" class="rounded-sm border border-[#385346] bg-[#102019] px-2 py-2 text-sm text-[#edf8ed] outline-none transition focus:border-[#f4e786]" />
          </label>
        </div>
        <div class="mt-2 text-xs text-[#8fa89d]">Dead canvas expands on drop</div>
        <div data-tools class="mt-5 flex flex-col gap-2"></div>
        <section class="mt-auto rounded-sm border border-[#385346] bg-[#0d1a16]">
          <button data-display-settings-toggle type="button" aria-expanded="true" class="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-bold text-[#f4e786] transition-colors hover:bg-[#102019]">
            <span>DISPLAY</span>
            <span data-display-settings-indicator class="text-[#8fa89d]">-</span>
          </button>
          <div data-display-settings-panel class="border-t border-[#385346] p-2">
            <button data-display-toggle="zoom" type="button" aria-pressed="true" class="mb-2 flex w-full items-center justify-between rounded-sm border px-3 py-2 text-xs font-bold transition-colors">
              <span>ZOOM</span>
              <span data-display-toggle-state="zoom">ON</span>
            </button>
            <button data-display-toggle="grid" type="button" aria-pressed="true" class="mb-2 flex w-full items-center justify-between rounded-sm border px-3 py-2 text-xs font-bold transition-colors">
              <span>GRID</span>
              <span data-display-toggle-state="grid">ON</span>
            </button>
            <button data-display-toggle="coordinates" type="button" aria-pressed="true" class="flex w-full items-center justify-between rounded-sm border px-3 py-2 text-xs font-bold transition-colors">
              <span>COORDS</span>
              <span data-display-toggle-state="coordinates">ON</span>
            </button>
          </div>
        </section>
      </aside>
      <aside data-right-panel class="pointer-events-auto absolute right-0 top-0 flex h-full w-[245px] flex-col border-l border-[#385346] bg-[#06100e]/95 p-4 shadow-[-18px_0_36px_rgba(0,0,0,0.35)]">
        <div class="font-[EdgecaseTitle] text-3xl text-[#e7d66b]">SELECTED</div>
        <div data-inspector class="mt-5 min-h-0 flex-1 overflow-y-auto pr-1"></div>
        <div data-message class="mb-3 min-h-10 text-sm text-[#f4e786]"></div>
        <div class="grid grid-cols-2 gap-2">
          <button data-action="exit" class="rounded-sm border border-[#7b332d] bg-[#d65f4f] px-3 py-2 text-sm font-bold text-[#07100f] transition-colors hover:border-[#f07b6e] hover:bg-[#f07b6e]">EXIT</button>
          <button data-action="save" class="rounded-sm border border-[#b9a44c] bg-[#e7d66b] px-3 py-2 text-sm font-bold text-[#07100f] transition-colors hover:border-[#f4e786] hover:bg-[#f4e786]">SAVE</button>
        </div>
        <button data-action="playtest" class="mt-2 flex w-full items-center justify-center gap-3 rounded-sm border border-[#6ad8b4] bg-[#3fa68f] px-3 py-3 text-base font-bold text-[#07100f] transition-colors hover:border-[#8ee0c6] hover:bg-[#62cba8]">
          <span class="inline-block h-0 w-0 border-y-[8px] border-l-[13px] border-y-transparent border-l-[#07100f]"></span>
          <span>PLAYTEST</span>
        </button>
        <div data-save-status class="mt-2 rounded-sm border border-[#385346] bg-[#0d1a16] px-3 py-2 text-xs font-bold text-[#d65f4f]">UNSAVED</div>
      </aside>
    `;
    host.appendChild(this.hudRoot);
    this.hudRoot.addEventListener("pointerdown", () => {
      this.canvasFocused = false;
      this.updateHistoryControls();
    });
    this.hudRoot.addEventListener("focusin", () => {
      this.canvasFocused = false;
      this.updateHistoryControls();
    });
    ["keydown", "keyup", "keypress"].forEach((eventName) => {
      this.hudRoot.addEventListener(eventName, (event) => {
        if (this.isEditableDomTarget(event.target)) {
          event.stopPropagation();
        }
      });
    });

    this.toolListEl = this.hudRoot.querySelector("[data-tools]");
    this.inspectorEl = this.hudRoot.querySelector("[data-inspector]");
    this.messageEl = this.hudRoot.querySelector("[data-message]");
    this.statusEl = this.hudRoot.querySelector("[data-save-status]");
    this.zoomControlEl = this.hudRoot.querySelector("[data-zoom-control]");
    this.gridControlEl = this.hudRoot.querySelector("[data-grid-control]");
    this.zoomIndicatorEl = this.hudRoot.querySelector("[data-zoom-indicator]");
    this.snapToggleEl = this.hudRoot.querySelector("[data-snap-toggle]");
    this.snapModifierEl = this.hudRoot.querySelector("[data-snap-modifier]");
    this.cursorCoordsEl = this.hudRoot.querySelector("[data-cursor-coords]");
    this.displaySettingsToggleEl = this.hudRoot.querySelector("[data-display-settings-toggle]");
    this.displaySettingsIndicatorEl = this.hudRoot.querySelector("[data-display-settings-indicator]");
    this.displaySettingsPanelEl = this.hudRoot.querySelector("[data-display-settings-panel]");
    this.displayToggleEls = {
      zoom: this.hudRoot.querySelector("[data-display-toggle='zoom']"),
      grid: this.hudRoot.querySelector("[data-display-toggle='grid']"),
      coordinates: this.hudRoot.querySelector("[data-display-toggle='coordinates']")
    };
    this.displayToggleStateEls = {
      zoom: this.hudRoot.querySelector("[data-display-toggle-state='zoom']"),
      grid: this.hudRoot.querySelector("[data-display-toggle-state='grid']"),
      coordinates: this.hudRoot.querySelector("[data-display-toggle-state='coordinates']")
    };
    this.worldWidthInputEl = this.hudRoot.querySelector("[data-world-width]");
    this.worldHeightInputEl = this.hudRoot.querySelector("[data-world-height]");
    this.nameInputEl = this.hudRoot.querySelector("[data-level-name]");
    this.undoButtonEl = this.hudRoot.querySelector("[data-action='undo']");
    this.redoButtonEl = this.hudRoot.querySelector("[data-action='redo']");
    this.undoButtonEl.addEventListener("click", () => this.undo({ requireCanvasFocus: false }));
    this.redoButtonEl.addEventListener("click", () => this.redo({ requireCanvasFocus: false }));
    this.nameInputEl.addEventListener("input", () => {
      this.draft.name = this.nameInputEl.value;
      this.markDirty();
    });
    this.worldWidthInputEl.addEventListener("focus", () => this.beginDomEditHistory());
    this.worldHeightInputEl.addEventListener("focus", () => this.beginDomEditHistory());
    this.worldWidthInputEl.addEventListener("blur", () => this.endDomEditHistory());
    this.worldHeightInputEl.addEventListener("blur", () => this.endDomEditHistory());
    this.worldWidthInputEl.addEventListener("input", () => this.updateCanvasSizeFromInputs());
    this.worldHeightInputEl.addEventListener("input", () => this.updateCanvasSizeFromInputs());
    this.hudRoot.querySelector("[data-zoom-out]").addEventListener("click", () => this.adjustCanvasZoom(-ZOOM_STEP));
    this.hudRoot.querySelector("[data-zoom-in]").addEventListener("click", () => this.adjustCanvasZoom(ZOOM_STEP));
    this.zoomIndicatorEl.addEventListener("click", () => this.resetCanvasZoom());
    this.displaySettingsToggleEl.addEventListener("click", () => {
      this.displaySettingsOpen = setEditorDisplaySettingsOpen(!this.displaySettingsOpen);
      this.updateDisplaySettingsControls();
    });
    this.displayToggleEls.zoom.addEventListener("click", () => {
      this.zoomHudVisible = setEditorZoomHudVisible(!this.zoomHudVisible);
      this.updateDisplaySettingsControls();
    });
    this.displayToggleEls.grid.addEventListener("click", () => {
      this.gridVisible = setEditorGridVisible(!this.gridVisible);
      this.updateDisplaySettingsControls();
    });
    this.displayToggleEls.coordinates.addEventListener("click", () => {
      this.coordinatesVisible = setEditorCoordinatesVisible(!this.coordinatesVisible);
      this.updateCursorCoordinates();
      this.updateDisplaySettingsControls();
    });
    this.snapToggleEl.addEventListener("click", () => {
      this.snapEnabled = !this.snapEnabled;
      this.updateGridControls();
      this.updatePlacementPreview(this.input.activePointer);
    });
    this.hudRoot.querySelectorAll("[data-grid-size]").forEach((button) => {
      button.addEventListener("click", () => {
        this.gridSize = Number(button.dataset.gridSize) || DEFAULT_GRID_SIZE;
        this.redrawWorldChrome();
        this.updateGridControls();
        this.updatePlacementPreview(this.input.activePointer);
      });
    });

    TOOL_DEFS.forEach((tool) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.tool = tool.id;
      button.className = this.toolClass(false);
      button.textContent = tool.label;
      button.addEventListener("click", () => {
        this.activeTool = tool.id;
        this.clearSelection();
        this.updateToolButtons();
        this.updatePlacementPreview(this.input.activePointer);
        this.showMessage(`${tool.label} ready`);
      });
      this.toolListEl.appendChild(button);
    });

    this.hudRoot.querySelector("[data-action='exit']").addEventListener("click", () => this.exitEditor());
    this.hudRoot.querySelector("[data-action='save']").addEventListener("click", () => this.saveLevel());
    this.hudRoot.querySelector("[data-action='playtest']").addEventListener("click", () => this.playtest());
    this.scale.on(Phaser.Scale.Events.RESIZE, this.resizeWorldViewport, this);
    this.updateToolButtons();
    this.renderInspector();
    this.savedSnapshot = this.serializeDraft();
    this.updateSaveStatus();
    this.updateHistoryControls();
    this.updateZoomIndicator();
    this.updateGridControls();
    this.updateCursorCoordinates();
    this.updateDisplaySettingsControls();
  }

  update(time) {
    if (this.isTypingInDomField()) {
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.zero) && this.keys.ctrl.isDown) {
      this.resetCanvasZoom();
      return;
    }

    this.updateGridControls();
    if (this.handleKeyboardNudge(time)) {
      return;
    }
    if (this.handleKeyboardRotate()) {
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.i) && this.keys.ctrl.isDown) {
      this.toggleHud();
    } else if (Phaser.Input.Keyboard.JustDown(this.keys.esc)) {
      if (this.activeTool) {
        this.cancelPlacement();
        return;
      }
      this.clearSelection();
    } else if (Phaser.Input.Keyboard.JustDown(this.keys.del)) {
      this.deleteSelected();
    } else if (Phaser.Input.Keyboard.JustDown(this.keys.d)) {
      this.duplicateSelected();
    } else if (Phaser.Input.Keyboard.JustDown(this.keys.c)) {
      this.copyLevelData("Copied level data");
    }
  }

  isTypingInDomField() {
    return this.isEditableDomTarget(document.activeElement);
  }

  isEditableDomTarget(target) {
    return target instanceof HTMLElement && (
      target.matches("input, textarea, select") ||
      target.isContentEditable
    );
  }

  blurActiveDomField() {
    if (this.isEditableDomTarget(document.activeElement)) {
      document.activeElement.blur();
    }
  }

  worldWidth() {
    return this.draft?.worldWidth || DEFAULT_WORLD_WIDTH;
  }

  worldHeight() {
    return this.draft?.worldHeight || DEFAULT_WORLD_HEIGHT;
  }

  groundY() {
    return this.worldHeight() - GROUND_HEIGHT / 2 - GROUND_BOTTOM_MARGIN;
  }

  groundTop() {
    return this.groundY() - GROUND_HEIGHT / 2;
  }

  editableMinY() {
    return -DEAD_CANVAS_TOP;
  }

  editableMaxX() {
    return this.worldWidth() + DEAD_CANVAS_RIGHT;
  }

  normalizeDraftDimensions(level) {
    level.worldWidth = Math.max(MIN_WORLD_WIDTH, Number(level.worldWidth) || DEFAULT_WORLD_WIDTH);
    level.worldHeight = Math.max(MIN_WORLD_HEIGHT, Number(level.worldHeight) || DEFAULT_WORLD_HEIGHT);
    level.floorY = level.worldHeight - GROUND_HEIGHT - GROUND_BOTTOM_MARGIN;
    level.platforms ||= [];
    level.coins ||= [];
    level.hazards ||= [];
    level.enemies ||= [];
    level.challenges ||= [];
    level.signs ||= [];
    return level;
  }

  updateCanvasSizeFromInputs() {
    this.beginDomEditHistory();
    const previousWidth = this.worldWidth();
    const previousHeight = this.worldHeight();
    this.draft.worldWidth = Math.max(MIN_WORLD_WIDTH, Number(this.worldWidthInputEl.value) || MIN_WORLD_WIDTH);
    this.draft.worldHeight = Math.max(MIN_WORLD_HEIGHT, Number(this.worldHeightInputEl.value) || MIN_WORLD_HEIGHT);
    this.draft.floorY = this.groundTop();
    this.updateCanvasSizeInputs();

    if (this.draft.worldWidth < previousWidth || this.draft.worldHeight < previousHeight) {
      this.clampAllObjectsToWorld();
      this.rebuildObjects();
    }

    this.redrawWorldChrome();
    this.resizeWorldViewport();
    this.refreshInspectorValues();
    this.markDirty();
  }

  updateCanvasSizeInputs() {
    if (this.worldWidthInputEl && document.activeElement !== this.worldWidthInputEl) {
      this.worldWidthInputEl.value = this.worldWidth();
    }
    if (this.worldHeightInputEl && document.activeElement !== this.worldHeightInputEl) {
      this.worldHeightInputEl.value = this.worldHeight();
    }
  }

  onWheel(pointer, dx, dy, event) {
    if (!this.pointerInsideWorldViewport(pointer)) return;

    const ctrlDown = pointer.event?.ctrlKey || event?.ctrlKey || this.keys.ctrl.isDown;
    if (!ctrlDown) {
      pointer.event?.preventDefault?.();
      event?.preventDefault?.();
      this.panCanvasByWheel(dx, dy);
      return;
    }

    pointer.event?.preventDefault?.();
    event?.preventDefault?.();

    const direction = dy > 0 ? -1 : 1;
    const nextZoom = Phaser.Math.Clamp(
      this.cameras.main.zoom + direction * ZOOM_STEP,
      MIN_ZOOM,
      MAX_ZOOM
    );

    this.setCanvasZoom(nextZoom, pointer);
  }

  panCanvasByWheel(dx, dy) {
    const camera = this.cameras.main;
    camera.scrollX += dx / camera.zoom;
    camera.scrollY += dy / camera.zoom;
    this.clampCameraScroll();
  }

  setCanvasZoom(nextZoom, pointer = null) {
    const camera = this.cameras.main;
    if (Math.abs(camera.zoom - nextZoom) < 0.001) return;

    const anchorWorld = pointer && this.pointerInsideWorldViewport(pointer)
      ? this.worldPointFromPointer(pointer)
      : null;

    camera.setZoom(nextZoom);

    if (anchorWorld) {
      const pointerWorld = camera.getWorldPoint(pointer.x, pointer.y);
      camera.scrollX += anchorWorld.x - pointerWorld.x;
      camera.scrollY += anchorWorld.y - pointerWorld.y;
    }

    this.clampCameraScroll();
    this.updateZoomIndicator();
    this.updateSelectionOverlay();
  }

  handleWindowPointerUp = () => {
    if (this.areaSelection || this.dragging || this.cameraDrag) {
      this.onPointerUp();
    }
  };

  handleWindowPointerCancel = () => {
    this.cancelPointerInteraction();
  };

  handleHistoryKeyDown = (event) => {
    if (!this.canUseHistoryShortcut() || this.isEditableDomTarget(event.target)) return;

    const key = event.key.toLowerCase();
    const isModifierDown = event.ctrlKey || event.metaKey;
    const redo = isModifierDown && (key === "y" || (key === "z" && event.shiftKey));
    const undo = isModifierDown && key === "z" && !event.shiftKey;
    if (!undo && !redo) return;

    event.preventDefault();
    event.stopPropagation();
    if (redo) {
      this.redo({ requireCanvasFocus: false });
    } else {
      this.undo({ requireCanvasFocus: false });
    }
  };

  adjustCanvasZoom(delta) {
    this.setCanvasZoom(Phaser.Math.Clamp(
      this.cameras.main.zoom + delta,
      MIN_ZOOM,
      MAX_ZOOM
    ));
  }

  resetCanvasZoom() {
    this.cameras.main.setZoom(DEFAULT_ZOOM);
    this.clampCameraScroll();
    this.updateZoomIndicator();
    this.updateSelectionOverlay();
  }

  onPointerDown(pointer) {
    this.blurActiveDomField();

    this.canvasFocused = this.pointerInsideWorldViewport(pointer);
    this.updateHistoryControls();
    if (this.canvasFocused) {
      this.game.canvas.focus({ preventScroll: true });
    }

    if (pointer.rightButtonDown() || pointer.button === 2) {
      pointer.event?.preventDefault?.();
      if (this.activeTool) {
        this.cancelPlacement();
      } else {
        this.cancelPointerInteraction();
      }
      return;
    }

    if (this.areaSelection || this.dragging || this.resizing || this.rotating || this.cameraDrag) {
      this.cancelPointerInteraction();
    }

    const worldPoint = this.worldPointFromPointer(pointer);
    if (!worldPoint) return;
    this.cursorWorldPoint = worldPoint;
    this.updateCursorCoordinates();

    const transformHandle = this.findTransformHandleAt(worldPoint.x, worldPoint.y);
    if (transformHandle?.type === "rotate") {
      this.startRotation(transformHandle, worldPoint);
      return;
    }
    if (transformHandle) {
      this.startResize(transformHandle, worldPoint, pointer);
      return;
    }

    if (this.keys.shift.isDown) {
      this.startCameraDrag(pointer);
      return;
    }

    const world = this.snapPoint(worldPoint.x, worldPoint.y, pointer);
    const hit = this.findObjectAt(world.x, world.y);
    if (hit) {
      const group = hit.data.groupId ? this.objects.filter((obj) => obj.data.groupId === hit.data.groupId) : [hit];
      const targets = this.selection.includes(hit) ? this.selection : group;
      this.selectObjects(targets, hit);
      this.dragging = {
        objects: targets.map((obj) => ({ obj, startX: obj.data.x, startY: obj.data.y })),
        startX: world.x,
        startY: world.y,
        historyRecorded: false
      };
      return;
    }

    if (!this.activeTool) {
      this.startAreaSelection(world.x, world.y);
      return;
    }

    const created = this.createDataForTool(world.x, world.y);
    this.recordHistory();
    this.clampDataToEditableArea(created.type, created);
    const added = this.addData(created);
    this.expandWorldToIncludeObjects([{ type: created.type, data: created }]);
    this.clampDataToWorld(created.type, created);
    this.rebuildObjects();
    this.redrawWorldChrome();
    this.resizeWorldViewport();
    this.selectObject(this.objects.find((obj) => obj.data === added) || this.objects[this.objects.length - 1]);
    this.activeTool = null;
    this.destroyPlacementPreview();
    this.updateToolButtons();
    this.markDirty();
  }

  onPointerMove(pointer) {
    const worldPoint = this.worldPointFromPointer(pointer);
    if (!worldPoint) {
      this.cursorWorldPoint = null;
      this.updateCursorCoordinates();
      this.setHoveredObject(null);
      this.updatePlacementPreview(null);
      if (!pointer.isDown && (this.areaSelection || this.dragging || this.resizing || this.rotating || this.cameraDrag)) {
        this.cancelPointerInteraction();
      }
      return;
    }
    this.cursorWorldPoint = worldPoint;
    this.updateCursorCoordinates();

    if (this.cameraDrag) {
      this.updatePlacementPreview(null);
      this.updateCameraDrag(pointer);
      return;
    }

    if (this.resizing) {
      this.updatePlacementPreview(null);
      this.updateResize(worldPoint, pointer);
      return;
    }

    if (this.rotating) {
      this.updatePlacementPreview(null);
      this.updateRotation(worldPoint, pointer);
      return;
    }

    const world = this.snapPoint(worldPoint.x, worldPoint.y, pointer);
    if (this.areaSelection) {
      this.updatePlacementPreview(null);
      this.updateAreaSelection(world.x, world.y);
      return;
    }

    if (!this.dragging) {
      this.updateResizeCursor(worldPoint.x, worldPoint.y);
      this.setHoveredObject(this.findObjectAt(world.x, world.y));
      this.updatePlacementPreview(pointer);
      return;
    }

    this.updatePlacementPreview(null);
    const dx = world.x - this.dragging.startX;
    const dy = world.y - this.dragging.startY;
    const clampedDelta = this.clampedEditableSelectionDelta(this.dragging.objects, dx, dy);
    if (clampedDelta.dx === 0 && clampedDelta.dy === 0) return;
    if (!this.dragging.historyRecorded) {
      this.recordHistory();
      this.dragging.historyRecorded = true;
    }
    for (const item of this.dragging.objects) {
      item.obj.data.x = item.startX + clampedDelta.dx;
      item.obj.data.y = item.startY + clampedDelta.dy;
      this.clampDataToEditableArea(item.obj.type, item.obj.data);
      this.syncVisual(item.obj);
    }
    this.updateSelectionOverlay();
    this.refreshInspectorValues();
    this.markDirty();
  }

  onPointerUp() {
    const draggedObjects = this.dragging?.objects.map(({ obj }) => obj) || [];
    const resizedObject = this.resizing?.obj || null;
    const rotatedObjects = this.rotating?.objects || [];
    this.finishAreaSelection();
    this.dragging = null;
    this.resizing = null;
    this.rotating = null;
    this.cameraDrag = null;
    this.input.setDefaultCursor("default");
    if (resizedObject) {
      this.expandWorldToIncludeObjects([resizedObject]);
      this.clampDataToWorld(resizedObject.type, resizedObject.data);
      this.syncVisual(resizedObject);
      this.updateSelectionOverlay();
      this.redrawWorldChrome();
      this.resizeWorldViewport();
      this.refreshInspectorValues();
      this.markDirty();
      this.discardUnchangedHistoryEntry();
      return;
    }
    if (rotatedObjects.length > 0) {
      this.updateSelectionOverlay();
      this.refreshInspectorValues();
      this.markDirty();
      this.discardUnchangedHistoryEntry();
      return;
    }
    if (draggedObjects.length > 0) {
      this.expandWorldToIncludeObjects(draggedObjects);
      draggedObjects.forEach((obj) => {
        this.clampDataToWorld(obj.type, obj.data);
        this.syncVisual(obj);
      });
      this.updateSelectionOverlay();
      this.redrawWorldChrome();
      this.resizeWorldViewport();
      this.refreshInspectorValues();
      this.markDirty();
      this.discardUnchangedHistoryEntry();
    }
  }

  cancelPointerInteraction() {
    if (this.areaSelection) {
      this.areaSelection.visual.destroy();
      this.areaSelection = null;
    }
    this.dragging = null;
    this.resizing = null;
    this.rotating = null;
    this.cameraDrag = null;
    this.input.setDefaultCursor("default");
  }

  cancelPlacement() {
    this.activeTool = null;
    this.destroyPlacementPreview();
    this.updateToolButtons();
    this.showMessage("Placement cancelled");
  }

  startCameraDrag(pointer) {
    this.cameraDrag = {
      startPointerX: pointer.x,
      startPointerY: pointer.y,
      startScrollX: this.cameras.main.scrollX,
      startScrollY: this.cameras.main.scrollY
    };
    this.input.setDefaultCursor("grabbing");
  }

  updateCameraDrag(pointer) {
    const camera = this.cameras.main;
    const dx = (pointer.x - this.cameraDrag.startPointerX) / camera.zoom;
    const dy = (pointer.y - this.cameraDrag.startPointerY) / camera.zoom;

    camera.scrollX = this.cameraDrag.startScrollX - dx;
    camera.scrollY = this.cameraDrag.startScrollY - dy;
    this.clampCameraScroll();
  }

  createDataForTool(x, y, options = {}) {
    const tool = options.tool || this.activeTool;
    const size = this.objectSize(tool, {});
    if (tool === "platform") return { type: "platform", x, y, width: size.width, height: size.height };
    if (tool === "coin") return { type: "coin", x, y };
    if (tool === "hazard") return { type: "hazard", x, y };
    if (tool === "enemy") return { type: "enemy", x, y, min: x - 120, max: x + 120 };
    if (tool === "challenge") {
      const index = this.nextChallenge;
      if (options.commit !== false) {
        this.nextChallenge += 1;
      }
      return { type: "challenge", x, y, width: size.width, height: size.height, label: `CHALLENGE ${String(index).padStart(2, "0")}`, difficulty: "easy" };
    }
    if (tool === "merchant") return { type: "merchant", x, y, width: size.width, height: size.height, npcX: x, npcY: y };
    if (tool === "exitGate") return { type: "exitGate", x, y, width: size.width, height: size.height };
    if (tool === "playerSpawn") return { type: "playerSpawn", x, y };
    return { type: "sign", x, y, text: "SIGN" };
  }

  addData(item) {
    const { type, ...data } = item;
    if (type === "platform") this.draft.platforms.push(data);
    if (type === "coin") this.draft.coins.push(data);
    if (type === "hazard") this.draft.hazards.push(data);
    if (type === "enemy") this.draft.enemies.push(data);
    if (type === "challenge") this.draft.challenges.push(data);
    if (type === "merchant") this.draft.merchant = data;
    if (type === "exitGate") this.draft.exitGate = data;
    if (type === "playerSpawn") this.draft.playerSpawn = data;
    if (type === "sign") this.draft.signs.push(data);
    return data;
  }

  rebuildObjects() {
    for (const obj of this.objects) {
      obj.visual.destroy();
      if (obj.label) obj.label.destroy();
      if (obj.patrol) obj.patrol.destroy();
    }
    this.objects = [];
    this.selected = null;
    this.selection = [];
    this.updateSelectionOverlay();

    this.addObjects("platform", this.draft.platforms);
    this.addObjects("coin", this.draft.coins);
    this.addObjects("hazard", this.draft.hazards);
    this.addObjects("enemy", this.draft.enemies);
    this.addObjects("challenge", this.draft.challenges);
    this.addObjects("merchant", this.draft.merchant ? [this.draft.merchant] : []);
    this.addObjects("exitGate", this.draft.exitGate ? [this.draft.exitGate] : []);
    this.addObjects("playerSpawn", this.draft.playerSpawn ? [this.draft.playerSpawn] : []);
    this.addObjects("sign", this.draft.signs);
  }

  addObjects(type, list) {
    for (const data of list) {
      const colors = COLORS[type];
      const size = this.objectSize(type, data);
      const center = this.objectCenter(type, data);
      let visual;
      if (type === "coin") {
        visual = this.add.circle(center.x, center.y, size.width / 2, colors.fill);
      } else if (type === "hazard") {
        visual = this.add.triangle(center.x, center.y, 0, size.height, size.width / 2, 0, size.width, size.height, colors.fill);
      } else if (type === "enemy") {
        visual = this.add.rectangle(center.x, center.y, size.width, size.height, colors.fill);
      } else if (type === "playerSpawn") {
        visual = this.add.rectangle(center.x, center.y, size.width, size.height, colors.fill);
      } else {
        visual = this.add.rectangle(center.x, center.y, size.width, size.height, colors.fill, type === "sign" ? 0.9 : 0.55);
      }
      this.applyObjectStroke({ type, visual }, colors.stroke);
      visual.setDepth(10);
      const obj = { type, data, visual };
      if (type === "enemy") {
        obj.patrol = this.createPatrolLine(data);
      }
      if (type === "challenge" || type === "sign") {
        obj.label = this.add.text(data.x, data.y - 20, data.label || data.text || type.toUpperCase(), this.smallStyle("#e7d66b")).setDepth(11);
      }
      this.objects.push(obj);
      this.syncVisual(obj);
    }
  }

  syncVisual(obj) {
    const size = this.objectSize(obj.type, obj.data);
    const center = this.objectCenter(obj.type, obj.data);
    obj.visual.setPosition(center.x, center.y);
    obj.visual.setAngle(Number(obj.data.rotation) || 0);
    if (obj.visual.setSize && obj.data.width && obj.data.height) {
      obj.visual.setSize(size.width, size.height);
      obj.visual.setDisplaySize(size.width, size.height);
    }
    if (obj.label) {
      obj.label.setPosition(obj.data.x, obj.data.y - 20);
      obj.label.setText(obj.data.label || obj.data.text || obj.type.toUpperCase());
    }
    if (obj.patrol) {
      obj.patrol.destroy();
      obj.patrol = this.createPatrolLine(obj.data);
    }
    if (this.selection.includes(obj)) {
      this.updateSelectionOverlay();
    }
  }

  updatePlacementPreview(pointer) {
    if (!this.activeTool || !pointer) {
      this.destroyPlacementPreview();
      return;
    }

    const worldPoint = this.worldPointFromPointer(pointer);
    if (!worldPoint) {
      this.destroyPlacementPreview();
      return;
    }

    const world = this.snapPoint(worldPoint.x, worldPoint.y, pointer);
    const data = this.createDataForTool(world.x, world.y, { commit: false });
    this.clampDataToEditableArea(data.type, data);

    if (!this.placementPreview || this.placementPreview.type !== data.type) {
      this.destroyPlacementPreview();
      this.placementPreview = {
        type: data.type,
        visual: this.createPlacementPreviewVisual(data.type, data)
      };
    }

    this.syncPlacementPreview(data.type, data);
  }

  createPlacementPreviewVisual(type, data) {
    const colors = COLORS[type];
    const size = this.objectSize(type, data);
    const center = this.objectCenter(type, data);
    let visual;
    if (type === "coin") {
      visual = this.add.circle(center.x, center.y, size.width / 2, colors.fill, 0.38);
    } else if (type === "hazard") {
      visual = this.add.triangle(center.x, center.y, 0, size.height, size.width / 2, 0, size.width, size.height, colors.fill, 0.38);
    } else if (type === "enemy") {
      visual = this.add.rectangle(center.x, center.y, size.width, size.height, colors.fill, 0.38);
    } else if (type === "playerSpawn") {
      visual = this.add.rectangle(center.x, center.y, size.width, size.height, colors.fill, 0.38);
    } else {
      visual = this.add.rectangle(center.x, center.y, size.width, size.height, colors.fill, 0.32);
    }
    this.applyObjectStroke({ type, visual }, colors.stroke, 0.9);

    return visual.setDepth(90);
  }

  syncPlacementPreview(type, data) {
    const preview = this.placementPreview?.visual;
    if (!preview) return;
    const size = this.objectSize(type, data);
    const center = this.objectCenter(type, data);
    preview.setPosition(center.x, center.y);
    preview.setAngle(Number(data.rotation) || 0);
    if (preview.setSize) {
      preview.setSize(size.width, size.height);
      preview.setDisplaySize(size.width, size.height);
    }
  }

  destroyPlacementPreview() {
    this.placementPreview?.visual.destroy();
    this.placementPreview = null;
  }

  redrawWorldChrome() {
    this.worldChrome?.removeAll(true);

    const width = this.worldWidth();
    const height = this.worldHeight();
    const groundY = this.groundY();

    const graphics = this.add.graphics().setDepth(-20);
    graphics.fillStyle(0x000000, 1);
    graphics.fillRect(0, -DEAD_CANVAS_TOP, width + DEAD_CANVAS_RIGHT, height + DEAD_CANVAS_TOP + DEAD_CANVAS_BOTTOM);

    graphics.fillStyle(0x000000, 1);
    graphics.fillRect(0, -DEAD_CANVAS_TOP, width, DEAD_CANVAS_TOP);
    graphics.fillRect(width, -DEAD_CANVAS_TOP, DEAD_CANVAS_RIGHT, height + DEAD_CANVAS_TOP + DEAD_CANVAS_BOTTOM);
    graphics.fillRect(0, height, width + DEAD_CANVAS_RIGHT, DEAD_CANVAS_BOTTOM);
    this.drawDeadCanvasDots(graphics, 0, -DEAD_CANVAS_TOP, width + DEAD_CANVAS_RIGHT, height + DEAD_CANVAS_TOP + DEAD_CANVAS_BOTTOM, width, height);

    graphics.fillStyle(0x07100f, 1);
    graphics.fillRect(0, 0, width, height);

    this.drawWorldGrid(graphics, width, height);

    graphics.fillStyle(0x17231d, 0.9);
    graphics.fillRect(0, groundY - GROUND_HEIGHT / 2, width, GROUND_HEIGHT);
    graphics.lineStyle(4, 0xf4e786, 1);
    graphics.strokeLineShape(new Phaser.Geom.Line(0, this.groundTop(), width, this.groundTop()));
    graphics.lineStyle(3, 0xb9a44c, 1);
    graphics.strokeRect(0, groundY - GROUND_HEIGHT / 2, width, GROUND_HEIGHT);

    graphics.lineStyle(5, 0xff6b5e, 1);
    graphics.strokeLineShape(new Phaser.Geom.Line(0, 0, width, 0));
    graphics.lineStyle(3, 0xd65f4f, 0.9);
    graphics.strokeLineShape(new Phaser.Geom.Line(width, 0, width, height));
    graphics.lineStyle(2, 0xd65f4f, 0.28);
    graphics.strokeRect(0, -DEAD_CANVAS_TOP, width + DEAD_CANVAS_RIGHT, height + DEAD_CANVAS_TOP + DEAD_CANVAS_BOTTOM);
    this.worldChrome.add(graphics);

    const groundLabel = this.add.text(14, this.groundTop() - 22, "GROUND", this.smallStyle("#f4e786")).setDepth(-19);
    this.worldChrome.add(groundLabel);

    this.cameras.main.setBounds(0, -DEAD_CANVAS_TOP, width + DEAD_CANVAS_RIGHT, height + DEAD_CANVAS_TOP + DEAD_CANVAS_BOTTOM);
  }

  drawWorldGrid(graphics, width, height) {
    const size = this.gridSize || DEFAULT_GRID_SIZE;
    const majorEvery = size * 4;
    graphics.lineStyle(1, 0x2f4b3e, 0.32);
    for (let x = 0; x <= width; x += size) {
      if (x % majorEvery === 0) continue;
      graphics.strokeLineShape(new Phaser.Geom.Line(x, 0, x, height));
    }
    for (let y = 0; y <= height; y += size) {
      if (y % majorEvery === 0) continue;
      graphics.strokeLineShape(new Phaser.Geom.Line(0, y, width, y));
    }

    graphics.lineStyle(1, 0x6d8e78, 0.56);
    for (let x = 0; x <= width; x += majorEvery) {
      graphics.strokeLineShape(new Phaser.Geom.Line(x, 0, x, height));
    }
    for (let y = 0; y <= height; y += majorEvery) {
      graphics.strokeLineShape(new Phaser.Geom.Line(0, y, width, y));
    }
  }

  drawDeadCanvasDots(graphics, x, y, width, height, playableWidth, playableHeight) {
    if (width <= 0 || height <= 0) return;
    const spacing = 24;
    graphics.fillStyle(0xff3b30, 1);
    for (let dotY = y + spacing / 2; dotY < y + height; dotY += spacing) {
      for (let dotX = x + spacing / 2; dotX < x + width; dotX += spacing) {
        if (dotX >= 0 && dotX <= playableWidth && dotY >= 0 && dotY <= playableHeight) {
          continue;
        }
        graphics.fillRect(Math.round(dotX) - 1, Math.round(dotY) - 1, 3, 3);
      }
    }
  }

  objectBounds(type, data) {
    const size = this.objectSize(type, data);
    return {
      left: data.x,
      right: data.x + size.width,
      top: data.y,
      bottom: data.y + size.height
    };
  }

  unionObjectBounds(objects) {
    return objects.reduce((bounds, obj) => {
      const next = this.objectBounds(obj.type, obj.data);
      if (!bounds) return { ...next };
      return {
        left: Math.min(bounds.left, next.left),
        right: Math.max(bounds.right, next.right),
        top: Math.min(bounds.top, next.top),
        bottom: Math.max(bounds.bottom, next.bottom)
      };
    }, null);
  }

  rotatedObjectPoints(obj) {
    if (!obj) return [];
    const size = this.objectSize(obj.type, obj.data);
    const center = this.objectCenter(obj.type, obj.data);
    const angle = Phaser.Math.DegToRad(Number(obj.data.rotation) || 0);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const points = [
      { x: -size.width / 2, y: -size.height / 2 },
      { x: size.width / 2, y: -size.height / 2 },
      { x: size.width / 2, y: size.height / 2 },
      { x: -size.width / 2, y: size.height / 2 }
    ];

    return points.map((point) => ({
      x: center.x + point.x * cos - point.y * sin,
      y: center.y + point.x * sin + point.y * cos
    }));
  }

  rotatedObjectBounds(obj) {
    const points = this.rotatedObjectPoints(obj);
    if (!points.length) return null;
    return {
      left: Math.min(...points.map((point) => point.x)),
      right: Math.max(...points.map((point) => point.x)),
      top: Math.min(...points.map((point) => point.y)),
      bottom: Math.max(...points.map((point) => point.y))
    };
  }

  strokePointLoop(graphics, points) {
    if (points.length < 2) return;
    points.forEach((point, index) => {
      const next = points[(index + 1) % points.length];
      graphics.strokeLineShape(new Phaser.Geom.Line(point.x, point.y, next.x, next.y));
    });
  }

  rotatedResizeHandles(obj) {
    const [nw, ne, se, sw] = this.rotatedObjectPoints(obj);
    if (!nw || !ne || !se || !sw) return [];
    const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    return [
      { id: "nw", cursor: "nwse-resize", ...nw },
      { id: "n", cursor: "ns-resize", ...midpoint(nw, ne) },
      { id: "ne", cursor: "nesw-resize", ...ne },
      { id: "e", cursor: "ew-resize", ...midpoint(ne, se) },
      { id: "se", cursor: "nwse-resize", ...se },
      { id: "s", cursor: "ns-resize", ...midpoint(sw, se) },
      { id: "sw", cursor: "nesw-resize", ...sw },
      { id: "w", cursor: "ew-resize", ...midpoint(nw, sw) }
    ];
  }

  rotationHandleForObject(obj, zoom = 1) {
    const [nw, ne] = this.rotatedObjectPoints(obj);
    const center = this.objectCenter(obj.type, obj.data);
    const anchor = {
      x: (nw.x + ne.x) / 2,
      y: (nw.y + ne.y) / 2
    };
    const length = Math.max(26 / zoom, 34 / zoom);
    const dx = anchor.x - center.x;
    const dy = anchor.y - center.y;
    const distance = Math.hypot(dx, dy) || 1;
    return {
      id: "rotate",
      anchor,
      x: anchor.x + (dx / distance) * length,
      y: anchor.y + (dy / distance) * length
    };
  }

  expandWorldToIncludeObjects(objects) {
    const bounds = this.unionObjectBounds(objects);
    if (!bounds) return false;

    let expanded = false;
    if (bounds.right > this.worldWidth()) {
      this.draft.worldWidth = Math.max(
        this.worldWidth(),
        Math.ceil((bounds.right + WORLD_EXPAND_PADDING) / 10) * 10
      );
      expanded = true;
    }

    if (bounds.top < 0) {
      const shiftY = Math.ceil((-bounds.top + WORLD_EXPAND_PADDING) / 10) * 10;
      this.shiftAllObjectsY(shiftY);
      this.draft.worldHeight = this.worldHeight() + shiftY;
      this.cameras.main.scrollY += shiftY;
      expanded = true;
    }

    if (expanded) {
      this.draft.floorY = this.groundTop();
      this.updateCanvasSizeInputs();
      this.objects.forEach((obj) => this.syncVisual(obj));
    }
    return expanded;
  }

  shiftAllObjectsY(shiftY) {
    this.allObjectData().forEach(({ type, data }) => {
      data.y += shiftY;
      if (type === "merchant" && typeof data.npcY === "number") {
        data.npcY += shiftY;
      }
    });
  }

  allObjectData() {
    return [
      ...this.draft.platforms.map((data) => ({ type: "platform", data })),
      ...this.draft.coins.map((data) => ({ type: "coin", data })),
      ...this.draft.hazards.map((data) => ({ type: "hazard", data })),
      ...this.draft.enemies.map((data) => ({ type: "enemy", data })),
      ...this.draft.challenges.map((data) => ({ type: "challenge", data })),
      ...(this.draft.merchant ? [{ type: "merchant", data: this.draft.merchant }] : []),
      ...(this.draft.exitGate ? [{ type: "exitGate", data: this.draft.exitGate }] : []),
      ...(this.draft.playerSpawn ? [{ type: "playerSpawn", data: this.draft.playerSpawn }] : []),
      ...this.draft.signs.map((data) => ({ type: "sign", data }))
    ];
  }

  clampAllObjectsToWorld() {
    this.allObjectData().forEach(({ type, data }) => this.clampDataToWorld(type, data));
  }

  findObjectAt(x, y) {
    for (let i = this.objects.length - 1; i >= 0; i -= 1) {
      const obj = this.objects[i];
      if (this.containsObjectPoint(obj, x, y)) {
        return obj;
      }
    }
    return null;
  }

  containsObjectPoint(obj, x, y) {
    if (!obj) return false;
    if (obj.type === "coin") {
      const center = this.objectCenter(obj.type, obj.data);
      const size = this.objectSize(obj.type, obj.data);
      return Phaser.Math.Distance.Between(center.x, center.y, x, y) <= size.width / 2;
    }

    const points = obj.type === "hazard"
      ? this.rotatedHazardPoints(obj)
      : this.rotatedObjectPoints(obj);
    return Phaser.Geom.Polygon.Contains(new Phaser.Geom.Polygon(points), x, y);
  }

  rotatedHazardPoints(obj) {
    const size = this.objectSize(obj.type, obj.data);
    const center = this.objectCenter(obj.type, obj.data);
    const angle = Phaser.Math.DegToRad(Number(obj.data.rotation) || 0);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const localPoints = [
      { x: -size.width / 2, y: size.height / 2 },
      { x: 0, y: -size.height / 2 },
      { x: size.width / 2, y: size.height / 2 }
    ];

    return localPoints.map((point) => ({
      x: center.x + point.x * cos - point.y * sin,
      y: center.y + point.x * sin + point.y * cos
    }));
  }

  startAreaSelection(x, y) {
    this.clearSelection();
    const visual = this.add.rectangle(x, y, 1, 1, 0x6ad8b4, 0.12)
      .setStrokeStyle(2, 0x8ee0c6, 0.95)
      .setDepth(100);
    this.areaSelection = { startX: x, startY: y, x, y, visual };
  }

  updateAreaSelection(x, y) {
    if (!this.areaSelection) return;
    this.areaSelection.x = x;
    this.areaSelection.y = y;
    const bounds = this.areaSelectionBounds();
    this.areaSelection.visual.setPosition(bounds.centerX, bounds.centerY);
    this.areaSelection.visual.setSize(bounds.width, bounds.height);
    this.areaSelection.visual.setDisplaySize(bounds.width, bounds.height);
  }

  finishAreaSelection() {
    if (!this.areaSelection) return;
    const bounds = this.areaSelectionBounds();
    const selected = bounds.width < 10 && bounds.height < 10
      ? []
      : this.objects.filter((obj) => Phaser.Geom.Intersects.RectangleToRectangle(bounds, obj.visual.getBounds()));
    this.areaSelection.visual.destroy();
    this.areaSelection = null;
    if (selected.length > 0) {
      this.selectObjects(selected);
    } else {
      this.clearSelection();
      this.showMessage("Pick an item first");
    }
  }

  areaSelectionBounds() {
    const minX = Math.min(this.areaSelection.startX, this.areaSelection.x);
    const minY = Math.min(this.areaSelection.startY, this.areaSelection.y);
    const maxX = Math.max(this.areaSelection.startX, this.areaSelection.x);
    const maxY = Math.max(this.areaSelection.startY, this.areaSelection.y);
    return new Phaser.Geom.Rectangle(minX, minY, maxX - minX, maxY - minY);
  }

  clampedEditableSelectionDelta(items, dx, dy) {
    let minDx = -Infinity;
    let maxDx = Infinity;
    let minDy = -Infinity;
    let maxDy = Infinity;
    for (const { obj, startX, startY } of items) {
      const size = this.objectSize(obj.type, obj.data);
      minDx = Math.max(minDx, -startX);
      maxDx = Math.min(maxDx, this.editableMaxX() - size.width - startX);
      minDy = Math.max(minDy, this.editableMinY() - startY);
      maxDy = Math.min(maxDy, this.groundTop() - size.height - startY);
    }
    return {
      dx: Phaser.Math.Clamp(dx, minDx, maxDx),
      dy: Phaser.Math.Clamp(dy, minDy, maxDy)
    };
  }

  handleKeyboardNudge(time = 0) {
    if (!this.selected || this.selection.length === 0) return false;
    if (this.keys.ctrl.isDown) return false;

    let dx = 0;
    let dy = 0;
    if (this.keys.left.isDown) dx -= 1;
    if (this.keys.right.isDown) dx += 1;
    if (this.keys.up.isDown) dy -= 1;
    if (this.keys.down.isDown) dy += 1;
    if (dx === 0 && dy === 0) {
      this.nudgeRepeat.signature = "";
      this.nudgeRepeat.startedAt = 0;
      this.nudgeRepeat.lastAt = 0;
      this.nudgeHistoryActive = false;
      return false;
    }

    const signature = `${dx}:${dy}:${this.keys.shift.isDown ? "grid" : "px"}`;
    const justPressed =
      Phaser.Input.Keyboard.JustDown(this.keys.left) ||
      Phaser.Input.Keyboard.JustDown(this.keys.right) ||
      Phaser.Input.Keyboard.JustDown(this.keys.up) ||
      Phaser.Input.Keyboard.JustDown(this.keys.down) ||
      signature !== this.nudgeRepeat.signature;
    if (justPressed) {
      if (!this.nudgeHistoryActive) {
        this.recordHistory();
        this.nudgeHistoryActive = true;
      }
      this.moveSelectionBy(dx * (this.keys.shift.isDown ? (this.gridSize || DEFAULT_GRID_SIZE) : 1), dy * (this.keys.shift.isDown ? (this.gridSize || DEFAULT_GRID_SIZE) : 1));
      this.nudgeRepeat.signature = signature;
      this.nudgeRepeat.startedAt = time;
      this.nudgeRepeat.lastAt = time;
      return true;
    }

    const initialDelayElapsed = time - this.nudgeRepeat.startedAt >= NUDGE_INITIAL_REPEAT_DELAY_MS;
    const shouldRepeat = initialDelayElapsed && time - this.nudgeRepeat.lastAt >= NUDGE_REPEAT_MS;
    if (!justPressed && !shouldRepeat) return true;

    const amount = this.keys.shift.isDown ? (this.gridSize || DEFAULT_GRID_SIZE) : 1;
    this.moveSelectionBy(dx * amount, dy * amount);
    this.nudgeRepeat.lastAt = time;
    return true;
  }

  moveSelectionBy(dx, dy) {
    const items = this.selection.map((obj) => ({ obj, startX: obj.data.x, startY: obj.data.y }));
    const clampedDelta = this.clampedEditableSelectionDelta(items, dx, dy);
    if (clampedDelta.dx === 0 && clampedDelta.dy === 0) return;

    for (const item of items) {
      item.obj.data.x = item.startX + clampedDelta.dx;
      item.obj.data.y = item.startY + clampedDelta.dy;
      this.clampDataToEditableArea(item.obj.type, item.obj.data);
      this.syncVisual(item.obj);
    }

    this.expandWorldToIncludeObjects(this.selection);
    this.selection.forEach((obj) => {
      this.clampDataToWorld(obj.type, obj.data);
      this.syncVisual(obj);
    });
    this.redrawWorldChrome();
    this.resizeWorldViewport();
    this.updateSelectionOverlay();
    this.refreshInspectorValues();
    this.markDirty();
  }

  handleKeyboardRotate() {
    if (!this.selected || this.selection.length === 0 || this.keys.ctrl.isDown) return false;
    const direction =
      Phaser.Input.Keyboard.JustDown(this.keys.q) ? -1 :
      Phaser.Input.Keyboard.JustDown(this.keys.e) ? 1 :
      0;
    if (!direction) return false;

    this.recordHistory();
    this.rotateSelectionBy(direction);
    return true;
  }

  rotateSelectionBy(delta) {
    this.selection.forEach((obj) => {
      obj.data.rotation = this.normalizeRotation((Number(obj.data.rotation) || 0) + delta);
      this.syncVisual(obj);
    });
    this.updateSelectionOverlay();
    this.refreshInspectorValues();
    this.markDirty();
  }

  canResizeObject(obj) {
    return Boolean(obj) && !["coin", "hazard", "enemy", "playerSpawn"].includes(obj.type);
  }

  findTransformHandleAt(x, y) {
    if (!this.selectionOverlay?.handles?.length || this.selection.length !== 1) {
      return null;
    }

    return this.selectionOverlay.handles.find((handle) => {
      return Phaser.Geom.Rectangle.Contains(handle.hitArea, x, y);
    }) || null;
  }

  findResizeHandleAt(x, y) {
    const handle = this.findTransformHandleAt(x, y);
    return handle?.type === "rotate" ? null : handle;
  }

  updateResizeCursor(x, y) {
    const handle = this.findTransformHandleAt(x, y);
    this.input.setDefaultCursor(handle ? handle.cursor : "default");
  }

  startResize(handle, point, pointer) {
    const obj = this.selected;
    const bounds = this.objectBounds(obj.type, obj.data);
    const startPoint = this.snapPoint(point.x, point.y, pointer);
    this.resizing = {
      obj,
      handle: handle.id,
      startX: startPoint.x,
      startY: startPoint.y,
      startBounds: bounds,
      historyRecorded: false
    };
    this.input.setDefaultCursor(handle.cursor);
  }

  updateResize(point, pointer) {
    const { obj, handle, startBounds } = this.resizing;
    const world = this.snapPoint(point.x, point.y, pointer);
    const dx = world.x - this.resizing.startX;
    const dy = world.y - this.resizing.startY;
    let left = startBounds.left;
    let right = startBounds.right;
    let top = startBounds.top;
    let bottom = startBounds.bottom;

    if (handle.includes("w")) left += dx;
    if (handle.includes("e")) right += dx;
    if (handle.includes("n")) top += dy;
    if (handle.includes("s")) bottom += dy;

    if (right - left < MIN_RESIZE_SIZE) {
      if (handle.includes("w")) left = right - MIN_RESIZE_SIZE;
      else right = left + MIN_RESIZE_SIZE;
    }
    if (bottom - top < MIN_RESIZE_SIZE) {
      if (handle.includes("n")) top = bottom - MIN_RESIZE_SIZE;
      else bottom = top + MIN_RESIZE_SIZE;
    }

    const nextData = {
      ...obj.data,
      width: right - left,
      height: bottom - top,
      x: left,
      y: top
    };
    this.clampDataToEditableArea(obj.type, nextData);
    const changed =
      nextData.x !== startBounds.left ||
      nextData.y !== startBounds.top ||
      nextData.width !== startBounds.right - startBounds.left ||
      nextData.height !== startBounds.bottom - startBounds.top;
    if (!changed) return;
    if (!this.resizing.historyRecorded) {
      this.recordHistory();
      this.resizing.historyRecorded = true;
    }
    Object.assign(obj.data, nextData);
    this.syncVisual(obj);
    this.updateSelectionOverlay();
    this.refreshInspectorValues();
    this.markDirty();
  }

  startRotation(_handle, point) {
    const center = this.objectCenter(this.selected.type, this.selected.data);
    this.rotating = {
      objects: this.selection,
      center,
      startPointerAngle: Phaser.Math.RadToDeg(Math.atan2(point.y - center.y, point.x - center.x)),
      startRotations: this.selection.map((obj) => ({ obj, rotation: Number(obj.data.rotation) || 0 })),
      historyRecorded: false
    };
    this.input.setDefaultCursor("grabbing");
  }

  updateRotation(point, pointer) {
    const currentAngle = Phaser.Math.RadToDeg(Math.atan2(point.y - this.rotating.center.y, point.x - this.rotating.center.x));
    const rawDelta = this.shortestAngleDelta(currentAngle, this.rotating.startPointerAngle);
    const delta = Math.round(rawDelta);
    if (delta === 0) return;
    if (!this.rotating.historyRecorded) {
      this.recordHistory();
      this.rotating.historyRecorded = true;
    }

    this.rotating.startRotations.forEach(({ obj, rotation }) => {
      obj.data.rotation = this.normalizeRotation(rotation + delta);
      this.syncVisual(obj);
    });
    this.updateSelectionOverlay();
    this.refreshInspectorValues();
    this.markDirty();
  }

  shortestAngleDelta(current, start) {
    return ((current - start + 540) % 360) - 180;
  }

  selectObject(obj) {
    this.selectObjects([obj], obj);
  }

  selectObjects(objects, primary = objects[0] || null) {
    this.selection = objects;
    this.selected = primary;
    this.activeTool = null;
    this.objects.forEach((item) => {
      const colors = COLORS[item.type];
      const selected = objects.includes(item);
      this.applyObjectStroke(item, selected ? 0xf4e786 : colors.stroke);
      item.visual.setAlpha(1);
    });
    this.updateSelectionOverlay();
    this.updateToolButtons();
    this.renderInspector();
  }

  updateSelectionOverlay() {
    if (!this.selectionOverlay) {
      this.selectionOverlay = {
        graphics: this.add.graphics().setDepth(120),
        label: this.add.text(0, 0, "", {
          ...this.smallStyle("#07100f"),
          backgroundColor: "#f4e786",
          padding: { x: 6, y: 3 }
        }).setDepth(121).setVisible(false)
      };
    }

    const { graphics, label } = this.selectionOverlay;
    graphics.clear();
    this.selectionOverlay.handles = [];
    if (!this.selection.length) {
      label.setVisible(false);
      return;
    }

    const bounds = this.selection.length === 1
      ? this.rotatedObjectBounds(this.selected)
      : this.unionObjectBounds(this.selection);
    if (!bounds) {
      label.setVisible(false);
      return;
    }

    const left = Math.round(bounds.left);
    const top = Math.round(bounds.top);
    const width = Math.round(bounds.right - bounds.left);
    const height = Math.round(bounds.bottom - bounds.top);
    const zoom = this.cameras.main.zoom;

    graphics.lineStyle(Math.max(1 / zoom, 2 / zoom), 0xf4e786, 1);
    if (this.selection.length === 1) {
      const outline = this.rotatedObjectPoints(this.selected);
      this.strokePointLoop(graphics, outline);
    } else {
      graphics.strokeRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
    }

    if (this.selection.length === 1 && this.canResizeObject(this.selected)) {
      const handleSize = Math.max(6 / zoom, 8 / zoom);
      const handleOffset = handleSize / 2;
      const hitSize = Math.max(14 / zoom, handleSize);
      const handlePoints = this.rotatedResizeHandles(this.selected);

      graphics.lineStyle(Math.max(1 / zoom, 1 / zoom), 0x07100f, 1);
      for (const handle of handlePoints) {
        graphics.fillStyle(0xf4e786, 1);
        graphics.fillRect(handle.x - handleOffset, handle.y - handleOffset, handleSize, handleSize);
        graphics.strokeRect(handle.x - handleOffset, handle.y - handleOffset, handleSize, handleSize);
        this.selectionOverlay.handles.push({
          ...handle,
          hitArea: new Phaser.Geom.Rectangle(handle.x - hitSize / 2, handle.y - hitSize / 2, hitSize, hitSize)
        });
      }
    }

    if (this.selection.length === 1) {
      const rotateHandle = this.rotationHandleForObject(this.selected, zoom);
      const handleRadius = Math.max(5 / zoom, 7 / zoom);
      const hitSize = Math.max(18 / zoom, handleRadius * 2);
      graphics.lineStyle(Math.max(1 / zoom, 1.5 / zoom), 0xf4e786, 0.9);
      graphics.strokeLineShape(new Phaser.Geom.Line(rotateHandle.anchor.x, rotateHandle.anchor.y, rotateHandle.x, rotateHandle.y));
      graphics.fillStyle(0x07100f, 1);
      graphics.fillCircle(rotateHandle.x, rotateHandle.y, handleRadius);
      graphics.lineStyle(Math.max(1 / zoom, 2 / zoom), 0xf4e786, 1);
      graphics.strokeCircle(rotateHandle.x, rotateHandle.y, handleRadius);
      this.selectionOverlay.handles.push({
        ...rotateHandle,
        type: "rotate",
        cursor: "grab",
        hitArea: new Phaser.Geom.Rectangle(rotateHandle.x - hitSize / 2, rotateHandle.y - hitSize / 2, hitSize, hitSize)
      });
    }

    label.setText(`${width} x ${height}`);
    label.setScale(1 / zoom);
    label.setPosition(left, top - 24 / zoom);
    label.setVisible(true);
  }

  renderInspector() {
    if (!this.inspectorEl) return;
    if (!this.selected) {
      this.inspectorEl.innerHTML = `
        <div class="rounded-sm border border-[#385346] bg-[#0d1a16] p-3 text-sm leading-6 text-[#b8c7b5]">
          No object selected.<br><br>
          Drag an empty area to select multiple items, or pick an item and drag it. Escape clears selection.
        </div>
      `;
      return;
    }

    if (this.selection.length > 1) {
      const grouped = this.selection.every((obj) => obj.data.groupId && obj.data.groupId === this.selection[0].data.groupId);
      this.inspectorEl.innerHTML = `
        <div class="flex items-center justify-between gap-3">
          <div class="text-lg font-bold uppercase tracking-wide text-[#f4e786]">${this.selection.length} SELECTED</div>
          <button data-action="delete" aria-label="Delete selected" class="grid h-9 w-9 place-items-center rounded-sm border border-[#7b332d] bg-[#d65f4f] text-[#07100f] transition-colors hover:border-[#f07b6e] hover:bg-[#f07b6e]">${this.lucideSvg(Trash2, 18)}</button>
        </div>
        <div class="mt-5 grid grid-cols-1 gap-2">
          <button data-action="duplicate" class="rounded-sm border border-[#b9a44c] bg-[#e7d66b] px-2 py-2 text-sm font-bold text-[#07100f] transition-colors hover:border-[#f4e786] hover:bg-[#f4e786]">DUPLICATE</button>
          <button data-action="${grouped ? "ungroup" : "group"}" class="flex items-center justify-center gap-2 rounded-sm border border-[#6ad8b4] bg-[#3fa68f] px-2 py-2 text-sm font-bold text-[#07100f] transition-colors hover:border-[#8ee0c6] hover:bg-[#62cba8]">
            ${this.lucideSvg(grouped ? Ungroup : Group, 17)}
            ${grouped ? "UNGROUP" : "GROUP"}
          </button>
        </div>
      `;
      this.inspectorEl.querySelector("[data-action='duplicate']")?.addEventListener("click", () => this.duplicateSelected());
      this.inspectorEl.querySelector("[data-action='delete']")?.addEventListener("click", () => this.deleteSelected());
      this.inspectorEl.querySelector("[data-action='group']")?.addEventListener("click", () => this.groupSelected());
      this.inspectorEl.querySelector("[data-action='ungroup']")?.addEventListener("click", () => this.ungroupSelected());
      return;
    }

    const fields = FIELD_CONFIG[this.selected.type] || [];
    const title = TOOL_DEFS.find((tool) => tool.id === this.selected.type)?.label || this.selected.type;
    this.inspectorEl.innerHTML = `
      <div class="flex items-center justify-between gap-3">
        <div class="text-lg font-bold uppercase tracking-wide text-[#f4e786]">${title}</div>
        <button data-action="delete" aria-label="Delete selected" class="grid h-9 w-9 place-items-center rounded-sm border border-[#7b332d] bg-[#d65f4f] text-[#07100f] transition-colors hover:border-[#f07b6e] hover:bg-[#f07b6e]">${this.lucideSvg(Trash2, 18)}</button>
      </div>
      <div class="mt-4 flex flex-col gap-3">
        ${fields.map(([key, type]) => this.fieldMarkup(key, type, this.selected.data[key])).join("")}
      </div>
      <div class="mt-5 grid grid-cols-1 gap-2">
        ${this.canDuplicateSelected() ? `<button data-action="duplicate" class="rounded-sm border border-[#b9a44c] bg-[#e7d66b] px-2 py-2 text-sm font-bold text-[#07100f] transition-colors hover:border-[#f4e786] hover:bg-[#f4e786]">DUPLICATE</button>` : ""}
      </div>
    `;

    this.inspectorEl.querySelectorAll("[data-field]").forEach((input) => {
      input.addEventListener("focus", () => this.beginDomEditHistory());
      input.addEventListener("blur", () => this.endDomEditHistory());
      input.addEventListener("input", () => this.updateSelectedField(input.dataset.field, input.value, input.dataset.kind));
    });
    this.inspectorEl.querySelector("[data-action='duplicate']")?.addEventListener("click", () => this.duplicateSelected());
    this.inspectorEl.querySelector("[data-action='delete']")?.addEventListener("click", () => this.deleteSelected());
  }

  fieldMarkup(key, type, value) {
    const label = key.replace(/([A-Z])/g, " $1").toUpperCase();
    if (type === "select") {
      return `
        <label class="flex flex-col gap-1 text-xs font-bold text-[#8fa89d]">
          ${label}
          <select data-field="${key}" data-kind="${type}" class="rounded-sm border border-[#385346] bg-[#102019] px-2 py-2 text-sm text-[#edf8ed] outline-none transition focus:border-[#f4e786]">
            ${["easy", "medium", "hard"].map((item) => `<option value="${item}" ${value === item ? "selected" : ""}>${item}</option>`).join("")}
          </select>
        </label>
      `;
    }
    return `
      <label class="flex flex-col gap-1 text-xs font-bold text-[#8fa89d]">
        ${label}
        <input data-field="${key}" data-kind="${type}" type="${type === "number" ? "number" : "text"}" value="${value ?? ""}" class="rounded-sm border border-[#385346] bg-[#102019] px-2 py-2 text-sm text-[#edf8ed] outline-none transition focus:border-[#f4e786]" />
      </label>
    `;
  }

  updateSelectedField(key, value, type) {
    if (!this.selected) return;
    this.beginDomEditHistory();
    const nextValue = type === "number" ? Number(value) || 0 : value;
    this.selected.data[key] = key === "rotation" ? this.normalizeRotation(nextValue) : nextValue;
    this.clampDataToEditableArea(this.selected.type, this.selected.data);
    this.syncVisual(this.selected);
    this.updateSelectionOverlay();
    this.markDirty();
  }

  normalizeRotation(value) {
    return Math.round((((Number(value) || 0) % 360) + 360) % 360);
  }

  refreshInspectorValues() {
    if (!this.selected || !this.inspectorEl) return;
    this.inspectorEl.querySelectorAll("[data-field]").forEach((input) => {
      const value = this.selected.data[input.dataset.field];
      if (document.activeElement !== input) {
        input.value = value ?? "";
      }
    });
  }

  canDuplicateSelected() {
    return this.selection.length > 0 && this.selection.every((obj) => !["merchant", "exitGate", "playerSpawn"].includes(obj.type));
  }

  duplicateSelected() {
    if (!this.canDuplicateSelected()) return;
    this.recordHistory();
    const sourceGroupId = this.selection[0]?.data.groupId;
    const shouldDuplicateAsGroup = this.selection.length > 1 && sourceGroupId && this.selection.every((obj) => obj.data.groupId === sourceGroupId);
    const nextGroupId = shouldDuplicateAsGroup ? `group-${Date.now().toString(36)}` : null;
    const copied = this.selection.map((obj) => {
      const copy = { type: obj.type, ...structuredClone(obj.data), x: obj.data.x + 40, y: obj.data.y - 20 };
      if (nextGroupId) {
        copy.groupId = nextGroupId;
      } else {
        delete copy.groupId;
      }
      this.clampDataToWorld(copy.type, copy);
      return this.addData(copy);
    });
    this.rebuildObjects();
    this.selectObjects(this.objects.filter((obj) => copied.includes(obj.data)));
    this.markDirty();
  }

  deleteSelected() {
    if (!this.selected) return;
    this.recordHistory();
    for (const { type, data } of this.selection) {
      if (type === "merchant") this.draft.merchant = null;
      else if (type === "exitGate") this.draft.exitGate = null;
      else if (type === "playerSpawn") this.draft.playerSpawn = null;
      else this.listForType(type).splice(this.listForType(type).indexOf(data), 1);
    }
    this.selected = null;
    this.selection = [];
    this.rebuildObjects();
    this.renderInspector();
    this.updateToolButtons();
    this.markDirty();
  }

  groupSelected() {
    if (this.selection.length < 2) return;
    this.recordHistory();
    const groupId = `group-${Date.now().toString(36)}`;
    this.selection.forEach((obj) => {
      obj.data.groupId = groupId;
    });
    this.renderInspector();
    this.markDirty();
  }

  ungroupSelected() {
    if (this.selection.length < 1) return;
    this.recordHistory();
    this.selection.forEach((obj) => {
      delete obj.data.groupId;
    });
    this.renderInspector();
    this.markDirty();
  }

  listForType(type) {
    return {
      platform: this.draft.platforms,
      coin: this.draft.coins,
      hazard: this.draft.hazards,
      enemy: this.draft.enemies,
      challenge: this.draft.challenges,
      sign: this.draft.signs
    }[type];
  }

  async saveLevel() {
    const name = this.draft.name.trim();
    if (!name) {
      this.showMessage("Level name is required.");
      return;
    }
    if (!this.draft.playerSpawn || !this.draft.exitGate) {
      this.showMessage("You must have a Spawn and Exit point before saving.");
      return;
    }
    if (!window.edgecase?.saveLevel) {
      this.showMessage("Save is only available in the Electron dev app.");
      return;
    }

    this.draft.name = name;
    try {
      const latestLevels = window.edgecase.loadLevels ? await window.edgecase.loadLevels() : this.getEditableLevels();
      if (Array.isArray(latestLevels)) {
        this.registry.set("devSavedLevels", latestLevels);
        this.registry.set("devSavedLevelsLoaded", Boolean(window.edgecase.loadLevels));
      }
      const saved = await window.edgecase.saveLevel(this.toLevelData());
      this.draft.id = saved.id;
      const levels = window.edgecase.loadLevels ? await window.edgecase.loadLevels() : this.upsertDevSavedLevel(this.toLevelData());
      this.registry.set("devSavedLevels", Array.isArray(levels) ? levels : this.upsertDevSavedLevel(this.toLevelData()));
      this.registry.set("devSavedLevelsLoaded", Array.isArray(levels));
      this.registry.set("selectedLevelId", saved.id);
      this.savedSnapshot = this.serializeDraft();
      this.updateSaveStatus();
      this.showMessage("Saved permanently.");
    } catch (error) {
      this.showMessage(error?.message || "Could not save level.");
    }
  }

  playtest() {
    if (!this.draft.playerSpawn || !this.draft.exitGate) {
      this.showMessage("Add a Spawn and Exit before playtesting.");
      return;
    }
    this.registry.set("editorDraft", structuredClone(this.draft));
    this.registry.set("draftLevel", this.toLevelData());
    this.scene.start("GameScene");
  }

  exitEditor() {
    if (!this.isSaved() && !window.confirm("Exit Level Maker? Unsaved changes will be deleted.")) {
      return;
    }
    this.registry.remove("editorDraft");
    this.scene.start("MenuScene");
  }

  async copyLevelData(message) {
    const text = JSON.stringify(this.toLevelData(), null, 2);
    try {
      await navigator.clipboard.writeText(text);
      this.showMessage(message);
    } catch {
      window.prompt("Copy level data", text);
      this.showMessage("Copy prompt opened");
    }
  }

  toLevelData() {
    const level = structuredClone(this.draft);
    const width = this.worldWidth();
    const height = this.worldHeight();
    level.worldWidth = width;
    level.worldHeight = height;
    level.floorY = this.groundTop();
    level.platforms = [
      { x: 0, y: this.groundTop(), width, height: GROUND_HEIGHT },
      ...(level.platforms || [])
    ];
    return level;
  }

  upsertDevSavedLevel(level) {
    const levels = this.registry.get("devSavedLevels") || [];
    const nextLevel = structuredClone(level);
    const index = levels.findIndex((item) => item.id === nextLevel.id);
    if (index >= 0) {
      levels[index] = nextLevel;
      return levels;
    }
    return [...levels, nextLevel];
  }

  getEditableLevels() {
    const devSavedLevels = this.registry.get("devSavedLevels") || [];
    if (this.registry.get("devSavedLevelsLoaded")) {
      return devSavedLevels;
    }

    const levelsById = new Map(LEVELS.map((level) => [level.id, level]));
    for (const level of devSavedLevels) {
      levelsById.set(level.id, level);
    }
    return Array.from(levelsById.values());
  }

  createBlankLevel() {
    return {
      id: "new-level",
      name: "New Level",
      worldWidth: DEFAULT_WORLD_WIDTH,
      worldHeight: DEFAULT_WORLD_HEIGHT,
      floorY: DEFAULT_WORLD_HEIGHT - GROUND_HEIGHT - GROUND_BOTTOM_MARGIN,
      playerSpawn: null,
      platforms: [],
      coins: [],
      hazards: [],
      enemies: [],
      challenges: [],
      merchant: null,
      exitGate: null,
      signs: []
    };
  }

  stripFixedGround(level) {
    const width = level.worldWidth || DEFAULT_WORLD_WIDTH;
    const height = level.worldHeight || DEFAULT_WORLD_HEIGHT;
    const groundTop = height - GROUND_HEIGHT - GROUND_BOTTOM_MARGIN;
    const legacyGroundY = height - GROUND_HEIGHT / 2 - GROUND_BOTTOM_MARGIN;
    return {
      ...level,
      platforms: (level.platforms || []).filter((platform) => {
        return !(
          ((platform.x === 0 && platform.y === groundTop) ||
            (platform.x === width / 2 && platform.y === legacyGroundY)) &&
          platform.width === width &&
          platform.height === GROUND_HEIGHT
        );
      })
    };
  }

  markDirty() {
    this.updateSaveStatus();
  }

  recordHistory() {
    if (this.restoringHistory) return;
    const snapshot = this.serializeHistoryDraft();
    if (this.undoStack[this.undoStack.length - 1] === snapshot) return;
    this.undoStack.push(snapshot);
    if (this.undoStack.length > HISTORY_LIMIT) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this.updateHistoryControls();
  }

  discardUnchangedHistoryEntry() {
    if (this.undoStack[this.undoStack.length - 1] === this.serializeHistoryDraft()) {
      this.undoStack.pop();
      this.updateHistoryControls();
    }
  }

  beginDomEditHistory() {
    if (this.domEditHistoryActive) return;
    this.recordHistory();
    this.domEditHistoryActive = true;
  }

  endDomEditHistory() {
    this.discardUnchangedHistoryEntry();
    this.domEditHistoryActive = false;
  }

  undo({ requireCanvasFocus = true } = {}) {
    if (requireCanvasFocus && !this.canUseHistoryShortcut()) return;
    if (this.undoStack.length === 0) {
      this.showMessage("Nothing to undo");
      return;
    }
    this.endDomEditHistory();
    this.cancelPointerInteraction();
    this.cancelPlacement();
    this.redoStack.push(this.serializeHistoryDraft());
    const snapshot = this.undoStack.pop();
    this.restoreHistorySnapshot(snapshot);
    this.showMessage("Undid change");
    this.updateHistoryControls();
  }

  redo({ requireCanvasFocus = true } = {}) {
    if (requireCanvasFocus && !this.canUseHistoryShortcut()) return;
    if (this.redoStack.length === 0) {
      this.showMessage("Nothing to redo");
      return;
    }
    this.endDomEditHistory();
    this.cancelPointerInteraction();
    this.cancelPlacement();
    this.undoStack.push(this.serializeHistoryDraft());
    if (this.undoStack.length > HISTORY_LIMIT) {
      this.undoStack.shift();
    }
    const snapshot = this.redoStack.pop();
    this.restoreHistorySnapshot(snapshot);
    this.showMessage("Redid change");
    this.updateHistoryControls();
  }

  restoreHistorySnapshot(snapshot) {
    const currentName = this.draft.name;
    this.restoringHistory = true;
    try {
      this.draft = this.normalizeDraftDimensions(this.stripFixedGround(JSON.parse(snapshot)));
      this.draft.name = currentName;
      this.updateNextChallengeCounter();
      this.rebuildObjects();
      this.redrawWorldChrome();
      this.resizeWorldViewport();
      this.updateCanvasSizeInputs();
      if (this.nameInputEl) {
        this.nameInputEl.value = this.draft.name;
      }
      this.renderInspector();
      this.updateToolButtons();
      this.updatePlacementPreview(this.input.activePointer);
      this.updateSaveStatus();
      this.updateHistoryControls();
    } finally {
      this.restoringHistory = false;
    }
  }

  updateHistoryControls() {
    if (this.undoButtonEl) {
      this.undoButtonEl.disabled = this.undoStack.length === 0;
    }
    if (this.redoButtonEl) {
      this.redoButtonEl.disabled = this.redoStack.length === 0;
    }
  }

  updateNextChallengeCounter() {
    this.nextChallenge = (this.draft.challenges || []).length + 1;
  }

  canUseHistoryShortcut() {
    return this.canvasFocused && !this.hudRoot?.contains(document.activeElement);
  }

  isSaved() {
    return this.savedSnapshot !== null && this.savedSnapshot === this.serializeDraft();
  }

  serializeDraft() {
    return JSON.stringify(this.draft);
  }

  serializeHistoryDraft() {
    const snapshot = structuredClone(this.draft);
    snapshot.name = "";
    return JSON.stringify(snapshot);
  }

  updateSaveStatus() {
    if (!this.statusEl) return;
    const saved = this.isSaved();
    this.statusEl.textContent = saved ? "SAVED" : "UNSAVED";
    this.statusEl.className = saved
      ? "mt-2 rounded-sm border border-[#3fa68f] bg-[#102019] px-3 py-2 text-xs font-bold text-[#8ee0c6]"
      : "mt-2 rounded-sm border border-[#7b332d] bg-[#1f1110] px-3 py-2 text-xs font-bold text-[#f07b6e]";
  }

  clearSelection() {
    this.selected = null;
    this.selection = [];
    this.clearObjectFocus();
    this.updateSelectionOverlay();
    this.renderInspector();
  }

  clearObjectFocus() {
    this.objects.forEach((item) => {
      const colors = COLORS[item.type];
      this.applyObjectStroke(item, colors.stroke);
      item.visual.setAlpha(1);
    });
  }

  setHoveredObject(obj) {
    if (this.hoveredObject === obj) return;
    if (this.hoveredObject && !this.selection.includes(this.hoveredObject)) {
      const colors = COLORS[this.hoveredObject.type];
      this.applyObjectStroke(this.hoveredObject, colors.stroke);
      this.hoveredObject.visual.setAlpha(1);
    }
    this.hoveredObject = obj;
    if (obj && !this.selection.includes(obj)) {
      this.applyObjectStroke(obj, 0x8ee0c6);
      obj.visual.setAlpha(0.86);
    }
  }

  toggleHud() {
    this.hudVisible = !this.hudVisible;
    this.hudRoot.classList.toggle("hidden", !this.hudVisible);
    this.updateDisplaySettingsControls();
    this.resizeWorldViewport();
  }

  resizeWorldViewport() {
    const x = this.hudVisible ? HUD_LEFT_WIDTH : 0;
    const gameWidth = this.scale.gameSize.width || 1280;
    const gameHeight = this.scale.gameSize.height || DEFAULT_WORLD_HEIGHT;
    const rightPanelWidth = this.hudVisible ? Math.max(0, gameWidth - HUD_RIGHT_X) : 0;
    const width = this.hudVisible ? Math.max(320, gameWidth - HUD_LEFT_WIDTH - rightPanelWidth) : gameWidth;
    this.cameras.main.setViewport(x, 0, width, gameHeight);
    this.clampCameraScroll();
  }

  clampCameraScroll() {
    const camera = this.cameras.main;
    const bounds = camera.getBounds();
    const visibleWorldWidth = camera.width / camera.zoom;
    const visibleWorldHeight = camera.height / camera.zoom;
    const minScrollX = bounds.x + (visibleWorldWidth - camera.width) / 2;
    const minScrollY = bounds.y + (visibleWorldHeight - camera.height) / 2;
    const maxScrollX = Math.max(minScrollX, minScrollX + bounds.width - visibleWorldWidth);
    const maxScrollY = Math.max(minScrollY, minScrollY + bounds.height - visibleWorldHeight);

    camera.scrollX = Phaser.Math.Clamp(
      camera.scrollX,
      minScrollX,
      maxScrollX
    );
    camera.scrollY = Phaser.Math.Clamp(
      camera.scrollY,
      minScrollY,
      maxScrollY
    );
  }

  updateZoomIndicator() {
    if (!this.zoomIndicatorEl) return;
    this.zoomIndicatorEl.textContent = `ZOOM ${Math.round(this.cameras.main.zoom * 100)}%`;
  }

  updateGridControls() {
    if (this.snapToggleEl) {
      this.snapToggleEl.textContent = this.snapEnabled ? "SNAP ON" : "SNAP OFF";
      this.snapToggleEl.className = [
        "h-8 min-w-24 border-r border-[#385346] px-3 transition hover:bg-[#102019] hover:text-[#fff3a6]",
        this.snapEnabled ? "bg-[#17231d] text-[#f4e786]" : "bg-[#1f1110] text-[#f07b6e]"
      ].join(" ");
    }
    if (this.snapModifierEl) {
      const free = this.snapEnabled && this.keys?.alt?.isDown;
      this.snapModifierEl.textContent = free ? "ALT: FREE" : "ALT: SNAP";
      this.snapModifierEl.className = free
        ? "min-w-20 px-3 text-center text-[#8ee0c6]"
        : "min-w-20 px-3 text-center text-[#8fa89d]";
    }
    this.hudRoot?.querySelectorAll("[data-grid-size]").forEach((button) => {
      const active = Number(button.dataset.gridSize) === this.gridSize;
      button.className = [
        "h-8 min-w-10 border-r border-[#385346] px-2 transition hover:bg-[#102019] hover:text-[#fff3a6]",
        active ? "bg-[#e7d66b] text-[#07100f]" : "text-[#edf8ed]"
      ].join(" ");
    });
  }

  updateDisplaySettingsControls() {
    this.zoomControlEl?.classList.toggle("hidden", !this.hudVisible || !this.zoomHudVisible);
    this.gridControlEl?.classList.toggle("hidden", !this.hudVisible || !this.gridVisible);
    this.cursorCoordsEl?.classList.toggle("hidden", !this.hudVisible || !this.coordinatesVisible);

    if (this.displaySettingsToggleEl) {
      this.displaySettingsToggleEl.setAttribute("aria-expanded", String(this.displaySettingsOpen));
    }
    this.displaySettingsPanelEl?.classList.toggle("hidden", !this.displaySettingsOpen);
    if (this.displaySettingsIndicatorEl) {
      this.displaySettingsIndicatorEl.textContent = this.displaySettingsOpen ? "-" : "+";
    }

    this.updateDisplayToggle("zoom", this.zoomHudVisible);
    this.updateDisplayToggle("grid", this.gridVisible);
    this.updateDisplayToggle("coordinates", this.coordinatesVisible);
  }

  updateDisplayToggle(key, active) {
    const button = this.displayToggleEls?.[key];
    const state = this.displayToggleStateEls?.[key];
    if (!button || !state) return;

    button.setAttribute("aria-pressed", String(active));
    button.className = [
      key === "coordinates" ? "" : "mb-2",
      "flex w-full items-center justify-between rounded-sm border px-3 py-2 text-xs font-bold transition-colors",
      active
        ? "border-[#6ad8b4] bg-[#17231d] text-[#f4e786] hover:bg-[#21372e]"
        : "border-[#7b332d] bg-[#1f1110] text-[#f07b6e] hover:bg-[#2a1715]"
    ].filter(Boolean).join(" ");
    state.textContent = active ? "ON" : "OFF";
  }

  updateCursorCoordinates() {
    if (!this.cursorCoordsEl) return;
    this.cursorCoordsEl.classList.toggle("hidden", !this.hudVisible || !this.coordinatesVisible);
    if (!this.cursorWorldPoint) {
      this.cursorCoordsEl.textContent = "X: ---- Y: ----";
      this.cursorCoordsEl.className = [
        "pointer-events-none absolute bottom-3 left-1/2 min-w-40 -translate-x-1/2 rounded-sm border border-[#385346] bg-[#06100e]/90 px-3 py-2 text-center text-xs font-bold text-[#8fa89d] shadow-[0_8px_24px_rgba(0,0,0,0.3)]",
        (!this.hudVisible || !this.coordinatesVisible) ? "hidden" : ""
      ].filter(Boolean).join(" ");
      return;
    }
    this.cursorCoordsEl.textContent = `X: ${Math.round(this.cursorWorldPoint.x)} Y: ${Math.round(this.cursorWorldPoint.y)}`;
    this.cursorCoordsEl.className = [
      "pointer-events-none absolute bottom-3 left-1/2 min-w-40 -translate-x-1/2 rounded-sm border border-[#6ad8b4] bg-[#06100e]/90 px-3 py-2 text-center text-xs font-bold text-[#8ee0c6] shadow-[0_8px_24px_rgba(0,0,0,0.3)]",
      (!this.hudVisible || !this.coordinatesVisible) ? "hidden" : ""
    ].filter(Boolean).join(" ");
  }

  updateToolButtons() {
    this.toolListEl?.querySelectorAll("[data-tool]").forEach((button) => {
      const disabled =
        (button.dataset.tool === "playerSpawn" && Boolean(this.draft.playerSpawn)) ||
        (button.dataset.tool === "exitGate" && Boolean(this.draft.exitGate));
      button.disabled = disabled;
      button.className = this.toolClass(button.dataset.tool === this.activeTool, disabled);
    });
    if (!this.activeTool) {
      this.destroyPlacementPreview();
    }
  }

  showMessage(message) {
    if (!this.messageEl) return;
    this.messageEl.textContent = message;
    window.clearTimeout(this.messageTimer);
    this.messageTimer = window.setTimeout(() => {
      if (this.messageEl) this.messageEl.textContent = "";
    }, 2200);
  }

  destroyDomHud() {
    window.clearTimeout(this.messageTimer);
    this.game?.canvas?.removeEventListener("contextmenu", this.handleCanvasContextMenu);
    window.removeEventListener("keydown", this.handleHistoryKeyDown, true);
    window.removeEventListener("pointerup", this.handleWindowPointerUp);
    window.removeEventListener("blur", this.handleWindowPointerCancel);
    this.scale?.off(Phaser.Scale.Events.RESIZE, this.resizeWorldViewport, this);
    this.selectionOverlay?.graphics.destroy();
    this.selectionOverlay?.label.destroy();
    this.selectionOverlay = null;
    this.hudRoot?.remove();
    this.hudRoot = null;
  }

  escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  lucideSvg(icon, size) {
    const children = icon
      .map(([tag, attrs]) => {
        const attrText = Object.entries(attrs)
          .map(([key, value]) => `${key}="${this.escapeHtml(value)}"`)
          .join(" ");
        return `<${tag} ${attrText}></${tag}>`;
      })
      .join("");

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${children}</svg>`;
  }

  toolClass(active, disabled = false) {
    if (disabled) {
      return "w-full cursor-not-allowed rounded-sm border border-[#263d35] bg-[#0a1411] px-3 py-2 text-left text-sm font-bold text-[#526a60] opacity-70";
    }

    return [
      "w-full rounded-sm border px-3 py-2 text-left text-sm font-bold transition duration-100",
      active
        ? "border-[#f4e786] bg-[#e7d66b] text-[#07100f]"
        : "border-[#385346] bg-[#102019] text-[#edf8ed] hover:border-[#6d8e78] hover:bg-[#21372e] hover:text-[#f4e786]"
    ].join(" ");
  }

  isSnapActive(pointer = null) {
    return this.snapEnabled && !pointer?.event?.altKey && !this.keys?.alt?.isDown;
  }

  snapPoint(x, y, pointer = null) {
    if (!this.isSnapActive(pointer)) {
      return { x, y };
    }
    const size = this.gridSize || DEFAULT_GRID_SIZE;
    return {
      x: Math.round(x / size) * size,
      y: Math.round(y / size) * size
    };
  }

  pointerInsideWorldViewport(pointer) {
    const camera = this.cameras.main;
    return (
      pointer.x >= camera.x &&
      pointer.x <= camera.x + camera.width &&
      pointer.y >= camera.y &&
      pointer.y <= camera.y + camera.height
    );
  }

  worldPointFromPointer(pointer) {
    const camera = this.cameras.main;
    if (!this.pointerInsideWorldViewport(pointer)) {
      return null;
    }

    return camera.getWorldPoint(pointer.x, pointer.y);
  }

  clampDataToWorld(type, data) {
    const size = this.objectSize(type, data);
    data.x = Phaser.Math.Clamp(data.x, 0, this.worldWidth() - size.width);
    data.y = Phaser.Math.Clamp(data.y, 0, this.groundTop() - size.height);
    if (type === "enemy") {
      data.min = Phaser.Math.Clamp(data.min, 0, this.worldWidth() - size.width);
      data.max = Phaser.Math.Clamp(data.max, 0, this.worldWidth() - size.width);
      if (data.min > data.max) {
        [data.min, data.max] = [data.max, data.min];
      }
    }
    if (type === "merchant") {
      data.npcX = Phaser.Math.Clamp(data.npcX ?? data.x, 0, this.worldWidth() - ITEM_SIZES.playerSpawn.width);
      data.npcY = Phaser.Math.Clamp(data.npcY ?? data.y, 0, this.groundTop() - ITEM_SIZES.playerSpawn.height);
    }
  }

  clampDataToEditableArea(type, data) {
    const size = this.objectSize(type, data);
    data.x = Phaser.Math.Clamp(data.x, 0, this.editableMaxX() - size.width);
    data.y = Phaser.Math.Clamp(data.y, this.editableMinY(), this.groundTop() - size.height);
    if (type === "enemy") {
      data.min = Phaser.Math.Clamp(data.min, 0, this.editableMaxX() - size.width);
      data.max = Phaser.Math.Clamp(data.max, 0, this.editableMaxX() - size.width);
      if (data.min > data.max) {
        [data.min, data.max] = [data.max, data.min];
      }
    }
    if (type === "merchant") {
      data.npcX = Phaser.Math.Clamp(data.npcX ?? data.x, 0, this.editableMaxX() - ITEM_SIZES.playerSpawn.width);
      data.npcY = Phaser.Math.Clamp(data.npcY ?? data.y, this.editableMinY(), this.groundTop() - ITEM_SIZES.playerSpawn.height);
    }
  }

  objectSize(type, data) {
    const defaults = ITEM_SIZES[type] || ITEM_SIZES.sign;
    return {
      width: data.width || defaults.width,
      height: data.height || defaults.height
    };
  }

  objectCenter(type, data) {
    const size = this.objectSize(type, data);
    return {
      x: data.x + size.width / 2,
      y: data.y + size.height / 2
    };
  }

  applyObjectStroke(obj, color, alpha = 1) {
    obj.visual.setStrokeStyle(STROKE_WIDTH, color, alpha);
  }

  createPatrolLine(data) {
    const size = this.objectSize("enemy", data);
    const y = data.y + size.height + 18;
    return this.add.line(0, 0, data.min, y, data.max + size.width, y, 0xe7d66b, 0.8).setOrigin(0).setDepth(8);
  }

  smallStyle(color) {
    return {
      fontFamily: "Cascadia Mono, Consolas, monospace",
      fontSize: "14px",
      color
    };
  }
}
