"use client";

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import Image from "next/image";
import SearchMultiSelect from "@/components/search-multi-select";
import SearchableSelect, { type SearchableSelectOption } from "@/components/searchable-select";
import OnboardingGuide from "@/components/onboarding-guide";
import { clientFetch } from "@/lib/client-observability";
import { canAccessAdmin } from "@/lib/role-permissions";
import { isWithinSelectSurface } from "@/lib/select-surface";
import { avatarOptions, isThemeId, jobTitleOptions, techStackOptions, timezoneOptions, type ThemeId } from "@/lib/ui-options";
import type { BoardSummary, CurrentUser } from "@/lib/auth-models";
import { X } from "lucide-react";

export default function AuthenticatedShell({
  user,
  boards,
  activeBoardId,
  initialThemeId = "notion",
  children,
}: {
  user: CurrentUser;
  boards: BoardSummary[];
  activeBoardId: string;
  initialThemeId?: string;
  children: ReactNode;
}) {
  const [currentUser, setCurrentUser] = useState(user);
  const [boardList] = useState(boards);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [shellThemeId, setShellThemeId] = useState<ThemeId>(isThemeId(initialThemeId) ? initialThemeId : "notion");
  const [flash, setFlash] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [passwordDraft, setPasswordDraft] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const menuRef = useRef<HTMLDivElement | null>(null);
  const activeBoard = boardList.find((board) => board.id === activeBoardId);
  const canUseAdmin = canAccessAdmin(currentUser.role);
  const readOnly = activeBoard?.role === "viewer" && !canUseAdmin;
  const [profileDraft, setProfileDraft] = useState({
    displayName: user.displayName || "",
    phone: user.phone || "",
    timezone: user.timezone || "Asia/Shanghai",
    avatarKey: user.avatarKey || avatarOptions[0].key,
    jobTitle: user.jobTitle || "",
    techStacks: user.techStacks || [],
  });

  const boardSelectOptions: SearchableSelectOption[] = boardList.map((board) => ({
    value: board.id,
    label: board.name,
    meta: board.ownerUsername,
  }));
  const timezoneSelectOptions: SearchableSelectOption[] = timezoneOptions.map(([value, label]) => ({ value, label }));

  function showFlash(message: string, type: "success" | "error" = "success") {
    setFlash({ message, type });
    window.setTimeout(() => {
      setFlash((current) => (current?.message === message ? null : current));
    }, 2800);
  }

  useEffect(() => {
    if (!menuOpen) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      const insideMenu = Boolean(target && menuRef.current?.contains(target));
      if (!insideMenu && !isWithinSelectSurface(target)) {
        setMenuOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [menuOpen]);

  useEffect(() => {
    function handleCloseMenu() {
      setMenuOpen(false);
    }
    window.addEventListener("kanban:onboarding-close-menu", handleCloseMenu as EventListener);
    return () => window.removeEventListener("kanban:onboarding-close-menu", handleCloseMenu as EventListener);
  }, []);

  useEffect(() => {
    function handleThemeChange(event: Event) {
      const nextTheme = (event as CustomEvent<{ themeId?: unknown }>).detail?.themeId;
      if (typeof nextTheme === "string" && isThemeId(nextTheme)) {
        setShellThemeId(nextTheme);
      }
    }

    window.addEventListener("kanban:theme-change", handleThemeChange);
    return () => window.removeEventListener("kanban:theme-change", handleThemeChange);
  }, []);

  async function switchBoard(boardId: string) {
    await clientFetch(`/api/boards/${boardId}/select`, { method: "POST" }, { operation: "boards.select" });
    setMenuOpen(false);
    window.location.assign("/");
  }

  async function saveProfile() {
    if (passwordDraft.newPassword || passwordDraft.currentPassword || passwordDraft.confirmPassword) {
      if (passwordDraft.newPassword !== passwordDraft.confirmPassword) {
        showFlash("两次输入的新密码不一致", "error");
        return;
      }
    }

    setSavingProfile(true);
    const response = await clientFetch("/api/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        timezone: profileDraft.timezone,
        avatarKey: profileDraft.avatarKey,
        phone: profileDraft.phone,
        jobTitle: profileDraft.jobTitle,
        techStacks: profileDraft.techStacks,
        currentPassword: passwordDraft.currentPassword,
        newPassword: passwordDraft.newPassword,
      }),
    }, { operation: "auth.profile.update" });
    const payload = (await response.json().catch(() => ({}))) as { user?: CurrentUser; error?: string };
    setSavingProfile(false);
    if (!response.ok || !payload.user) {
      showFlash(payload.error ?? "保存个人设置失败", "error");
      return;
    }
    setCurrentUser(payload.user);
    setPasswordDraft({ currentPassword: "", newPassword: "", confirmPassword: "" });
    setProfileOpen(false);
    showFlash("个人设置已保存");
  }

  async function logout() {
    await clientFetch("/api/auth/logout", { method: "POST" }, { operation: "auth.logout" });
    window.location.assign("/");
  }

  return (
    <div className="kanban-theme contents" data-theme={shellThemeId}>
      <div className="fixed right-5 top-5 z-40">
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((current) => !current)}
            data-tour="shell-menu"
            className="flex h-12 items-center gap-3 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 pr-4 text-sm font-medium text-[var(--text)] shadow-[0_14px_40px_rgba(15,23,42,0.12)] backdrop-blur transition hover:bg-[var(--panel-soft)]"
          >
            <UserAvatar
              src={avatarOptions.find((item) => item.key === currentUser.avatarKey)?.src}
              name={currentUser.displayName || currentUser.username}
            />
            <div className="flex min-w-0 flex-col items-start leading-tight">
              <span className="max-w-[150px] truncate text-sm font-semibold text-[var(--text)]">{currentUser.displayName || currentUser.username}</span>
              <span className="max-w-[150px] truncate text-xs text-[var(--muted)]">@{currentUser.username}</span>
            </div>
          </button>

          {menuOpen ? (
            <div className="absolute right-0 top-[calc(100%+12px)] w-[340px] rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-3 text-[var(--text)] shadow-[0_24px_60px_rgba(15,23,42,0.18)] backdrop-blur">
              <div className="flex items-center gap-3 rounded-2xl bg-[var(--panel-soft)] px-3 py-3">
                <UserAvatar
                  src={avatarOptions.find((item) => item.key === currentUser.avatarKey)?.src}
                  name={currentUser.displayName || currentUser.username}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--text)]">{currentUser.displayName || currentUser.username}</p>
                  <p className="truncate text-xs text-[var(--muted)]">@{currentUser.username}</p>
                </div>
              </div>

              <div className="space-y-3 px-1 py-3">
                <div className="space-y-2" data-tour="menu-board-switch">
                  <div className="px-2 text-xs font-semibold text-[var(--muted)]">看板切换</div>
                  <SearchableSelect
                    value={activeBoardId}
                    options={boardSelectOptions}
                    onChange={(boardId) => void switchBoard(boardId)}
                    placeholder="选择看板"
                  />
                </div>

                <div className="space-y-2">
                  <MenuButton onClick={() => window.location.assign("/dashboard")} dataTour="menu-dashboard">项目负载</MenuButton>
                  <MenuButton onClick={() => { setProfileOpen(true); setMenuOpen(false); }} dataTour="menu-profile">
                    个人设置
                  </MenuButton>
                  {canUseAdmin ? (
                    <MenuButton onClick={() => window.location.assign("/admin")} dataTour="menu-admin">后台管理</MenuButton>
                  ) : null}
                  <MenuButton onClick={() => void logout()}>退出登录</MenuButton>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {readOnly ? (
        <style>{'button[title="新建项目"],button[title="编辑项目"],button[title="归档项目"]{display:none!important}'}</style>
      ) : null}
      {flash ? (
        <div className={`fixed left-1/2 top-5 z-[130] -translate-x-1/2 rounded-2xl border px-4 py-3 text-sm shadow-xl ${
          flash.type === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"
        }`}>
          {flash.message}
        </div>
      ) : null}
      {children}

      <OnboardingGuide
        username={currentUser.username}
        role={currentUser.role}
        scope="shell"
        actions={{
          openMenu: () => setMenuOpen(true),
          closeMenu: () => setMenuOpen(false),
          goAdmin: () => {
            setMenuOpen(false);
            window.location.assign("/admin");
          },
          goDashboard: () => {
            setMenuOpen(false);
            window.location.assign("/dashboard");
          },
        }}
      />

      {profileOpen ? (
        <ShellModal title="个人设置" onClose={() => setProfileOpen(false)} maxWidth="max-w-[560px]" bodyClassName="flex overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 border-b border-[var(--border)] pb-4">
              <div className="flex justify-center pb-3">
                <button
                  type="button"
                  onClick={() => setAvatarPickerOpen(true)}
                  className="group relative cursor-pointer rounded-full"
                  title="更换头像"
                >
                  <Image
                    src={avatarOptions.find((item) => item.key === profileDraft.avatarKey)?.src ?? avatarOptions[0].src}
                    alt="当前头像"
                    width={88}
                    height={88}
                    className="h-[88px] w-[88px] rounded-full border border-[var(--border)] object-cover shadow-[0_12px_30px_rgba(15,23,42,0.12)] transition duration-200 group-hover:scale-[1.03] group-hover:shadow-[0_18px_42px_rgba(15,118,110,0.18)]"
                  />
                  <span className="pointer-events-none absolute inset-0 grid place-items-center rounded-full bg-slate-950/0 text-xs font-semibold tracking-[0.18em] text-white opacity-0 transition group-hover:bg-slate-950/28 group-hover:opacity-100">
                    更换
                  </span>
                </button>
              </div>
              <label className="block space-y-2 text-sm">
                <span className="font-medium text-[var(--muted)]">用户名</span>
                <input value={currentUser.username} disabled className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--panel-soft)] px-3 text-sm leading-5 text-[var(--muted)]" />
              </label>
              <label className="mt-3 block space-y-2 text-sm">
                <span className="font-medium text-[var(--muted)]">姓名</span>
                <input
                  value={profileDraft.displayName}
                  disabled
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--panel-soft)] px-3 text-sm leading-5 text-[var(--muted)]"
                />
              </label>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 pt-4">
              <label className="block space-y-2 text-sm">
                <span className="font-medium text-[var(--muted)]">手机</span>
                <input
                  value={profileDraft.phone}
                  onChange={(event) => setProfileDraft((current) => ({ ...current, phone: event.target.value }))}
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm leading-5 text-[var(--text)] outline-none placeholder:text-sm placeholder:leading-5 placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
                  placeholder="输入手机号"
                />
              </label>
              <label className="block space-y-2 text-sm">
                <span className="font-medium text-[var(--muted)]">职位</span>
                <SearchableSelect
                  value={profileDraft.jobTitle}
                  options={jobTitleOptions.map((option) => ({ value: option.value, label: option.label }))}
                  onChange={(value) => setProfileDraft((current) => ({ ...current, jobTitle: value }))}
                  placeholder="选择职位"
                />
              </label>
              <label className="block space-y-2 text-sm">
                <span className="font-medium text-[var(--muted)]">时区</span>
                <SearchableSelect
                  value={profileDraft.timezone}
                  options={timezoneSelectOptions}
                  onChange={(value) => setProfileDraft((current) => ({ ...current, timezone: value }))}
                  placeholder="选择时区"
                />
              </label>
              <div className="space-y-2 text-sm">
                <span className="font-medium text-[var(--muted)]">技术栈</span>
                <SearchMultiSelect
                  value={profileDraft.techStacks}
                  options={techStackOptions.map((item) => ({ value: item, label: item }))}
                  onChange={(techStacks) => setProfileDraft((current) => ({ ...current, techStacks }))}
                  placeholder="选择或搜索技术栈"
                  summaryLabel="技术栈"
                  searchPlaceholder="搜索技术栈"
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block space-y-2 text-sm">
                  <span className="font-medium text-[var(--muted)]">当前密码</span>
                  <input
                    type="password"
                    value={passwordDraft.currentPassword}
                    onChange={(event) => setPasswordDraft((current) => ({ ...current, currentPassword: event.target.value }))}
                    className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm leading-5 text-[var(--text)] outline-none placeholder:text-sm placeholder:leading-5 placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
                    placeholder="留空则不修改"
                  />
                </label>
                <label className="block space-y-2 text-sm">
                  <span className="font-medium text-[var(--muted)]">新密码</span>
                  <input
                    type="password"
                    value={passwordDraft.newPassword}
                    onChange={(event) => setPasswordDraft((current) => ({ ...current, newPassword: event.target.value }))}
                    className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm leading-5 text-[var(--text)] outline-none placeholder:text-sm placeholder:leading-5 placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
                    placeholder="至少 6 位"
                  />
                </label>
              </div>
              <label className="block space-y-2 text-sm">
                <span className="font-medium text-[var(--muted)]">确认新密码</span>
                <input
                  type="password"
                  value={passwordDraft.confirmPassword}
                  onChange={(event) => setPasswordDraft((current) => ({ ...current, confirmPassword: event.target.value }))}
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm leading-5 text-[var(--text)] outline-none placeholder:text-sm placeholder:leading-5 placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
                  placeholder="再次输入新密码"
                />
              </label>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setProfileOpen(false)} className="h-10 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--panel-soft)]">
                  取消
                </button>
                <button type="button" onClick={() => void saveProfile()} disabled={savingProfile} className="h-10 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-60">
                  {savingProfile ? "保存中..." : "保存"}
                </button>
              </div>
            </div>
          </div>
        </ShellModal>
      ) : null}

      {avatarPickerOpen ? (
        <ShellModal title="选择头像" onClose={() => setAvatarPickerOpen(false)} maxWidth="max-w-[640px]">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {avatarOptions.map((avatar) => (
              <button
                key={avatar.key}
                type="button"
                onClick={() => {
                  setProfileDraft((current) => ({ ...current, avatarKey: avatar.key }));
                  setAvatarPickerOpen(false);
                }}
                className={`rounded-2xl border p-3 text-left transition ${
                  profileDraft.avatarKey === avatar.key ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)] bg-[var(--panel)] hover:bg-[var(--panel-soft)]"
                }`}
              >
                <Image src={avatar.src} alt={avatar.label} width={80} height={80} className="h-20 w-20 rounded-2xl object-cover" />
                <span className="mt-2 block truncate text-xs font-semibold text-[var(--text)]">{avatar.label}</span>
              </button>
            ))}
          </div>
        </ShellModal>
      ) : null}
    </div>
  );
}

