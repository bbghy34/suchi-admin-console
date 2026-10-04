export const PHONE_WORKFLOWS = {
  '/attendance': { title: 'Check-ins and check-outs come from employees’ phones', detail: 'Check-ins carry the employee, site and time, plus the phone GPS position when the phone shares it. Review flagged or far-away check-ins.' },
  '/progress': { badge: 'Phone media', title: 'Site photos come from employees’ phones', detail: 'Photos arrive with the project, site and phone GPS position attached.' },
  '/boqs': { badge: 'Phone media', title: 'Delivery photos and quantities come from employees’ phones', detail: 'Open an item’s delivery photos to review what was sent. BOQ setup and Excel import stay in this console.' },
  '/leaves': { title: 'Leave requests come from employees’ phones', detail: 'Requests arrive with the employee, dates and reason. Approve or reject them here.' },
  '/sites': { badge: 'Used by phones', title: 'Phones use these site settings', detail: 'Phones use these coordinates and the attendance radius to flag check-ins made away from the site.' },
  '/site-expenses': { badge: 'Phone or console', title: 'Site expenses can come from employees’ phones', detail: 'Expenses are shared between phones and this console. Check the site, the person who added it and the time.' },
};
export function phoneWorkflow(pathname) { return PHONE_WORKFLOWS[pathname] || null; }
