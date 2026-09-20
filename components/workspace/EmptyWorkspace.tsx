import { DashedEmptySlot } from '@/components/workspace/DashedEmptySlot';

export function EmptyWorkspace() {
  return (
    <DashedEmptySlot
      label="Workspace is empty"
      hint="Select a client or portfolio in the focus chip. CRM, optimizer, and news are out of scope."
    />
  );
}
