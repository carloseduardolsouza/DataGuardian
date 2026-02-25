import { useMemo, useState } from 'react';
import CriticalApprovalModal from '../ui/dialogs/CriticalApprovalModal/CriticalApprovalModal';
import { ApiRequestError, type CriticalApprovalAction, type CriticalAuthHeaders } from '../services/api';

interface RunOptions {
  action: CriticalApprovalAction;
  actionLabel: string;
  resourceType?: string | null;
  resourceId?: string | null;
  payload?: Record<string, unknown>;
  requestApprovalFirst?: boolean;
  execute: (auth?: CriticalAuthHeaders) => Promise<void>;
  onSuccess?: () => Promise<void> | void;
}

interface PendingAction {
  action: CriticalApprovalAction;
  actionLabel: string;
  resourceType?: string | null;
  resourceId?: string | null;
  payload?: Record<string, unknown>;
  execute: (auth?: CriticalAuthHeaders) => Promise<void>;
  onSuccess?: () => Promise<void> | void;
}

interface UseCriticalActionOptions {
  isAdmin?: boolean;
}

export function useCriticalAction(options?: UseCriticalActionOptions) {
  const isAdmin = options?.isAdmin ?? false;
  const [pending, setPending] = useState<PendingAction | null>(null);

  const run = async (options: RunOptions) => {
    if (options.requestApprovalFirst && !isAdmin) {
      setPending({
        action: options.action,
        actionLabel: options.actionLabel,
        resourceType: options.resourceType,
        resourceId: options.resourceId,
        payload: options.payload,
        execute: options.execute,
        onSuccess: options.onSuccess,
      });
      return false;
    }

    try {
      await options.execute();
      await options.onSuccess?.();
      return true;
    } catch (err) {
      const isCriticalApprovalRequired = err instanceof ApiRequestError
        && (err.error === 'CRITICAL_OPERATION_APPROVAL_REQUIRED' || err.status === 428);

      if (isCriticalApprovalRequired) {
        setPending({
          action: options.action,
          actionLabel: options.actionLabel,
          resourceType: options.resourceType,
          resourceId: options.resourceId,
          payload: options.payload,
          execute: options.execute,
          onSuccess: options.onSuccess,
        });
        return false;
      }
      throw err;
    }
  };

  const modal = useMemo(() => {
    if (!pending) return null;
    return (
      <CriticalApprovalModal
        open={Boolean(pending)}
        action={pending.action}
        actionLabel={pending.actionLabel}
        resourceType={pending.resourceType}
        resourceId={pending.resourceId}
        payload={pending.payload}
        onClose={() => setPending(null)}
        onExecute={async (auth) => {
          await pending.execute(auth);
          await pending.onSuccess?.();
        }}
      />
    );
  }, [pending]);

  return { run, modal };
}
