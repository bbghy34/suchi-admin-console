/**
 * One guide per screen. Copy names the control on that page and the one
 * consequence that is easy to miss.
 */
export const GUIDES = {
  employees: {
    title: 'Employees',
    lead: 'The list starts on people who can still sign in.',
    steps: [
      {
        title: 'Active is the default',
        body: 'Active Only hides anyone you just deactivated. Choose All Statuses to see both, or Inactive Only for deactivated people. Managers still see active employees only.',
      },
      {
        title: 'Deactivate blocks sign-in',
        body: 'Deactivate keeps the person, their attendance, and their documents. They cannot sign in until an admin activates them again.',
      },
    ],
  },
  projects: {
    title: 'Projects',
    lead: 'Progress photos are viewed here and uploaded on the site.',
    steps: [
      {
        title: 'Images loads this project',
        body: 'In Actions, Images shows every progress photo saved for this project, with the progress date on each one.',
      },
      {
        title: 'Upload from the site',
        body: 'This page does not add photos. Open the site, use its Images button, and save the field photo there. It then appears here with the same date.',
      },
    ],
  },
  sites: {
    title: 'Sites',
    lead: 'Each site holds its own progress photos and map point.',
    steps: [
      {
        title: 'Images is this site only',
        body: 'Images in Actions shows photos already saved here, with the progress date, project, latitude, and longitude.',
      },
      {
        title: 'Assign a project first',
        body: 'A new photo needs the site linked to a project, plus latitude and longitude. The file is stored with that progress record.',
      },
      {
        title: 'The project shows the same photo',
        body: 'Open that project and use Images. You will see this photo with the same progress date.',
      },
    ],
  },
  boqs: {
    title: 'BOQs',
    lead: 'Quantities belong to a project, then to line items.',
    steps: [
      {
        title: 'Create it on a project',
        body: 'A BOQ is tied to a project, and to a site when the quantities are for one location. Line items sit under that BOQ.',
      },
      {
        title: 'Excel adds the lines',
        body: 'Upload a sheet to add many items at once. Extra items are additions against one line, not a second BOQ.',
      },
      {
        title: 'Accept or reject an extra item',
        body: 'Click a request to open its details. An admin confirms the choice and adds remarks. Accept and Reject both keep the extra item on the line. Only a pending extra item can be decided.',
      },
      {
        title: 'Deactivate hides the BOQ',
        body: 'The BOQ and its items stay stored and drop off the normal list. An admin can show deactivated records and turn the BOQ back on.',
      },
    ],
  },
  attendance: {
    title: 'Attendance',
    lead: 'A day opens on check-in and closes on check-out.',
    steps: [
      {
        title: 'Check-in opens the day',
        body: 'It records the person, the site, and the time. A second check-in is refused while that day is still open.',
      },
      {
        title: 'Location is stored with the punch',
        body: 'The row keeps the GPS check and whether it fell outside the site radius. Check-out stores the end time and the hours worked.',
      },
      {
        title: 'Deactivate hides the row',
        body: 'The day is not deleted. Show deactivated, then activate the row, to see it on the default list again.',
      },
    ],
  },
  leaves: {
    title: 'Leave',
    lead: 'A request stays on file whether it is approved or not.',
    steps: [
      {
        title: 'New requests are pending',
        body: 'Submitting leave does not remove the person from attendance. It only creates a request.',
      },
      {
        title: 'Approve or reject keeps the row',
        body: 'A manager or admin records the decision on that same request. The row remains either way.',
      },
      {
        title: 'Deactivate only hides it',
        body: 'The leave stays in the database and drops off the normal list. Activate shows it again.',
      },
    ],
  },
  tenders: {
    title: 'Tenders',
    lead: 'This page reads tender IDs that already live on projects.',
    steps: [
      {
        title: 'There is no separate tender record',
        body: 'The list is projects that have a tender ID. Add or change that ID on the project, not here.',
      },
      {
        title: 'The key status is read-only',
        body: 'The panel tells you whether a server key is set. You cannot type the key on this page, and a saved key is never shown.',
      },
      {
        title: 'Files live on two other pages',
        body: 'Tender portal lists the files. Tender upload, at /boatbrothers/tenders, is where an admin adds a tender file or a document. Each upload is one row in that table.',
      },
    ],
  },
  'tender-portal': {
    title: 'Tender portal',
    lead: 'This table is every file an admin has added for a tender.',
    steps: [
      {
        title: 'Rows come from tender upload',
        body: 'An admin adds a tender file or a document at /boatbrothers/tenders. That save is one row here.',
      },
      {
        title: 'Download from the table',
        body: 'Open the file name. That link is the file saved for that tender.',
      },
    ],
  },
  'tender-admin': {
    title: 'Tender upload',
    lead: 'This page is only for admins, at /boatbrothers/tenders.',
    steps: [
      {
        title: 'Each upload is one row',
        body: 'Pick the tender, then upload the tender file or a supporting document. The row appears in this table and on the tender portal.',
      },
      {
        title: 'The project needs a tender ID',
        body: 'Only projects that already have a tender ID appear here. Add that ID on the project first.',
      },
    ],
  },
  reports: {
    title: 'Reports',
    lead: 'Each tab is a live table, not a saved snapshot.',
    steps: [
      {
        title: 'The tab chooses the table',
        body: 'Attendance, Project, Contractor, Employee, and Leave each have their own columns and totals.',
      },
      {
        title: 'Deactivated rows',
        body: 'Attendance, projects, contractors, and leave requests omit deactivated records. The employee tab still lists people and marks each one Active or Inactive.',
      },
      {
        title: 'Export is this tab only',
        body: 'Export CSV downloads the table you are looking at. It does not change any records.',
      },
    ],
  },
  departments: {
    title: 'Departments',
    lead: 'Hiding a department does not remove the people in it.',
    steps: [
      {
        title: 'The list is active departments',
        body: 'Turn on Show deactivated to see hidden ones. Only an admin gets that switch.',
      },
      {
        title: 'Deactivate hides the name',
        body: 'The department drops out of pick-lists. Employees already assigned to it stay linked. Activate puts the name back.',
      },
    ],
  },
  designations: {
    title: 'Designations',
    lead: 'Job titles stay on file after you hide them.',
    steps: [
      {
        title: 'The list is active titles',
        body: 'Show deactivated brings hidden titles back into this table. Only an admin can do that.',
      },
      {
        title: 'Deactivate does not unassign people',
        body: 'The title is hidden from new selections. Employees who already have it keep that designation until you change them. Activate restores the title.',
      },
    ],
  },
  contractors: {
    title: 'Contractors',
    lead: 'A contractor can leave the list without losing their projects.',
    steps: [
      {
        title: 'The list is active contractors',
        body: 'Show deactivated reveals hidden contractors. Only an admin sees that switch.',
      },
      {
        title: 'Projects stay linked',
        body: 'Deactivate hides the contractor from new choices. Work already tied to them remains. Activate shows the contractor again.',
      },
    ],
  },
  firms: {
    title: 'Firms',
    lead: 'A firm is your own company record, not a contractor.',
    steps: [
      {
        title: 'The list is active firms',
        body: 'Show deactivated lists firms that were hidden. Only an admin can turn that on.',
      },
      {
        title: 'Deactivate keeps the firm',
        body: 'The name, GSTIN, and links stay stored. The firm is hidden from normal lists until an admin activates it.',
      },
    ],
  },
  warehouse: {
    title: 'Warehouse',
    lead: 'Stock changes only when you post a receipt, an issue, or an adjustment.',
    steps: [
      {
        title: 'Set up masters first',
        body: 'Add a category, a unit, and a supplier before a material. A receipt or issue needs a material that already exists.',
      },
      {
        title: 'A request is not a movement',
        body: 'Goods receipt increases quantity. An issue or a decrease adjustment reduces it. A material request does not move stock until you issue it.',
      },
      {
        title: 'Low stock needs a minimum',
        body: 'Set a minimum above zero on the material. When on-hand quantity reaches it, admins see a Low stock count in the top bar.',
      },
    ],
  },
  'warehouse-materials': {
    title: 'Material master',
    lead: 'Every later stock screen depends on this record.',
    steps: [
      {
        title: 'Code, category, and unit',
        body: 'Each material needs a unique code, one category, and one unit. Create the category and unit first if those lists are empty.',
      },
      {
        title: 'Minimum stock is the alert',
        body: 'On-hand quantity at or below this number is low stock. A minimum of 0 never raises an alert.',
      },
      {
        title: 'Deactivate hides it from stock',
        body: 'It drops out of receipts, issues, and current stock. The quantity already stored is kept. Activate puts it back.',
      },
    ],
  },
  'warehouse-categories': {
    title: 'Categories',
    lead: 'Categories group materials, such as cement or steel.',
    steps: [
      {
        title: 'Add the category before the material',
        body: 'A material cannot be saved without a category. Use Add category here, then pick it on Materials.',
      },
      {
        title: 'Search filters this list',
        body: 'Search matches the category name and description on this page. It does not search materials.',
      },
      {
        title: 'Deactivate hides the category',
        body: 'Show deactivated, then Activate, brings it back. Materials that already use it stay stored.',
      },
    ],
  },
  'warehouse-units': {
    title: 'Units',
    lead: 'A unit is the measure on a material, a receipt, and an issue.',
    steps: [
      {
        title: 'Name and symbol are both required',
        body: 'Example: bag and BAG, or kilogram and kg. Materials pick this unit when they are created.',
      },
      {
        title: 'Deactivate hides it from new materials',
        body: 'Show deactivated to find it, then Activate. Quantities already posted keep the unit they were saved with.',
      },
    ],
  },
  'warehouse-suppliers': {
    title: 'Suppliers',
    lead: 'Suppliers are chosen when you record a goods receipt.',
    steps: [
      {
        title: 'Name is the only required field',
        body: 'Phone, email, GST number, and address are optional. The name is what you pick on Inward (GRN).',
      },
      {
        title: 'Deactivate hides them from new receipts',
        body: 'Receipts already posted keep the supplier name. Show deactivated, then Activate, to use them again.',
      },
    ],
  },
  'warehouse-stock': {
    title: 'Current stock',
    lead: 'On-hand quantity is calculated. You do not type it here.',
    steps: [
      {
        title: 'This is the live balance',
        body: 'It is what remains after every receipt, issue, and adjustment.',
      },
      {
        title: 'Low uses the material minimum',
        body: 'Status is Low when the minimum is above zero and the quantity on hand has reached it.',
      },
      {
        title: 'Inactive materials are hidden',
        body: 'Only active materials are listed. Activate the material on Materials to see it here again.',
      },
    ],
  },
  'warehouse-ledger': {
    title: 'Stock ledger',
    lead: 'Use this when a balance looks wrong.',
    steps: [
      {
        title: 'Lines are written for you',
        body: 'Receipts, issues, and adjustments appear here automatically. You cannot add a ledger line by hand.',
      },
      {
        title: 'The sign is the direction',
        body: 'A positive quantity added stock. A negative quantity removed it. Balance is the quantity after that line.',
      },
      {
        title: 'Read from the latest line back',
        body: 'The newest line is the last change to current stock. Follow the lines backward to see which receipt or issue moved it.',
      },
    ],
  },
  'warehouse-adjustments': {
    title: 'Stock adjustment',
    lead: 'Use this after a physical count, not to retype a receipt.',
    steps: [
      {
        title: 'Increase or decrease',
        body: 'Increase adds the quantity you counted in. Decrease removes quantity that is no longer there.',
      },
      {
        title: 'A decrease cannot pass zero',
        body: 'If the decrease is larger than the quantity on hand, it is refused and stock stays as it was.',
      },
      {
        title: 'The reason is kept',
        body: 'The adjustment and its reason are written to the stock ledger so the change can be traced later.',
      },
    ],
  },
  'warehouse-low-stock': {
    title: 'Low stock',
    lead: 'Only materials at or under their minimum are listed.',
    steps: [
      {
        title: 'The minimum must be above zero',
        body: 'A minimum of 0 never appears here, even if the quantity on hand is zero.',
      },
      {
        title: 'Admins see the same count',
        body: 'The top bar shows how many materials are low until the quantity is above the minimum again.',
      },
      {
        title: 'How to clear a row',
        body: 'Receive goods, post an increase adjustment, or raise the minimum on the material.',
      },
    ],
  },
  'warehouse-inward': {
    title: 'Material inward',
    lead: 'Saving a receipt increases stock immediately.',
    steps: [
      {
        title: 'Supplier, material, quantity, rate',
        body: 'Choose the supplier and material, enter the quantity and the rate in rupees, and save. On-hand stock goes up by that quantity.',
      },
      {
        title: 'The rate feeds valuation',
        body: 'Stock valuation uses the average of these receipt rates, multiplied by the quantity still on hand.',
      },
      {
        title: 'Fix a wrong count with an adjustment',
        body: 'The receipt is posted as soon as you save it. If the quantity was wrong, use Stock Adjustment. Do not expect to edit this receipt.',
      },
    ],
  },
  'warehouse-outward': {
    title: 'Material issue',
    lead: 'An issue takes quantity off the shelf as soon as you save.',
    steps: [
      {
        title: 'Stock drops on save',
        body: 'The quantity is removed from the material and written to the ledger as an outward movement.',
      },
      {
        title: 'Project and site must match',
        body: 'You can issue to a project, a site, or both. If you pick both, the site has to belong to that project.',
      },
      {
        title: 'Short stock is refused',
        body: 'If the quantity is higher than what is on hand, nothing is saved and the balance does not change.',
      },
    ],
  },
  'warehouse-requests': {
    title: 'Material requests',
    lead: 'Asking for material does not move it.',
    steps: [
      {
        title: 'Pending leaves stock alone',
        body: 'A request only records the quantity you want. Current stock stays the same until someone issues it.',
      },
      {
        title: 'Approve or reject first',
        body: 'Approve accepts the request. Reject closes it. Neither one changes the quantity on hand.',
      },
      {
        title: 'Issue is the movement',
        body: 'Issue writes an outward record and reduces stock. Issuing the same request again is refused, and so is an issue when stock is short.',
      },
    ],
  },
  settings: {
    title: 'Settings',
    lead: 'Appearance stays on this browser. The password change applies to the account.',
    steps: [
      {
        title: 'Toggles apply immediately',
        body: 'Theme, density, help, table stripes, tender links, and which reports appear change as soon as you switch them. They are saved for this browser.',
      },
      {
        title: 'Sign out can ask first',
        body: 'Confirm before sign out asks on the top bar and on this page. Reset appearance puts the workspace back to the dark, comfortable default.',
      },
    ],
  },
  'warehouse-reports': {
    title: 'Warehouse reports',
    lead: 'These figures come from posted receipts, issues, and the current balance.',
    steps: [
      {
        title: 'Pick the report in the sidebar',
        body: 'Stock, Inward, Outward, Consumption, and Valuation reports are separate pages. Each one reads movements that were already saved.',
      },
      {
        title: 'Consumption is what was issued',
        body: 'It adds up every issue for that material. It does not include what was received.',
      },
      {
        title: 'Valuation uses the average rate',
        body: 'Value is the quantity on hand multiplied by the average rate from goods receipts. A material with no receipt rate is valued at zero.',
      },
      {
        title: 'Export or print the table you see',
        body: 'Export CSV downloads the rows on screen, including a search filter. Print opens that same table for paper or a PDF. Neither action changes stock.',
      },
    ],
  },
};
