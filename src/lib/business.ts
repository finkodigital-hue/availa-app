import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./auth";

export function useMyBusiness() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-business", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("businesses")
        .select("*")
        .eq("owner_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      if (data) return data;
      const { data: membership, error: membershipError } = await (supabase
        .from("staff_memberships" as any)
        .select("business_id")
        .eq("user_id", user!.id)
        .eq("active", true)
        .maybeSingle() as any);
      if (membershipError) throw membershipError;
      if (!membership) return null;
      const { data: workspace, error: workspaceError } = await supabase
        .from("businesses")
        .select("*")
        .eq("id", membership.business_id)
        .single();
      if (workspaceError) throw workspaceError;
      return workspace;
    },
  });
}

export type WorkspaceRole = "owner" | "manager" | "front_desk" | "practitioner";
export type WorkspacePermission = "calendar.manage" | "calendar.read" | "customers.manage" | "services.manage" | "staff.manage" | "inventory.manage" | "reports.read";

const ROLE_PERMISSIONS: Record<WorkspaceRole, WorkspacePermission[]> = {
  owner: ["calendar.manage", "calendar.read", "customers.manage", "services.manage", "staff.manage", "inventory.manage", "reports.read"],
  manager: ["calendar.manage", "calendar.read", "customers.manage", "services.manage", "staff.manage", "inventory.manage", "reports.read"],
  front_desk: ["calendar.manage", "calendar.read", "customers.manage"],
  practitioner: ["calendar.read"],
};

export function useWorkspaceAccess() {
  const { user } = useAuth();
  const { data: business } = useMyBusiness();
  const query = useQuery({
    queryKey: ["workspace-access", business?.id, user?.id],
    enabled: !!business && !!user,
    queryFn: async () => {
      if (business!.owner_id === user!.id) return { role: "owner" as WorkspaceRole, staffId: null as string | null };
      const { data, error } = await (supabase.from("staff_memberships" as any).select("access_role,staff_id").eq("business_id", business!.id).eq("user_id", user!.id).eq("active", true).single() as any);
      if (error) throw error;
      return { role: data.access_role as WorkspaceRole, staffId: data.staff_id as string };
    },
  });
  const role = query.data?.role;
  return { ...query, role, staffId: query.data?.staffId ?? null, isOwner: role === "owner", can: (permission: WorkspacePermission) => !!role && ROLE_PERMISSIONS[role].includes(permission) };
}
