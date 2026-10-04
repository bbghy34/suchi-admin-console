import AsyncStatus from '@/components/ui/AsyncStatus';
export default function Loading() {
  return <div className="p-6"><AsyncStatus message="Opening the page…" description="Loading the module and checking access to its records." /></div>;
}
