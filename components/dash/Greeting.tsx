"use client";

import { useEffect, useState } from "react";

/**
 * Local to the reader, not the server. Rendered from the server hour first so
 * the markup is stable, then corrected on mount — otherwise everyone in Lagos
 * gets greeted on Virginia time.
 */
export default function Greeting({
  name,
  serverHour,
}: {
  name: string;
  serverHour: number;
}) {
  const pick = (h: number) =>
    h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";

  const [text, setText] = useState(() => pick(serverHour));

  useEffect(() => {
    setText(pick(new Date().getHours()));
  }, []);

  return (
    <h1 className="hello" suppressHydrationWarning>
      {text}, <em>{name}</em>
    </h1>
  );
}
