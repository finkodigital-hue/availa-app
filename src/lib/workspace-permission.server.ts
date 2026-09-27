type WorkspaceContext = {
  supabase: any;
  userId: string;
};

export type ServerWorkspacePermission =
  | "workspace.read"
  | "calendar.manage"
  | "calendar.read"
  | "customers.manage"
  | "services.manage"
  | "staff.manage"
  | "inventory.manage"
  | "reports.read";

/**
 * Resolve the single workspace selected by the product's current owner-first
 * workspace model, then enforce the same database permission used by RLS.
 * Keeping this on the server prevents UI route guards from becoming an
 * authorization boundary and avoids silently excluding authorised employees.
 */
export async function requireWorkspacePermission(
  context: WorkspaceContext,
  permission: ServerWorkspacePermission,
): Promise<string> {
  const db = context.supabase as any;
  const { data: owned, error: ownedError } = await db
    .from("businesses")
    .select("id")
    .eq("owner_id", context.userId)
    .maybeSingle();
  if (ownedError) throw ownedError;
  if (owned?.id) return owned.id as string;

  const { data: membership, error: membershipError } = await db
    .from("staff_memberships")
    .select("business_id")
    .eq("user_id", context.userId)
    .eq("active", true)
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership?.business_id) {
    throw new Error("No business is connected to this account.");
  }

  const { data: allowed, error: permissionError } = await db.rpc(
    "has_business_permission",
    {
      _business_id: membership.business_id,
      _permission: permission,
    },
  );
  if (permissionError) throw permissionError;
  if (allowed !== true)
    throw new Error("You do not have permission to do that.");
  return membership.business_id as string;
}

export async function hasWorkspacePermission(
  context: WorkspaceContext,
  businessId: string,
  permission: ServerWorkspacePermission,
): Promise<boolean> {
  const { data, error } = await (context.supabase as any).rpc(
    "has_business_permission",
    { _business_id: businessId, _permission: permission },
  );
  if (error) throw error;
  return data === true;
}
