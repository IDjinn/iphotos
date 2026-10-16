import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useConfirmStore } from '@/stores/confirm';

/**
 * Renders the global glass confirm dialog driven by `useConfirmStore`.
 * Mounted once in the root layout; screens call `confirmDialog(...)`
 * instead of `Alert.alert`. A RN Modal, so it stacks above the viewer.
 */
export function ConfirmDialogHost() {
  const request = useConfirmStore((s) => s.request);
  const settle = useConfirmStore((s) => s.settle);

  return (
    <ConfirmDialog
      visible={request !== null}
      title={request?.title ?? ''}
      message={request?.message}
      confirmLabel={request?.confirmLabel ?? ''}
      cancelLabel={request?.cancelLabel ?? ''}
      destructive={request?.destructive}
      onConfirm={() => request && settle(request.id, true)}
      onCancel={() => request && settle(request.id, false)}
    />
  );
}
