import React, { useEffect, useMemo, useRef, useState } from "react";
import { Download, X } from "lucide-react";
import { QUESTION_OPTION_COUNT, parseQuestion } from "../game/data/questionSchema.js";

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

const EMPTY_QUESTION = {
  prompt: "",
  options: Array.from({ length: QUESTION_OPTION_COUNT }, () => ""),
  correct: 0
};

function emptyErrors() {
  return {
    prompt: "",
    options: Array.from({ length: QUESTION_OPTION_COUNT }, () => ""),
    correct: "",
    json: ""
  };
}

function errorsFromResult(result) {
  const nextErrors = emptyErrors();
  result.error?.issues?.forEach((issue) => {
    const [field, index] = issue.path;
    const message = issueMessage(issue);
    if (field === "prompt" && !nextErrors.prompt) {
      nextErrors.prompt = message;
    } else if (field === "options" && typeof index === "number" && !nextErrors.options[index]) {
      nextErrors.options[index] = message;
    } else if (field === "options" && !nextErrors.options.some(Boolean)) {
      nextErrors.options[0] = message;
    } else if (field === "correct" && !nextErrors.correct) {
      nextErrors.correct = message;
    }
  });
  return nextErrors;
}

function issueMessage(issue) {
  const [field, index] = issue.path;
  if (field === "prompt") {
    return "Prompt is required.";
  }
  if (field === "options" && typeof index === "number") {
    return `Answer ${String.fromCharCode(65 + index)} is required.`;
  }
  if (field === "options") {
    return "Exactly 4 answers are required.";
  }
  if (field === "correct") {
    return "Correct answer must be an integer from 0 to 3.";
  }
  return issue.message || "Question JSON does not match the expected structure.";
}

function firstJsonError(result) {
  const issue = result.error?.issues?.[0];
  if (!issue) {
    return "Question JSON does not match the expected structure.";
  }
  return issueMessage(issue);
}

