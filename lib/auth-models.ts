export type UserRole = "super_admin" | "project_manager" | "development_manager" | "team_member";

export type BoardRole = "owner" | "viewer" | "admin";

export type JobTitle =
  | "team_lead"
  | "architect"
  | "product_manager"
  | "project_manager"
  | "development_manager"
  | "developer"
  | "tester"
  | "custom";

export type CurrentUser = {
  id: string;
  username: string;
  role: UserRole;
  timezone: string;
  displayName: string;
  phone: string;
  avatarKey: string;
  jobTitle: string;
  techStacks: string[];
};

export type ManagedUser = CurrentUser & {
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BoardSummary = {
  id: string;
  name: string;
  description: string;
  ownerUserId: string;
  ownerUsername: string;
  role: BoardRole;
  teamIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type AdminPermissions = {
  canManageUsers: boolean;
  canCreateSuperAdmin: boolean;
  canManageAllBoards: boolean;
};

export type TeamMemberSummary = {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  avatarKey: string;
  jobTitle: string;
  techStacks: string[];
  phone: string;
};

export type TeamSummary = {
  id: string;
  name: string;
  description: string;
  ownerUserId: string;
  ownerUsername: string;
  color: string;
  memberIds: string[];
  memberCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AuditLogEntry = {
  id: string;
  actorUserId: string;
  actorUsername: string;
  actorDisplayName: string;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId: string;
  boardId: string;
  result: string;
  message: string;
  ipAddress: string;
  userAgent: string;
  requestId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};
