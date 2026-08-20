"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

interface Note {
  id: number;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
}

/**
 * Live notification bar. Seeded server-side, then kept current over Supabase
 * Realtime — RLS means the subscription only ever delivers this user's rows.
 */
export default function NotificationBell({ initial }: { initial: Note[] }) {
  const [notes, setNotes] = useState<Note[]>(initial);
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const unread = notes.filter((n) => !n.read_at).length;

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    void (async () => {
      const sb = await supabaseBrowser();
      if (!sb) return; // no database connected — static list, no live updates
      const ch = sb
      .channel("notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (p) => setNotes((prev) => [p.new as Note, ...prev].slice(0, 40)),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications" },
        (p) =>
          setNotes((prev) =>
            prev.map((n) => (n.id === (p.new as Note).id ? (p.new as Note) : n)),
          ),
      )
        .subscribe();
      cleanup = () => {
        sb.removeChannel(ch);
      };
    })();
    return () => cleanup?.();
  }, []);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!panel.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  async function markRead() {
    if (unread === 0) return;
    const sb = await supabaseBrowser();
    if (!sb) return;
    await sb.rpc("mark_notifications_read");
    setNotes((prev) =>
      prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })),
    );
  }

  return (
    <div className="bell" ref={panel}>
      <button
        className="bell__btn"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) void markRead();
        }}
        aria-expanded={open}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
      >
        <span className="mono">Alerts</span>
        {unread > 0 && <span className="bell__count mono">{unread}</span>}
      </button>

      {open && (
        <div className="bell__panel" role="region" aria-label="Notifications">
          {notes.length === 0 ? (
            <p className="bell__empty mono">Nothing yet.</p>
          ) : (
            <ul className="bell__list">
              {notes.map((n) => (
                <li key={n.id} className={n.read_at ? "" : "is-unread"}>
                  <a href={n.href ?? "#"}>
                    <span className="mono bell__kind">
                      {n.kind.replace(/_/g, " ")}
                    </span>
                    <span className="bell__title">{n.title}</span>
                    {n.body && <span className="bell__body">{n.body}</span>}
                    <span className="mono bell__when">
                      {new Date(n.created_at).toLocaleString("en-US")}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