export function QuestionModal({ state, onApply, onCancel }) {
  const screenRef = useRef(null);
  const fileInputRef = useRef(null);
  const parsedQuestion = useMemo(() => parseQuestion(state?.question), [state]);
  const initialQuestion = parsedQuestion.success ? parsedQuestion.data : EMPTY_QUESTION;
  const [prompt, setPrompt] = useState(initialQuestion.prompt);
  const [options, setOptions] = useState(initialQuestion.options);
  const [correct, setCorrect] = useState(initialQuestion.correct);
  const [jsonText, setJsonText] = useState(JSON.stringify(initialQuestion, null, 2));
  const [tab, setTab] = useState("form");
  const [errors, setErrors] = useState(emptyErrors);

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
    setErrors((current) => ({
      ...current,
      options: current.options.map((error, optionIndex) => optionIndex === index ? "" : error)
    }));
  };

  const applyForm = () => {
    const result = parseQuestion({ prompt, options, correct });
    if (!result.success) {
      setErrors(errorsFromResult(result));
      return;
    }
    setErrors(emptyErrors());
    onApply(result.data);
  };

  const parseJsonText = (text) => {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return { success: false, message: "JSON syntax is invalid. Check commas, quotes, and braces." };
    }

    const result = parseQuestion(data);
    if (!result.success) {
      return { success: false, result, message: firstJsonError(result) };
    }
    return { success: true, data: result.data };
  };

  const loadJsonIntoForm = (text, { switchToForm = false, apply = false } = {}) => {
    const parsed = parseJsonText(text);
    if (!parsed.success) {
      setErrors((current) => ({
        ...(parsed.result ? errorsFromResult(parsed.result) : current),
        json: parsed.message
      }));
      return false;
    }
    const result = { data: parsed.data };
    setPrompt(result.data.prompt);
    setOptions(result.data.options);
    setCorrect(result.data.correct);
    setJsonText(JSON.stringify(result.data, null, 2));
    setErrors(emptyErrors());
    if (switchToForm) {
      setTab("form");
    }
    if (apply) {
      onApply(result.data);
    }
    return true;
  };

  const handleJsonFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    const text = await file.text();
    setJsonText(text);
    loadJsonIntoForm(text, { switchToForm: true });
  };

  const handleJsonTextChange = (value) => {
    setJsonText(value);
    if (!value.trim()) {
      setErrors((current) => ({ ...current, json: "" }));
      return;
    }
    loadJsonIntoForm(value);
  };

  const selectTab = (nextTab) => {
    if (nextTab === "json") {
      setJsonText(JSON.stringify({ prompt, options, correct }, null, 2));
    }
    setErrors(emptyErrors());
    setTab(nextTab);
  };

  const fieldClass = (hasError, extra = "") => cx(
    extra,
    hasError
      ? "border-[#f07b6e] focus:border-[#f07b6e] shadow-[0_0_0_1px_rgba(240,123,110,0.35)]"
      : "border-[#385346] focus:border-[#d6b548]"
  );

  const fieldError = (message) => message ? (
    <div className="mt-1 text-xs font-bold normal-case text-[#f07b6e]">{message}</div>
  ) : null;

  return (
    <section
      ref={screenRef}
      tabIndex={-1}
      className="absolute inset-0 z-[20] grid place-items-center bg-[rgba(1,8,7,0.76)] p-6 font-['Cascadia_Mono',Consolas,monospace] text-[#edf8ed] outline-none"
      aria-label="Custom question editor"
    >
      <div className="relative grid w-[min(760px,calc(100vw-48px))] max-h-[calc(100vh-48px)] grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden rounded-lg border-[3px] border-[rgba(36,86,74,0.9)] bg-[rgba(3,16,14,0.98)] shadow-[inset_0_0_32px_rgba(18,82,65,0.18),0_0_4px_rgba(235,199,76,0.5),0_0_28px_rgba(15,77,61,0.32)]">
        <header className="flex items-center justify-between gap-5 border-b border-[rgba(56,83,70,0.9)] px-6 py-5">
          <div>
            <h1 className="m-0 font-[Bungee,EdgecaseTitle,Bahnschrift,Impact,sans-serif] text-[32px] font-normal leading-none text-[#f3f6e5]">
              {state.label || "Selected challenge"}
            </h1>
          </div>
          <button
            type="button"
            aria-label="Close question editor"
            onClick={onCancel}
            className="grid h-11 w-11 place-items-center rounded-lg border-[3px] border-[rgba(36,86,74,0.86)] bg-[rgba(3,33,27,0.68)] text-xl font-bold text-[#edf8ed] transition hover:border-[#d6b548] hover:bg-[rgba(25,48,31,0.94)] hover:text-[#d7bd4e]"
          >
            <X aria-hidden="true" size={24} strokeWidth={3} />
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

        <div className="edgecase-scrollbar min-h-0 overflow-y-auto px-6 py-5">
          {tab === "form" ? (
          <div className="grid gap-4">
            <label className="grid gap-1 text-xs font-bold uppercase text-[#8fa89d]">
              Prompt
              <textarea
                rows={3}
                value={prompt}
                onChange={(event) => {
                  setPrompt(event.target.value);
                  setErrors((current) => ({ ...current, prompt: "" }));
                }}
                className={fieldClass(errors.prompt, "resize-y rounded-md border-2 bg-[#102019] px-3 py-2 text-sm normal-case text-[#edf8ed] outline-none transition")}
              />
              {fieldError(errors.prompt)}
            </label>
            {options.map((option, index) => (
              <label key={index} className="grid gap-1 text-xs font-bold uppercase text-[#8fa89d]">
                Answer {String.fromCharCode(65 + index)}
                <input
                  type="text"
                  value={option}
                  onChange={(event) => updateOption(index, event.target.value)}
                  className={fieldClass(errors.options[index], "rounded-md border-2 bg-[#102019] px-3 py-2 text-sm normal-case text-[#edf8ed] outline-none transition")}
                />
                {fieldError(errors.options[index])}
              </label>
            ))}
            <div className="grid gap-1 text-xs font-bold uppercase text-[#8fa89d]">
              Correct
              <div className={fieldClass(errors.correct, "grid grid-cols-4 overflow-hidden rounded-lg border-2")}>
                {options.map((_option, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => {
                      setCorrect(index);
                      setErrors((current) => ({ ...current, correct: "" }));
                    }}
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
              {fieldError(errors.correct)}
            </div>
          </div>
          ) : (
          <div className="grid gap-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={handleJsonFile}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-12 w-full items-center justify-center gap-3 rounded-lg border-[3px] border-[rgba(36,86,74,0.86)] bg-[rgba(3,33,27,0.68)] font-[Bungee,EdgecaseTitle,Bahnschrift,Impact,sans-serif] text-lg font-normal uppercase text-[#edf8ed] transition hover:border-[#d6b548] hover:bg-[rgba(25,48,31,0.94)] hover:text-[#d7bd4e]"
            >
              <Download aria-hidden="true" size={22} strokeWidth={3} />
              Import JSON
            </button>
            <label className="grid gap-1 text-xs font-bold uppercase text-[#8fa89d]">
              Question JSON
              <textarea
                rows={12}
                spellCheck={false}
                value={jsonText}
                onChange={(event) => handleJsonTextChange(event.target.value)}
                className={fieldClass(errors.json, "edgecase-scrollbar resize-y rounded-md border-2 bg-[#102019] px-3 py-2 text-sm normal-case leading-6 text-[#edf8ed] outline-none transition")}
              />
              {fieldError(errors.json)}
            </label>
          </div>
          )}
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
            onClick={tab === "json" ? () => loadJsonIntoForm(jsonText, { apply: true }) : applyForm}
            className="rounded-lg border-[3px] border-[#d6b548] bg-[#d6b548] px-5 py-2 font-[Bungee,EdgecaseTitle,Bahnschrift,Impact,sans-serif] text-lg font-normal text-[#07100f] transition hover:border-[#f4e786] hover:bg-[#f4e786]"
          >
            APPLY
          </button>
        </footer>
      </div>
    </section>
  );
}