function MenuButton({ children, onClick, dataTour }: { children: ReactNode; onClick: () => void; dataTour?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-tour={dataTour}
      className="flex h-11 w-full items-center rounded-2xl px-3 text-left text-sm font-medium leading-none text-[var(--text)] transition hover:bg-[var(--panel-soft)]"
    >
      {children}
    </button>
  );
}

function UserAvatar({ src, name }: { src?: string; name: string }) {
  if (src) {
    return <Image src={src} alt={name} width={32} height={32} className="h-8 w-8 rounded-full border border-[var(--border)] object-cover" />;
  }

  return (
    <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--accent)] text-xs font-semibold text-white">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function ShellModal({
  title,
  children,
  onClose,
  maxWidth = "max-w-[520px]",
  bodyClassName = "overflow-y-auto pr-1",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  maxWidth?: string;
  bodyClassName?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-slate-950/45 px-4 py-4 sm:py-8"
      onClick={onClose}
    >
      <div
        className={`my-auto flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-[28px] border border-[var(--border)] bg-[var(--panel)] p-5 text-[var(--text)] shadow-2xl shadow-slate-900/20 sm:p-6 ${maxWidth}`}
        onClick={(event: ReactMouseEvent<HTMLDivElement>) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-[var(--text)]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-2xl border border-[var(--border)] bg-[var(--panel)] text-[var(--muted)] transition hover:bg-[var(--panel-soft)] hover:text-[var(--text)]"
          >
            <X size={16} />
          </button>
        </div>
        <div className={`min-h-0 flex-1 ${bodyClassName}`}>{children}</div>
      </div>
    </div>
  );
}
