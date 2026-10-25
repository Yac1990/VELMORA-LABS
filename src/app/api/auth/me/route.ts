import { ok } from "@/lib/api-utils";
import { sessionFromRequest } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return ok({ user: null });
  return ok({
    user: {
      id: session.uid,
      email: session.email,
      role: session.role,
      roleLabel: ROLE_LABELS[session.role] || session.role,
      displayName: session.displayName,
    },
  });
}
