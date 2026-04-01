import { postMessage } from "../hooks/useVsCodeApi";
import type { PermissionInfo, PermissionResponse } from "@shared/protocol";
import { useStore } from "../store/useStore";

interface PermissionPromptProps {
  permission: PermissionInfo;
}

export function PermissionPrompt({ permission: perm }: PermissionPromptProps) {
  const dismiss = useStore((s) => s.dismissPermission);

  function respond(response: PermissionResponse) {
    postMessage({
      type: "permission-respond",
      sessionId: perm.sessionID,
      permissionId: perm.id,
      response,
    });
    dismiss(perm.id);
  }

  return (
    <div className="permission">
      <div className="permission__title">Permission Required</div>
      <div className="permission__text">
        {String(perm.tool ?? perm.description ?? "Action requires approval")}
      </div>
      <div className="permission__actions">
        <button onClick={() => respond("once")}>Allow Once</button>
        <button onClick={() => respond("always")}>Always Allow</button>
        <button className="btn--danger" onClick={() => respond("reject")}>
          Deny
        </button>
      </div>
    </div>
  );
}
