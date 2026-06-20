export type UserRole = "super_admin" | "user";

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
  createdAt: string;
  updatedAt: string;
};
