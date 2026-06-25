export type UserRole = "super_admin" | "project_manager" | "team_member";

export type BoardRole = "owner" | "viewer" | "admin";

export type CurrentUser = {
  id: string;
  username: string;
  role: UserRole;
  timezone: string;
  displayName: string;
  avatarKey: string;
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
