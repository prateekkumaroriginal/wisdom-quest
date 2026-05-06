import React, { useEffect, useRef, useState } from "react";
import { createGame } from "./game/createGame.js";
import { DEFAULT_LEVEL_ID } from "./game/data/levels.js";
import { emitGameEvent, gameEvents } from "./game/gameEvents.js";
import { EndRunScreen } from "./ui/EndRunScreen.jsx";
import { GameplayHud } from "./ui/GameplayHud.jsx";
import { GameToast } from "./ui/GameToast.jsx";
import { LevelSelectScreen } from "./ui/LevelSelectScreen.jsx";
import { MenuScreen } from "./ui/MenuScreen.jsx";
import { MerchantScreen } from "./ui/MerchantScreen.jsx";
import { PauseScreen } from "./ui/PauseScreen.jsx";
import { SettingsScreen } from "./ui/SettingsScreen.jsx";
import { getViewportStyleVars, useViewportMetrics } from "./ui/useViewportMetrics.js";

export default function App() {
  const gameRootRef = useRef(null);
  const gameRef = useRef(null);
  const [screen, setScreen] = useState("menu");
  const [pauseVisible, setPauseVisible] = useState(false);
  const [merchantState, setMerchantState] = useState(null);
  const [endRunState, setEndRunState] = useState(null);
  const [hudState, setHudState] = useState(null);
  const [toastState, setToastState] = useState(null);
  const viewportMetrics = useViewportMetrics();

  useEffect(() => {
    if (!gameRootRef.current || gameRef.current) {
      return undefined;
    }

    gameRef.current = createGame(gameRootRef.current);

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    const openSettings = () => {
      setPauseVisible(false);
      setMerchantState(null);
      setEndRunState(null);
      setToastState(null);
      setScreen("settings");
    };
    const openMenu = () => {
      setPauseVisible(false);
      setMerchantState(null);
      setEndRunState(null);
      setHudState(null);
      setToastState(null);
      setScreen("menu");
    };
    const openLevelSelect = () => {
      setPauseVisible(false);
      setMerchantState(null);
      setEndRunState(null);
      setToastState(null);
      setScreen("level-select");
    };
    const openPause = () => {
      setPauseVisible(true);
    };
    const closePause = () => {
      setPauseVisible(false);
    };
    const openMerchant = (event) => setMerchantState(event.detail);
    const closeMerchant = () => setMerchantState(null);
    const openEndRun = (event) => setEndRunState(event.detail);
    const closeEndRun = () => setEndRunState(null);
    const updateHud = (event) => setHudState(event.detail);
    const clearHud = () => setHudState(null);
    const showToast = (event) => setToastState({ id: Date.now(), message: event.detail?.message || "" });

    gameEvents.addEventListener("edgecase:navigate-settings", openSettings);
    gameEvents.addEventListener("edgecase:navigate-menu", openMenu);
    gameEvents.addEventListener("edgecase:navigate-level-select", openLevelSelect);
    gameEvents.addEventListener("edgecase:pause-open", openPause);
    gameEvents.addEventListener("edgecase:pause-close", closePause);
    gameEvents.addEventListener("edgecase:merchant-open", openMerchant);
    gameEvents.addEventListener("edgecase:merchant-update", openMerchant);
    gameEvents.addEventListener("edgecase:merchant-close", closeMerchant);
    gameEvents.addEventListener("edgecase:end-run-open", openEndRun);
    gameEvents.addEventListener("edgecase:end-run-close", closeEndRun);
    gameEvents.addEventListener("edgecase:hud-update", updateHud);
    gameEvents.addEventListener("edgecase:hud-clear", clearHud);
    gameEvents.addEventListener("edgecase:toast", showToast);

    return () => {
      gameEvents.removeEventListener("edgecase:navigate-settings", openSettings);
      gameEvents.removeEventListener("edgecase:navigate-menu", openMenu);
      gameEvents.removeEventListener("edgecase:navigate-level-select", openLevelSelect);
      gameEvents.removeEventListener("edgecase:pause-open", openPause);
      gameEvents.removeEventListener("edgecase:pause-close", closePause);
      gameEvents.removeEventListener("edgecase:merchant-open", openMerchant);
      gameEvents.removeEventListener("edgecase:merchant-update", openMerchant);
      gameEvents.removeEventListener("edgecase:merchant-close", closeMerchant);
      gameEvents.removeEventListener("edgecase:end-run-open", openEndRun);
      gameEvents.removeEventListener("edgecase:end-run-close", closeEndRun);
      gameEvents.removeEventListener("edgecase:hud-update", updateHud);
      gameEvents.removeEventListener("edgecase:hud-clear", clearHud);
      gameEvents.removeEventListener("edgecase:toast", showToast);
    };
  }, []);

  useEffect(() => {
    if (gameRef.current?.input?.keyboard) {
      gameRef.current.input.keyboard.enabled = screen === "game";
    }
  }, [screen]);

  useEffect(() => {
    if (screen !== "game") {
      setToastState(null);
    }
  }, [screen]);

  const startScene = (sceneName) => {
    const registry = getRegistry();
    if (sceneName === "LevelEditorScene") {
      registry?.remove("editorDraft");
      registry?.remove("draftLevel");
    }
    setPauseVisible(false);
    setMerchantState(null);
    setEndRunState(null);
    setToastState(null);
    setScreen("game");
    gameRef.current?.scene?.start(sceneName);
  };

  const getRegistry = () => gameRef.current?.registry;

  const playLevel = (id) => {
    const registry = getRegistry();
    registry?.set("selectedLevelId", id);
    registry?.remove("draftLevel");
    setPauseVisible(false);
    setMerchantState(null);
    setEndRunState(null);
    setToastState(null);
    setScreen("game");
    gameRef.current?.scene?.start("GameScene");
  };

  const editLevel = (level) => {
    const registry = getRegistry();
    registry?.set("editorDraft", structuredClone(level));
    setPauseVisible(false);
    setMerchantState(null);
    setEndRunState(null);
    setToastState(null);
    setScreen("game");
    gameRef.current?.scene?.start("LevelEditorScene");
  };

  const syncDevLevels = (levels, loaded = true) => {
    const registry = getRegistry();
    registry?.set("devSavedLevels", levels);
    registry?.set("devSavedLevelsLoaded", loaded);
    const selectedLevelId = registry?.get("selectedLevelId");
    if (!levels.some((level) => level.id === selectedLevelId)) {
      registry?.set("selectedLevelId", levels[0]?.id || DEFAULT_LEVEL_ID);
    }
  };

  const quitGame = () => {
    if (window.edgecase?.quitGame) {
      window.edgecase.quitGame();
      return;
    }
    window.close();
  };

  const handlePauseAction = (action) => {
    emitGameEvent("edgecase:pause-action", { action });
    if (action === "resume") {
      setPauseVisible(false);
    }
  };

  const handleMerchantAction = (action) => {
    emitGameEvent("edgecase:merchant-action", action);
  };

  const handleEndRunAction = (action) => {
    emitGameEvent("edgecase:end-run-action", { action });
  };

  return (
    <div className="app-shell" style={getViewportStyleVars(viewportMetrics)}>
      <div
        ref={gameRootRef}
        id="game-root"
        className={screen !== "game" ? "game-layer game-layer--obscured" : "game-layer"}
        aria-hidden={screen !== "game"}
      />
      {screen === "game" ? <GameplayHud hud={hudState} /> : null}
      {screen === "game" ? <GameToast toast={toastState} /> : null}
      {merchantState ? <MerchantScreen state={merchantState} onAction={handleMerchantAction} /> : null}
      {endRunState ? <EndRunScreen state={endRunState} onAction={handleEndRunAction} /> : null}
      {pauseVisible ? <PauseScreen onAction={handlePauseAction} /> : null}
      {screen === "menu" ? (
        <MenuScreen
          onPlay={() => setScreen("level-select")}
          onSettings={() => setScreen("settings")}
          onLevelMaker={() => startScene("LevelEditorScene")}
          onQuit={quitGame}
        />
      ) : null}
      {screen === "level-select" ? (
        <LevelSelectScreen
          initialDevLevels={getRegistry()?.get("devSavedLevels") || []}
          initialDevLevelsLoaded={Boolean(getRegistry()?.get("devSavedLevelsLoaded"))}
          onBack={() => setScreen("menu")}
          onDeleteLevel={(_id, levels) => syncDevLevels(levels, true)}
          onEditLevel={editLevel}
          onLevelsLoaded={syncDevLevels}
          onPlayLevel={playLevel}
        />
      ) : null}
      {screen === "settings" ? <SettingsScreen onBack={() => setScreen("menu")} /> : null}
    </div>
  );
}
