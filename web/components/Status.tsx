import { STATUS } from "@/lib/abi";

export default function StatusPill({ status }: { status: number }) {
  const name = STATUS[status] ?? "Unknown";
  return <span className={`pill ${name.toLowerCase()}`}>{name}</span>;
}
