"use client";

import { useEffect, useState } from "react";

const FULL_TEXT = "<Shepherd>";
const TYPE_SPEED = 90;
const START_DELAY = 400;

export function HeroText() {
  const [displayed, setDisplayed] = useState("");
  const [started, setStarted] = useState(false);

  // Initial delay before typing begins
  useEffect(() => {
    const t = setTimeout(() => setStarted(true), START_DELAY);
    return () => clearTimeout(t);
  }, []);

  // Type one character at a time
  useEffect(() => {
    if (!started) return;
    if (displayed.length >= FULL_TEXT.length) return;

    const t = setTimeout(() => {
      setDisplayed(FULL_TEXT.slice(0, displayed.length + 1));
    }, TYPE_SPEED);

    return () => clearTimeout(t);
  }, [started, displayed]);

  const done = displayed.length === FULL_TEXT.length;

  return (
    <h1 className="font-mono text-6xl font-bold tracking-tight sm:text-7xl">
      {/* Colour the angle brackets differently */}
      {displayed.split("").map((char, i) => {
        const isBracket = char === "<" || char === ">";
        return (
          <span
            key={i}
            className={isBracket ? "text-base-content/30" : "text-base-content"}
          >
            {char}
          </span>
        );
      })}

      {/* Always reserve cursor space — just hide it when done */}
      <span
        className={`inline-block w-[3px] h-[1em] align-middle ml-1 rounded-sm bg-base-content transition-opacity duration-150 ${
          done ? "opacity-0" : "opacity-100"
        }`}
      />
    </h1>
  );
}
