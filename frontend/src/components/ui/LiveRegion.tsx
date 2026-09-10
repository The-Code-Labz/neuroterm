import { useLiveRegionStore } from '../../store/live-region-store';

/** Visually-hidden polite announcer. Mount exactly once (in AppShell). */
export default function LiveRegion(): JSX.Element {
  const message = useLiveRegionStore((s) => s.message);
  const seq = useLiveRegionStore((s) => s.seq);
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {seq > 0 ? message : ''}
    </div>
  );
}
