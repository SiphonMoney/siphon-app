"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { ChevronsDown, LayoutDashboard } from "lucide-react";
import "./BuildAiPrompt.css";

export interface BuildChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

type SuggestionItem = { label: string; text: string };

const BUILD_SUGGESTIONS: SuggestionItem[] = [
  {
    label: "Limit order",
    text: "Deposit USDC and place a limit buy for ETH at my target price",
  },
  {
    label: "DCA loop",
    text: "Deposit USDC once, then loop swap to ETH and withdraw on a daily cadence",
  },
  {
    label: "Stop-loss exit",
    text: "Deposit ETH, sell when price hits my stop, swap to USDC and withdraw",
  },
  {
    label: "Loop until empty",
    text: "Deposit 500 USDC on Base, loop swap to ETH and withdraw every 24 hours",
  },
  {
    label: "Scheduled entry",
    text: "Deposit ETH, wait 1 hour, then limit buy when price dips",
  },
  {
    label: "Take profit chain",
    text: "Limit buy ETH, take profit at 8%, swap to USDC, withdraw to wallet",
  },
  {
    label: "Recurring swap",
    text: "Deposit USDC and swap to ETH on a daily loop until funds run out",
  },
  {
    label: "Exit to stables",
    text: "When ETH hits my target, swap everything to USDC and withdraw",
  },
];

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function SuggestionMarquee({
  disabled,
  onPickPrompt,
}: {
  disabled?: boolean;
  onPickPrompt: (text: string) => void;
}) {
  const reduced = usePrefersReducedMotion();

  const handlePick = (item: SuggestionItem) => {
    if (disabled) return;
    onPickPrompt(item.text);
  };

  const renderStrip = (suffix: string) => (
    <div className="build-ai-marquee-strip" aria-hidden={suffix === "b"}>
      {BUILD_SUGGESTIONS.map((item, i) => (
        <Fragment key={`${suffix}-${item.label}`}>
          {i > 0 ? (
            <span className="build-ai-marquee-dot" aria-hidden>
              ·
            </span>
          ) : null}
          <button
            type="button"
            className="build-ai-marquee-chip"
            disabled={disabled}
            onClick={() => handlePick(item)}
          >
            {item.label}
          </button>
        </Fragment>
      ))}
    </div>
  );

  if (reduced) {
    return (
      <div className="build-ai-marquee build-ai-marquee--static" role="region" aria-label="Suggested prompts">
        <div className="build-ai-marquee-static-row">
          {BUILD_SUGGESTIONS.map((item, i) => (
            <Fragment key={item.label}>
              {i > 0 ? <span className="build-ai-marquee-dot" aria-hidden>·</span> : null}
              <button
                type="button"
                className="build-ai-marquee-chip"
                disabled={disabled}
                onClick={() => handlePick(item)}
              >
                {item.label}
              </button>
            </Fragment>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="build-ai-marquee" role="region" aria-label="Suggested prompts">
      <div className="build-ai-marquee-track">
        {renderStrip("a")}
        {renderStrip("b")}
      </div>
    </div>
  );
}

export interface BuildAiPromptProps {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onSubmit?: (prompt: string) => void | Promise<void>;
  placeholder?: string;
  submitLabel?: string;
  isLoading?: boolean;
  disabled?: boolean;
  className?: string;
  disclaimer?: string;
  /** @deprecated use messages */
  botMessage?: string | null;
  messages?: BuildChatMessage[];
  onChatActiveChange?: (active: boolean) => void;
  /** Dashboard widget band visibility — toggle sits right of Send in the input row. */
  widgetsVisible?: boolean;
  onToggleWidgets?: () => void;
  /** Canvas/build mode — hide hero title and anchor chat (e.g. after picking a strategy). */
  buildViewActive?: boolean;
}

export default function BuildAiPrompt({
  value: controlledValue,
  defaultValue = "",
  onChange,
  onSubmit,
  placeholder = "Describe your flow — limits, loops, schedules…",
  submitLabel = "Send",
  isLoading = false,
  disabled = false,
  className = "",
  disclaimer = "AI can make mistakes. Review before committing funds.",  botMessage = null,
  messages = [],
  onChatActiveChange,
  widgetsVisible = true,
  onToggleWidgets,
  buildViewActive = false,
}: BuildAiPromptProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const threadRef = useRef<HTMLDivElement>(null);
  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : internalValue;

  const setValue = useCallback(
    (next: string) => {
      if (!isControlled) {
        setInternalValue(next);
      }
      onChange?.(next);
    },
    [isControlled, onChange]
  );

  const handleSubmit = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed || disabled || isLoading) return;
    await onSubmit?.(trimmed);
    if (!isControlled) {
      setInternalValue("");
    }
  }, [value, disabled, isLoading, onSubmit, isControlled]);

  const canSubmit = value.trim().length > 0 && !disabled && !isLoading;
  const lastMsg = messages[messages.length - 1];
  const awaitingAnswer = lastMsg?.role === "assistant";
  const inputPlaceholder = awaitingAnswer ? "Type your answer..." : placeholder;

  const displayMessages =
    messages.length > 0
      ? messages
      : botMessage
        ? [{ id: "legacy-bot", role: "assistant" as const, content: botMessage }]
        : [];

  const isEmpty = displayMessages.length === 0 && !isLoading;
  const chatActive = !isEmpty || isLoading;
  const promptExpanded = chatActive || buildViewActive;
  /** Fixed bottom strip when widgets are collapsed and chat/build mode is active */
  const chatAnchored = !widgetsVisible && promptExpanded;

  useEffect(() => {
    onChatActiveChange?.(chatActive);
  }, [chatActive, onChatActiveChange]);

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;

    const syncThread = () => {
      el.scrollTop = el.scrollHeight;
    };

    syncThread();
    const observer = new ResizeObserver(syncThread);
    observer.observe(el);
    return () => observer.disconnect();
  }, [displayMessages.length, isLoading]);

  const threadContent = !isEmpty && (
    <div className="build-ai-thread-fade-wrap">
      <div
        ref={threadRef}
        className="build-ai-prompt-thread"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        <div className="build-ai-thread-spacer" aria-hidden />
      {displayMessages.map((msg) => (
        <div
          key={msg.id}
          className={`build-ai-prompt-msg build-ai-prompt-msg--${msg.role}`}
        >
          <span className="build-ai-prompt-msg-label">
            {msg.role === "user" ? "You" : "Builder"}
          </span>
          <p className="build-ai-prompt-msg-text">{msg.content}</p>
        </div>
      ))}
      {isLoading && (
        <div className="build-ai-prompt-msg build-ai-prompt-msg--assistant build-ai-prompt-msg--typing">
          <span className="build-ai-prompt-msg-label">Builder</span>
          <p className="build-ai-prompt-msg-text">Thinking…</p>
        </div>
      )}
      </div>
    </div>
  );

  const inputDock = (
    <div className={`build-ai-prompt-dock ${chatAnchored ? "build-ai-prompt-dock--anchored" : ""} ${className}`.trim()}>
      <SuggestionMarquee
        disabled={disabled || isLoading}
        onPickPrompt={setValue}
      />
      <div className="build-ai-prompt-input-row">
        <div className="build-ai-prompt-inner">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleSubmit();
              }
            }}
            placeholder={inputPlaceholder}
            className="build-ai-prompt-input"
            disabled={disabled || isLoading}
            aria-label={awaitingAnswer ? "Answer for builder agent" : "Strategy description for AI builder"}
          />
          <button
            type="button"
            className="build-ai-prompt-submit"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
          >
            {isLoading ? "Sending..." : submitLabel}
          </button>
        </div>
        {onToggleWidgets ? (
          <button
            type="button"
            className="build-ai-prompt-widgets-btn build-ai-prompt-widgets-btn--outside"
            onClick={onToggleWidgets}
            title={widgetsVisible ? "Collapse dashboard" : "Show dashboard"}
            aria-label={widgetsVisible ? "Collapse dashboard" : "Show dashboard"}
            aria-expanded={widgetsVisible}
          >
            {widgetsVisible ? (
              <ChevronsDown className="build-ai-prompt-widgets-icon" strokeWidth={2} aria-hidden />
            ) : (
              <LayoutDashboard className="build-ai-prompt-widgets-icon" strokeWidth={2} aria-hidden />
            )}
          </button>
        ) : null}
      </div>
      {disclaimer && (
        <p className="build-ai-prompt-disclaimer">{disclaimer}</p>
      )}
    </div>
  );

  return (
    <div
      className={`build-hero-chat ${
        chatAnchored ? "build-hero-chat--anchored" : "build-hero-chat--centered"
      }`}
    >
      <div className={`build-ai-centered-column ${promptExpanded ? "build-ai-centered-column--active" : ""}`}>
        {isEmpty && !promptExpanded && (
          <div className="build-ai-tagline-block" aria-hidden={false}>
            <p className="build-ai-tagline-welcome">Welcome to the Siphon</p>
            <h2 className="build-ai-tagline">Fully  Confidential Execution Layer for the DeFi</h2>
            <p className="build-ai-tagline-sub">What are you up to today?</p>
          </div>
        )}
        {!isEmpty && threadContent}
        {inputDock}
      </div>
    </div>
  );
}
