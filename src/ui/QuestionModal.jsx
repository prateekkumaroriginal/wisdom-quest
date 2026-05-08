import React, { useEffect, useMemo, useRef, useState } from "react";
import { QUESTION_OPTION_COUNT, parseQuestion } from "../game/data/questionSchema.js";

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

const EMPTY_QUESTION = {
  prompt: "",
  options: Array.from({ length: QUESTION_OPTION_COUNT }, () => ""),
  correct: 0
};

const EXAMPLE_QUESTION = {
  prompt: "Which language runs natively in web browsers?",
  options: ["Python", "JavaScript", "C++", "SQL"],
  correct: 1
};

function firstIssueMessage(result) {
  return result.error?.issues?.[0]?.message || "Question is invalid.";
}

export function QuestionModal({ state, onApply, onCancel }) {
  const screenRef = useRef(null);
  const parsedQuestion = useMemo(() => parseQuestion(state?.question), [state]);
  const initialQuestion = parsedQuestion.success ? parsedQuestion.data : EMPTY_QUESTION;
  const [tab, setTab] = useState(state?.tab === "json" ? "json" : "form");
  const [prompt, setPrompt] = useState(initialQuestion.prompt);
  const [options, setOptions] = useState(initialQuestion.options);
  const [correct, setCorrect] = useState(initialQuestion.correct);
  const [jsonText, setJsonText] = useState(JSON.stringify(initialQuestion, null, 2));
  const [error, setError] = useState("");

  useEffect(() => {
    screenRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.code !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [onCancel]);

  if (!state) {
    return null;
  }

  const updateOption = (index, value) => {
    setOptions((current) => current.map((option, optionIndex) => optionIndex === index ? value : option));
  };

  const applyForm = () => {
    const result = parseQuestion({ prompt, options, correct });
    if (!result.success) {
      setError(firstIssueMessage(result));
      return;
    }
    onApply(result.data);
  };

  const applyJson = () => {
    let data;
    try {
      data = JSON.parse(jsonText);
    } catch {
      setError("JSON is invalid.");
      return;
    }

    const result = parseQuestion(data);
    if (!result.success) {
      setError(firstIssueMessage(result));
      return;
    }
    onApply(result.data);
  };

  const handleApply = () => {
    if (tab === "json") {
      applyJson();
    } else {
      applyForm();
    }
  };

  const selectTab = (nextTab) => {
    setError("");
    if (nextTab === "json" && tab === "form") {
      const result = parseQuestion({ prompt, options, correct });
      setJsonText(JSON.stringify(result.success ? result.data : { prompt, options, correct }, null, 2));
    }
    if (nextTab === "form" && tab === "json") {
      try {
        const result = parseQuestion(JSON.parse(jsonText));
        if (result.success) {
          setPrompt(result.data.prompt);
          setOptions(result.data.options);
          setCorrect(result.data.correct);
        }
      } catch {
        // Keep the current form values if the JSON tab contains draft-invalid text.
      }
    }
    setTab(nextTab);
  };

  return (
    <section
      ref={screenRef}
      tabIndex={-1}
      className="absolute inset-0 z-[20] grid place-items-center bg-[rgba(1,8,7,0.76)] p-6 font-['Cascadia_Mono',Consolas,monospace] text-[#edf8ed] outline-none"
      aria-label="Custom question editor"
    >
      <div className="relative grid w-[min(760px,calc(100vw-48px))] max-h-[calc(100vh-48px)] overflow-hidden rounded-lg border-[3px] border-[rgba(36,86,74,0.9)] bg-[rgba(3,16,14,0.98)] shadow-[inset_0_0_32px_rgba(18,82,65,0.18),0_0_4px_rgba(235,199,76,0.5),0_0_28px_rgba(15,77,61,0.32)]">
        <header className="flex items-center justify-between gap-5 border-b border-[rgba(56,83,70,0.9)] px-6 py-5">
          <div>
            <h1 className="m-0 font-[Bungee,EdgecaseTitle,Bahnschrift,Impact,sans-serif] text-[32px] font-normal leading-none text-[#f3f6e5]">
              CUSTOM QUESTION
            </h1>
            <p className="mt-2 text-xs font-bold uppercase text-[#e5d46e]">
              {state.label || "Selected challenge"}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close question editor"
            onClick={onCancel}
            className="grid h-11 w-11 place-items-center rounded-lg border-[3px] border-[rgba(36,86,74,0.86)] bg-[rgba(3,33,27,0.68)] text-xl font-bold text-[#edf8ed] transition hover:border-[#d6b548] hover:bg-[rgba(25,48,31,0.94)] hover:text-[#d7bd4e]"
          >
            x
          </button>
        </header>

        <div className="grid grid-cols-2 border-b border-[rgba(56,83,70,0.9)]">
          {["form", "json"].map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => selectTab(item)}
              className={cx(
                "h-12 border-r border-[rgba(56,83,70,0.9)] font-[Bungee,EdgecaseTitle,Bahnschrift,Impact,sans-serif] text-lg font-normal uppercase transition last:border-r-0",
                tab === item
                  ? "bg-[#d6b548] text-[#07100f]"
                  : "bg-[rgba(3,33,27,0.68)] text-[#8fa89d] hover:bg-[rgba(25,48,31,0.94)] hover:text-[#d7bd4e]"
              )}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="min-h-0 overflow-y-auto px-6 py-5">
          {tab === "form" ? (
            <div className="grid gap-4">
              <label className="grid gap-1 text-xs font-bold uppercase text-[#8fa89d]">
                Prompt
                <textarea
                  rows={3}
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  className="resize-y rounded-md border-2 border-[#385346] bg-[#102019] px-3 py-2 text-sm normal-case text-[#edf8ed] outline-none transition focus:border-[#d6b548]"
                />
              </label>
              {options.map((option, index) => (
                <label key={index} className="grid gap-1 text-xs font-bold uppercase text-[#8fa89d]">
                  Answer {String.fromCharCode(65 + index)}
                  <input
                    type="text"
                    value={option}
                    onChange={(event) => updateOption(index, event.target.value)}
                    className="rounded-md border-2 border-[#385346] bg-[#102019] px-3 py-2 text-sm normal-case text-[#edf8ed] outline-none transition focus:border-[#d6b548]"
                  />
                </label>
              ))}
              <div className="grid gap-1 text-xs font-bold uppercase text-[#8fa89d]">
                Correct
                <div className="grid grid-cols-4 overflow-hidden rounded-lg border-2 border-[#385346]">
                  {options.map((_option, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setCorrect(index)}
                      className={cx(
                        "h-11 border-r border-[#385346] font-[Bungee,EdgecaseTitle,Bahnschrift,Impact,sans-serif] text-lg font-normal transition last:border-r-0",
                        correct === index
                          ? "bg-[#d6b548] text-[#07100f]"
                          : "bg-[#102019] text-[#edf8ed] hover:bg-[#21372e] hover:text-[#d7bd4e]"
                      )}
                    >
                      {String.fromCharCode(65 + index)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-4">
              <label className="grid gap-1 text-xs font-bold uppercase text-[#8fa89d]">
                Question JSON
                <textarea
                  rows={12}
                  spellCheck={false}
                  value={jsonText}
                  onChange={(event) => setJsonText(event.target.value)}
                  className="resize-y rounded-md border-2 border-[#385346] bg-[#102019] px-3 py-2 text-sm normal-case leading-6 text-[#edf8ed] outline-none transition focus:border-[#d6b548]"
                />
              </label>
              <pre className="m-0 overflow-x-auto rounded-md border border-[#385346] bg-[#0d1a16] p-3 text-xs leading-5 text-[#8fa89d]">
                {JSON.stringify(EXAMPLE_QUESTION, null, 2)}
              </pre>
            </div>
          )}
          <div className="mt-4 min-h-6 text-sm font-bold text-[#f07b6e]">{error}</div>
        </div>

        <footer className="flex justify-end gap-3 border-t border-[rgba(56,83,70,0.9)] px-6 py-5">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border-[3px] border-[rgba(36,86,74,0.86)] bg-[rgba(3,33,27,0.68)] px-5 py-2 font-[Bungee,EdgecaseTitle,Bahnschrift,Impact,sans-serif] text-lg font-normal text-[#edf8ed] transition hover:border-[#d6b548] hover:bg-[rgba(25,48,31,0.94)] hover:text-[#d7bd4e]"
          >
            CANCEL
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="rounded-lg border-[3px] border-[#d6b548] bg-[#d6b548] px-5 py-2 font-[Bungee,EdgecaseTitle,Bahnschrift,Impact,sans-serif] text-lg font-normal text-[#07100f] transition hover:border-[#f4e786] hover:bg-[#f4e786]"
          >
            APPLY
          </button>
        </footer>
      </div>
    </section>
  );
}
