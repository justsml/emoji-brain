/**
 * The export worker reports plain sentences ("Prepared 40 of 366 emojis…").
 * This turns them into what a progress display needs: a stage name that changes
 * only when the work does, an optional detail that changes constantly, and a
 * fraction where there is one to give. Anything unrecognised passes through as
 * its own label with no fraction, so a new message never breaks the display.
 */
export interface ExportProgress {
  /** The stage. Stable between updates, so assistive tech can announce changes. */
  label: string;
  /** The moving part, e.g. "40 of 366". */
  detail?: string;
  /** 0 to 1, or null when the stage has no measurable end. */
  fraction: number | null;
}

export function parseExportProgress(text: string): ExportProgress {
  const counted = /^(?:Prepared|Preparing) (\d+) of (\d+) emojis/.exec(text);
  if (counted) {
    const done = Number(counted[1]), total = Number(counted[2]);
    return { label: 'Gathering images', detail: `${done.toLocaleString()} of ${total.toLocaleString()}`, fraction: total > 0 ? Math.min(1, done / total) : null };
  }
  const packing = /^Packing ZIP · (\d+)%/.exec(text);
  if (packing) return { label: 'Packing the ZIP', detail: `${packing[1]}%`, fraction: Number(packing[1]) / 100 };
  if (text.startsWith('Checking ')) return { label: 'Fitting the script under Slack’s size limit', fraction: null };
  if (text.startsWith('Copying script')) return { label: 'Copying to your clipboard', fraction: null };
  return { label: text.replace(/…$/, ''), fraction: null };
}

/** How the wait is described as it drags on. Quiet at first; honest later. */
export function waitingHint(elapsedMs: number): string | null {
  if (elapsedMs >= 20_000) return 'Still going. If your connection is slow, cancel and pick a smaller size or fewer emojis.';
  if (elapsedMs >= 7_000) return 'Large sheets take a few seconds to gather. You can cancel at any time.';
  return null;
}
