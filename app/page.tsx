// Root route — the demo now starts on the ops chat (brief §3, DEMO_THESIS.md).
// Kept as a real page (not deleted) because components/shell/reset-control.tsx
// hard-navigates to "/" on every reset; without this redirect that lands on a 404.
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/ops");
}
