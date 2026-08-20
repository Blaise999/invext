"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "./auth";
import { isDemo } from "./demo";
import { markNotificationsRead } from "./ledger";

/** Marks everything unread as read. Idempotent — returns how many changed. */
export async function readAllNotifications(): Promise<{ read: number }> {
  if (await isDemo()) return { read: 0 };
  const user = await currentUser();
  if (!user) return { read: 0 };
  const read = await markNotificationsRead(user.id);
  if (read) revalidatePath("/dashboard", "layout");
  return { read };
}
