import { Check, Download, Loader2, Save, Search, ShieldCheck, X } from 'lucide-react';
import { importStageItems } from '@/lib/desk/portal-import/stages.mjs';

const STEP = {
  find: { label: 'Find notice', icon: Search, active: 'Opening the official notice' },
  captcha: { label: 'Portal check', icon: ShieldCheck, active: 'Solving the portal CAPTCHA' },
  download: { label: 'Download files', icon: Download, active: 'Fetching the original files' },
  save: { label: 'Save to desk', icon: Save, active: 'Saving files and reading text' },
};

const STATE_TEXT = {
  done: 'Done',
  stopped: 'Stopped here',
  skipped: 'Not needed',
  reused: 'Saved already',
  unobserved: 'Done',
};

function caption(item) {
  if (item.state === 'active') return STEP[item.stage]?.active || 'In progress';
  if (item.state === 'pending') return item.stage === 'captcha' ? 'Only if the portal asks' : 'Waiting';
  return STATE_TEXT[item.state] || '—';
}

/** Actual visited stages only; no guessed percentage or CAPTCHA attempt total. */
export function ImportStageTrack({ stage, captchaAttempt, history = [], status = 'RUNNING', result }) {
  const items = importStageItems({ stage, captchaAttempt, stageHistory: history, status, result });
  return (
    <ol aria-label="Official retrieval stages" className="d-steps">
      {items.map((item, index) => {
        const meta = STEP[item.stage] || { label: item.label, icon: Search };
        const Icon = item.state === 'done' || item.state === 'unobserved' ? Check : item.state === 'stopped' ? X : meta.icon;
        const done = ['done', 'unobserved', 'reused', 'skipped'].includes(item.state);
        return (
          <li
            key={item.stage}
            aria-current={item.state === 'active' ? 'step' : undefined}
            className="d-step"
            data-state={item.state}
            data-line={index < items.length - 1 ? (done ? 'done' : 'todo') : undefined}
          >
            <span className="d-step-dot" aria-hidden="true">
              {item.state === 'active' ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />}
            </span>
            <span className="d-step-text">
              <span className="d-step-label">{meta.label}</span>
              <span className="d-step-caption">
                {caption(item)}
                {item.attempt ? ` · attempt ${item.attempt}` : ''}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
