'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { BookOpen, Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePreferences } from '@/components/providers/PreferencesProvider';
import { GUIDES } from './guides';

function seenKey(id) {
  return `suchii-guide:${id}`;
}

export default function WorkflowGuide({ id }) {
  const { prefs } = usePreferences();
  const guide = GUIDES[id];
  const panelId = useId();
  const panelRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [seen, setSeen] = useState(true);

  useEffect(() => {
    if (!guide) return undefined;
    const already = window.localStorage.getItem(seenKey(id)) === '1';
    setSeen(already);
    setStep(0);
    setOpen(false);
    return undefined;
  }, [id, guide]);

  useEffect(() => {
    if (!open || !guide) return undefined;
    const onKey = (event) => {
      const panel = panelRef.current;
      if (!panel || !panel.contains(document.activeElement)) return;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setStep((value) => Math.min(guide.steps.length - 1, value + 1));
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setStep((value) => Math.max(0, value - 1));
      } else if (event.key === 'Escape') {
        event.preventDefault();
        window.localStorage.setItem(seenKey(id), '1');
        setSeen(true);
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, guide, id]);

  if (!guide || !prefs.showHelp) return null;

  const current = guide.steps[step];
  const last = step === guide.steps.length - 1;

  const remember = () => {
    window.localStorage.setItem(seenKey(id), '1');
    setSeen(true);
  };

  const dismiss = () => {
    remember();
    setOpen(false);
  };

  const finish = () => {
    remember();
    setOpen(false);
    setStep(0);
  };

  return (
    <div className="page-help max-w-xl">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? 'Hide help for this page' : 'Help for this page'}
        title="Help for this page"
        onClick={() => {
          setOpen((value) => {
            if (value) return false;
            setStep(0);
            return true;
          });
        }}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors',
          open
            ? 'border-[#7986cb] bg-[var(--md-surface)] text-[var(--md-on)]'
            : 'border-[var(--md-border-strong)] bg-[var(--md-surface)] text-[var(--md-on)] hover:border-[#7986cb] hover:text-[var(--md-on)]'
        )}
      >
        <BookOpen className="h-3 w-3" aria-hidden="true" />
        Help
        {!seen && !open && (
          <span className="h-1.5 w-1.5 rounded-full bg-[#ffcc80]" aria-hidden="true" />
        )}
      </button>

      {open && (
        <section
          ref={panelRef}
          id={panelId}
          tabIndex={-1}
          aria-label={`${guide.title} guide`}
          className="mt-2 overflow-hidden rounded-md outline-none"
          style={{ background: 'var(--md-sidebar)', border: '1px solid var(--md-border)', borderLeft: '3px solid #7986cb' }}
        >
          <div className="flex items-start justify-between gap-3 px-3 pb-2 pt-2.5">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: '#9fa8da' }}>
                Guide
              </p>
              <h2 className="mt-0.5 text-sm font-semibold" style={{ color: 'var(--md-on)' }}>
                {guide.title}
              </h2>
              <p className="mt-0.5 text-xs leading-5" style={{ color: 'var(--md-muted)' }}>
                {guide.lead}
              </p>
            </div>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-md p-1 transition-colors hover:bg-[var(--md-surface2)]"
              style={{ color: 'var(--md-dim)' }}
              aria-label="Close guide"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-0 border-t sm:grid-cols-[10.5rem_minmax(0,1fr)]" style={{ borderColor: 'var(--md-border)' }}>
            <div className="px-1.5 py-2" role="tablist" aria-label="Guide steps" style={{ background: '#22232b' }}>
              {guide.steps.map((item, index) => {
                const selected = index === step;
                return (
                  <button
                    key={item.title}
                    type="button"
                    role="tab"
                    id={`${panelId}-tab-${index}`}
                    aria-selected={selected}
                    aria-controls={`${panelId}-panel`}
                    onClick={() => setStep(index)}
                    className="flex w-full items-start gap-1.5 rounded-md px-1.5 py-1.5 text-left text-[11px] leading-4"
                    style={{
                      background: selected ? 'var(--md-surface2)' : 'transparent',
                      color: selected ? 'var(--md-on)' : 'var(--md-dim)',
                    }}
                  >
                    <span className="mt-0.5 w-4 shrink-0 tabular-nums" style={{ color: selected ? '#9fa8da' : 'var(--md-border-strong)' }}>
                      {index + 1}
                    </span>
                    <span>{item.title}</span>
                  </button>
                );
              })}
            </div>

            <div
              id={`${panelId}-panel`}
              role="tabpanel"
              aria-labelledby={`${panelId}-tab-${step}`}
              className="px-3 py-2.5"
            >
              <h3 className="text-xs font-semibold" style={{ color: 'var(--md-on)' }}>
                {current.title}
              </h3>
              <p className="mt-1.5 text-xs leading-5" style={{ color: 'var(--md-on)' }}>
                {current.body}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t px-3 py-2" style={{ borderColor: 'var(--md-border)' }}>
            <button
              type="button"
              disabled={step === 0}
              onClick={() => setStep((value) => Math.max(0, value - 1))}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs disabled:opacity-40"
              style={{ color: 'var(--md-muted)' }}
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Back
            </button>
            <p className="text-[11px] tabular-nums" style={{ color: 'var(--md-dim)' }}>
              {step + 1} / {guide.steps.length}
            </p>
            {last ? (
              <button
                type="button"
                onClick={finish}
                className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold text-white"
                style={{ background: '#5c6bc0' }}
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                Done
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStep((value) => value + 1)}
                className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold text-white"
                style={{ background: '#5c6bc0' }}
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
