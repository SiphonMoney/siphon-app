"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SIPHON_LOGO_PATH } from "@/components/theme/GlitchLogo";
import styles from "./onboarding.module.css";

const SCREENS: ReadonlyArray<{
  hero?: boolean;
  title?: string;
  lines?: readonly string[];
}> = [
  { hero: true },
 
  {
    title: "TO MOVE UNSEEN",
    lines: [
      "Nothing to watch. Everything to take.",
    ],
  },
  {
    title: "TO BUILD WITHOUT CODE",
    lines: [
      "No team. No setup. Describe it. Use it.",
    ],
  },
 
  {
    title: "TO MAKE IT YOURS",
    lines: [
      "Don't adapt. Shape it. This space is yours.",
    ],
  },
  {
    title: "TIME IS NOW",
    lines: [
      "It's open. It's alpha. It's sharp.",
    ],
  },
];

const FADE_MS = 450;
const OVERLAY_FADE_MS = 600;
const WHEEL_COOLDOWN_MS = 700;

interface WelcomeOnboardingProps {
  onComplete: () => void;
}

export default function WelcomeOnboarding({ onComplete }: WelcomeOnboardingProps) {
  const [step, setStep] = useState(0);
  const [screenPhase, setScreenPhase] = useState<"entering" | "visible" | "exiting">("entering");
  const [overlayExiting, setOverlayExiting] = useState(false);
  const wheelLockedRef = useRef(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  const screen = SCREENS[step];

  useEffect(() => {
    const t = requestAnimationFrame(() => setScreenPhase("visible"));
    return () => cancelAnimationFrame(t);
  }, []);

  const finish = useCallback(() => {
    setOverlayExiting(true);
    window.setTimeout(onComplete, OVERLAY_FADE_MS);
  }, [onComplete]);

  const transitionTo = useCallback(
    (nextStep: number) => {
      if (wheelLockedRef.current || screenPhase !== "visible") return;
      wheelLockedRef.current = true;

      setScreenPhase("exiting");
      window.setTimeout(() => {
        setStep(nextStep);
        setScreenPhase("entering");
        requestAnimationFrame(() => {
          setScreenPhase("visible");
          window.setTimeout(() => {
            wheelLockedRef.current = false;
          }, WHEEL_COOLDOWN_MS);
        });
      }, FADE_MS);
    },
    [screenPhase],
  );

  const advance = useCallback(() => {
    if (step >= SCREENS.length - 1) {
      if (wheelLockedRef.current || screenPhase !== "visible") return;
      wheelLockedRef.current = true;
      setScreenPhase("exiting");
      window.setTimeout(finish, FADE_MS);
      return;
    }
    transitionTo(step + 1);
  }, [step, screenPhase, finish, transitionTo]);

  const retreat = useCallback(() => {
    if (step <= 0) return;
    transitionTo(step - 1);
  }, [step, transitionTo]);

  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (Math.abs(e.deltaY) < 20) return;
      if (e.deltaY > 0) advance();
      else retreat();
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [advance, retreat]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        advance();
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        retreat();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, retreat]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const screenClass = [
    styles.screen,
    screenPhase === "visible" && styles.screenVisible,
    screenPhase === "exiting" && styles.screenExiting,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={overlayRef}
      className={`${styles.overlay} ${overlayExiting ? styles.overlayExiting : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Siphon"
    >
      <div className={styles.contentWrap}>
        <div className={screenClass}>
          {screen.hero ? (
            <div className={styles.hero}>
              <svg className={styles.heroLogo} viewBox="0 0 97.34 80" aria-hidden>
                <path d={SIPHON_LOGO_PATH} fill="currentColor" />
              </svg>
              <p className={styles.timeLine}>it&apos;s time.</p>
            </div>
          ) : (
            <div className={styles.copyStack}>
              {screen.title && <h1 className={styles.blockTitle}>{screen.title}</h1>}
              {screen.lines?.map((line) => (
                <p key={line} className={styles.blockBody}>
                  {line}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      <footer className={styles.footer}>
        <span className={styles.scrollTip}>scroll</span>
      </footer>
    </div>
  );
}
