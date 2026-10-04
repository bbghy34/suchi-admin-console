import PhoneConnectionHelp from '@/components/guide/PhoneConnectionHelp';

/**
 * One header for every console module: icon tile, title, help and badges on one line,
 * a short description, and the page's actions on the right. Modules that receive
 * data from employees' phones get the phone note right under the header.
 */
export default function ModuleHeader({ icon: Icon, title, description, help, badge, actions, children }) {
  return (
    <>
    <header className="module-header">
      <div className="flex min-w-0 items-start gap-3.5">
        {Icon ? (
          <span className="module-header-icon" aria-hidden="true">
            <Icon className="h-5 w-5" />
          </span>
        ) : null}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <h1 className="module-header-title">{title}</h1>
            {badge}
            {help}
          </div>
          {description ? <p className="module-header-desc">{description}</p> : null}
          {children}
        </div>
      </div>
      {actions ? <div className="module-header-actions">{actions}</div> : null}
    </header>
    <PhoneConnectionHelp />
    </>
  );
}
