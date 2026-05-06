import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hammer, Play, Power, Settings } from "lucide-react";
import { useFocusSound } from "./useFocusSound.js";

const IS_DEV = import.meta.env.DEV || Boolean(window.edgecase?.isDev);

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

export function MenuScreen({ onPlay, onSettings, onLevelMaker, onQuit }) {
  const screenRef = useRef(null);
  const [focusedRow, setFocusedRow] = useState(null);
  useFocusSound(focusedRow);
  const actions = useMemo(() => {
    const items = [
      {
        label: "PLAY",
        detail: "Choose a level and begin the run",
        icon: Play,
        action: onPlay
      },
      {
        label: "SETTINGS",
        detail: "Adjust system, display, and audio",
        icon: Settings,
        action: onSettings
      }
    ];

    if (IS_DEV) {
      items.push({
        label: "LEVEL MAKER",
        detail: "Build and tune local challenge maps",
        icon: Hammer,
        action: onLevelMaker
      });
    }

    items.push({
      label: "QUIT GAME",
      detail: "Close Wisdom Quest",
      icon: Power,
      action: onQuit
    });

    return items;
  }, [onLevelMaker, onPlay, onQuit, onSettings]);

  const selectFocused = useCallback(() => {
    if (focusedRow === null) {
      return;
    }

    actions[focusedRow]?.action();
  }, [actions, focusedRow]);

  useEffect(() => {
    screenRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.repeat) {
        return;
      }

      if (["ArrowUp", "KeyW"].includes(event.code)) {
        event.preventDefault();
        setFocusedRow((current) => current === null ? actions.length - 1 : (current + actions.length - 1) % actions.length);
      } else if (["ArrowDown", "KeyS"].includes(event.code)) {
        event.preventDefault();
        setFocusedRow((current) => current === null ? 0 : (current + 1) % actions.length);
      } else if (["Space", "Enter"].includes(event.code)) {
        event.preventDefault();
        selectFocused();
      }
    }

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [actions.length, selectFocused]);

  return (
    <section
      ref={screenRef}
      tabIndex={-1}
      className="menu-screen absolute inset-0 z-[5] overflow-hidden bg-[radial-gradient(circle_at_27%_42%,rgba(12,69,55,0.18),transparent_28%),linear-gradient(180deg,#010807_0%,#03100e_52%,#010605_100%)] font-['Cascadia_Mono',Consolas,monospace] text-[#edf8ed] outline-none before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(rgba(73,180,150,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(73,180,150,0.025)_1px,transparent_1px)] before:bg-[size:26px_26px] before:content-[''] before:[mask-image:linear-gradient(90deg,transparent_0%,#000_46%,#000_100%)]"
      aria-label="Main menu"
    >
      <header className="relative z-[2] flex items-start justify-between gap-8">
        <div>
          <h1 className="page-title">
            WISDOM QUEST
          </h1>
        </div>
      </header>

      <div className="menu-action-list relative z-[2] grid">
        {actions.map((item, index) => {
          const Icon = item.icon;
          const focused = focusedRow === index;

          return (
            <article
              key={item.label}
              className={cx(
                "menu-action-row relative grid cursor-pointer items-center rounded-lg border-[3px] before:pointer-events-none before:absolute before:inset-[-6px] before:rounded-[10px] before:border before:border-transparent before:content-['']",
                focused
                  ? "border-[#d6b548] bg-[rgba(25,48,31,0.94)] shadow-[inset_0_0_24px_rgba(184,143,38,0.12),0_0_4px_rgba(235,199,76,0.76),0_0_10px_rgba(226,170,46,0.54),0_0_22px_rgba(184,132,32,0.34),0_0_38px_rgba(116,78,18,0.18)]"
                  : "border-[rgba(36,86,74,0.86)] bg-[rgba(3,33,27,0.68)] shadow-[inset_0_0_18px_rgba(18,82,65,0.18),0_0_14px_rgba(15,77,61,0.14)]"
              )}
              onMouseEnter={() => setFocusedRow(index)}
              onClick={item.action}
            >
              <div
                className={cx(
                  "justify-self-start",
                  focused
                    ? "text-[#d7bd4e] [filter:drop-shadow(0_0_9px_rgba(193,151,42,0.5))]"
                    : "text-[#3fa68f] [filter:drop-shadow(0_0_8px_rgba(63,166,143,0.35))]"
                )}
                aria-hidden="true"
              >
                <Icon className="h-[58px] w-[58px] stroke-current" strokeWidth={3.6} />
              </div>
              <div>
                <h2
                  className={cx(
                    "m-0 mb-4 font-[Bungee,EdgecaseTitle,Bahnschrift,Impact,sans-serif] text-[30px] leading-none font-normal",
                    focused ? "text-[#d7bd4e]" : "text-[#f2f6e7]"
                  )}
                >
                  {item.label}
                </h2>
                <p className="m-0 text-base font-bold text-[#9eaaa1]">{item.detail}</p>
              </div>
            </article>
          );
        })}
      </div>

      <div className="absolute bottom-7 left-1/2 z-[3] min-h-6 -translate-x-1/2 font-['Cascadia_Mono',Consolas,monospace] text-base font-extrabold text-[#f4e786]">
        A/D move | Space jump | E interact | Physical quiz answers use doors
      </div>
    </section>
  );
}
