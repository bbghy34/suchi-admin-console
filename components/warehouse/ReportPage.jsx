'use client';

import ReportView from '@/components/warehouse/ReportView';

const pages = {
  stock: {
    title: 'Stock Report',
    description: 'On-hand quantity against the minimum stock for each material.',
    columns: [
      { key: 'code', label: 'Code' },
      { key: 'name', label: 'Material' },
      { key: 'category', label: 'Category' },
      { key: 'quantity', label: 'On hand', kind: 'qty' },
      { key: 'unit', label: 'Unit' },
      { key: 'minStock', label: 'Minimum', kind: 'qty' },
    ],
  },
  inward: {
    title: 'Inward Report',
    description: 'Goods receipt notes with quantity, rate, and amount.',
    columns: [
      { key: 'grnNumber', label: 'GRN' },
      { key: 'receivedAt', label: 'Date', kind: 'date' },
      { key: 'supplier', label: 'Supplier' },
      { key: 'material', label: 'Material' },
      { key: 'quantity', label: 'Qty', kind: 'qty' },
      { key: 'rate', label: 'Rate', kind: 'money' },
      { key: 'amount', label: 'Amount', kind: 'money' },
    ],
  },
  outward: {
    title: 'Outward Report',
    description: 'Material issued to projects and sites.',
    columns: [
      { key: 'issueNumber', label: 'Issue' },
      { key: 'issuedAt', label: 'Date', kind: 'date' },
      { key: 'material', label: 'Material' },
      { key: 'quantity', label: 'Qty', kind: 'qty' },
      { key: 'project', label: 'Project' },
      { key: 'site', label: 'Site' },
      { key: 'purpose', label: 'Purpose' },
    ],
  },
  consumption: {
    title: 'Consumption Report',
    description: 'Total quantity issued for each material.',
    columns: [
      { key: 'material', label: 'Material' },
      { key: 'quantity', label: 'Issued quantity', kind: 'qty' },
      { key: 'unit', label: 'Unit' },
    ],
  },
  valuation: {
    title: 'Valuation Report',
    description: 'Current quantity valued at the average receipt rate.',
    columns: [
      { key: 'code', label: 'Code' },
      { key: 'name', label: 'Material' },
      { key: 'quantity', label: 'On hand', kind: 'qty' },
      { key: 'averageRate', label: 'Average rate', kind: 'money' },
      { key: 'value', label: 'Value', kind: 'money' },
    ],
  },
};

export default function WarehouseReportPage({ type }) {
  const page = pages[type];
  return <ReportView type={type} title={page.title} description={page.description} columns={page.columns} />;
}
