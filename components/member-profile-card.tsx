"use client";

import Image from "next/image";
import { X } from "lucide-react";
import { avatarOptions, jobTitleLabel, roleLabel } from "@/lib/ui-options";
import type { TeamMemberSummary, UserRole } from "@/lib/auth-models";

export type MemberProfile = {
  username: string;
  displayName: string;
  avatarKey: string;
  role: UserRole;
  jobTitle: string;
  techStacks: string[];
  phone: string;
};

type ThemeMode = "dashboard-dark" | "dashboard-light" | "admin";

const themeStyles: Record<ThemeMode, {
  overlay: string;
  shell: string;
  topGlow: string;
  headerLine: string;
  closeButton: string;
  eyebrow: string;
  valueBox: string;
  valueLabel: string;
  valueText: string;
  techStackBox: string;
  techStackChip: string;
  techStackEmpty: string;
  avatarBorder: string;
  fallbackAvatar: string;
  roleChip: string;
  roleDivider: string;
  title: string;
}> = {
  "dashboard-dark": {
    overlay: "bg-slate-950/35",
    shell:
      "rounded-[28px] border border-[var(--dash-line)] bg-[linear-gradient(180deg,var(--dash-panel-strong),var(--dash-panel))] shadow-[0_28px_90px_var(--dash-shadow-soft)] backdrop-blur-xl",
    topGlow:
      "pointer-events-none absolute right-[-12%] top-[-14%] h-28 w-28 rounded-full bg-[radial-gradient(circle,var(--dash-hot-glow),transparent_70%)] blur-3xl opacity-50",
    headerLine:
      "pointer-events-none absolute inset-x-10 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--dash-rim),transparent)] opacity-70",
    closeButton:
      "border border-[var(--dash-line)] bg-[var(--dash-panel)] text-[var(--dash-muted)] hover:text-[var(--dash-text)]",
    eyebrow: "bg-[var(--dash-accent-soft)] text-[var(--dash-accent)]",
    valueBox: "border border-[var(--dash-line)] bg-[var(--dash-card)]",
    valueLabel: "text-[var(--dash-muted)]",
    valueText: "text-[var(--dash-text)]",
    techStackBox: "border border-[var(--dash-line)] bg-[var(--dash-card)]",
    techStackChip: "border border-[var(--dash-hot)] bg-[var(--dash-hot-glow)] text-[var(--dash-hot)]",
    techStackEmpty: "bg-[var(--dash-track)] text-[var(--dash-muted)]",
    avatarBorder: "border border-[var(--dash-line)] shadow-[0_8px_20px_var(--dash-shadow)]",
    fallbackAvatar: "bg-[var(--dash-accent-soft)] text-[var(--dash-accent)]",
    roleChip: "border border-[var(--dash-rim)] text-[var(--dash-accent)]",
    roleDivider: "border-[var(--dash-line)] text-[var(--dash-muted)]",
    title: "text-[var(--dash-name)]",
  },
  "dashboard-light": {
    overlay: "bg-slate-950/24",
    shell:
      "rounded-[28px] border border-[rgba(148,163,184,0.28)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,250,255,0.96))] shadow-[0_28px_90px_rgba(15,23,42,0.16)] backdrop-blur-xl",
    topGlow:
      "pointer-events-none absolute right-[-12%] top-[-14%] h-28 w-28 rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.26),transparent_70%)] blur-3xl opacity-80",
    headerLine:
      "pointer-events-none absolute inset-x-10 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(56,189,248,0.42),transparent)] opacity-90",
    closeButton:
      "border border-[rgba(148,163,184,0.24)] bg-white/85 text-slate-500 hover:text-slate-900",
    eyebrow: "bg-sky-100 text-sky-700",
    valueBox: "border border-[rgba(148,163,184,0.24)] bg-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]",
    valueLabel: "text-slate-500",
    valueText: "text-slate-900",
    techStackBox: "border border-[rgba(148,163,184,0.24)] bg-white/82",
    techStackChip: "border border-sky-200 bg-sky-50 text-sky-700",
    techStackEmpty: "bg-slate-100 text-slate-500",
    avatarBorder: "border border-[rgba(148,163,184,0.22)] shadow-[0_10px_24px_rgba(15,23,42,0.12)]",
    fallbackAvatar: "bg-sky-100 text-sky-700",
    roleChip: "border border-sky-200 text-sky-700",
    roleDivider: "border-sky-100 text-slate-500",
    title: "text-slate-900",
  },
  admin: {
    overlay: "bg-slate-950/36 backdrop-blur-[2px]",
    shell:
      "rounded-[28px] border border-[color:color-mix(in_oklab,var(--accent)_18%,var(--border))] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--panel)_92%,white_8%),var(--panel))] shadow-[0_24px_72px_color-mix(in_oklab,var(--accent)_18%,transparent)]",
    topGlow:
      "pointer-events-none absolute right-[-12%] top-[-14%] h-28 w-28 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--accent)_30%,transparent),transparent_70%)] blur-3xl opacity-90",
    headerLine:
      "pointer-events-none absolute inset-x-10 top-0 h-px bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--accent)_48%,transparent),transparent)] opacity-90",
    closeButton:
      "border border-[var(--border)] bg-[var(--panel-soft)] text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]",
    eyebrow: "bg-[var(--accent-soft)] text-[var(--accent)]",
    valueBox:
      "border border-[color:color-mix(in_oklab,var(--accent)_14%,var(--border))] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--panel-soft)_92%,white_8%),var(--panel-soft))] shadow-[inset_0_1px_0_color-mix(in_oklab,white_60%,transparent)]",
    valueLabel: "text-[var(--muted)]",
    valueText: "text-[var(--text)]",
    techStackBox:
      "border border-[color:color-mix(in_oklab,var(--accent)_14%,var(--border))] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--panel-soft)_92%,white_8%),var(--panel-soft))]",
    techStackChip:
      "border border-[color:color-mix(in_oklab,var(--accent)_28%,var(--border))] bg-[color:color-mix(in_oklab,var(--accent-soft)_78%,white_22%)] text-[var(--accent)]",
    techStackEmpty: "border border-dashed border-[var(--border)] bg-[var(--panel)] text-[var(--muted)]",
    avatarBorder:
      "border border-[color:color-mix(in_oklab,var(--accent)_20%,var(--border))] shadow-[0_12px_28px_color-mix(in_oklab,var(--accent)_16%,transparent)]",
    fallbackAvatar: "bg-[var(--accent-soft)] text-[var(--accent)]",
    roleChip:
      "border border-[color:color-mix(in_oklab,var(--accent)_22%,var(--border))] bg-[color:color-mix(in_oklab,var(--accent-soft)_76%,white_24%)] text-[var(--accent)]",
    roleDivider: "border-[color:color-mix(in_oklab,var(--accent)_20%,var(--border))] text-[var(--muted)]",
    title: "text-[var(--text)]",
  },
};

export default function MemberProfileCard({
  member,
  onClose,
  theme = "dashboard-dark",
  zIndexClass = "z-[90]",
}: {
  member: MemberProfile;
  onClose: () => void;
  theme?: ThemeMode;
  zIndexClass?: string;
}) {
  const styles = themeStyles[theme];

  return (
    <div className={`fixed inset-0 ${zIndexClass} flex items-center justify-center ${styles.overlay} px-4 py-4`} onClick={onClose}>
      <div
        className={`relative flex max-h-[calc(100vh-2rem)] w-full max-w-[520px] flex-col overflow-hidden ${styles.shell} p-6`}
        onClick={(event) => event.stopPropagation()}
      >
        {styles.headerLine ? <span className={styles.headerLine} /> : null}
        {styles.topGlow ? <span className={styles.topGlow} /> : null}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-stretch gap-4">
            <MemberProfileAvatar member={member} theme={theme} size={88} />
            <div className="grid h-[88px] min-w-0 flex-1 content-center gap-3 py-0.5">
              <p className={`truncate text-xl font-semibold leading-none ${styles.title}`}>{member.displayName || member.username}</p>
              <span className={`inline-flex w-fit items-center overflow-hidden rounded-full text-xs font-semibold leading-none ${styles.roleChip}`}>
                <span className={`border-r px-2 py-1 ${styles.roleDivider}`}>系统角色</span>
                <span className="px-2.5 py-1">{roleLabel(member.role)}</span>
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`grid h-10 w-10 place-items-center rounded-2xl transition ${styles.closeButton}`}
          >
            <X size={16} />
          </button>
        </div>
        <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <ProfileInfo label="姓名" value={member.displayName || "-"} theme={theme} />
            <ProfileInfo label="手机" value={member.phone || "-"} theme={theme} />
            <ProfileInfo label="职位" value={jobTitleLabel(member.jobTitle)} theme={theme} />
            <ProfileInfo label="账号" value={`@${member.username}`} theme={theme} />
          </div>
          <div className={`mt-3 rounded-2xl px-4 py-3 ${styles.techStackBox}`}>
            <div className={`text-xs ${styles.valueLabel}`}>技术栈</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {member.techStacks.length > 0 ? (
                member.techStacks.map((item) => (
                  <span key={item} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${styles.techStackChip}`}>
                    {item}
                  </span>
                ))
              ) : (
                <span className={`rounded-full px-2.5 py-1 text-xs ${styles.techStackEmpty}`}>未设置技术栈</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MemberProfileAvatar({
  member,
  theme,
  size,
}: {
  member: Pick<MemberProfile, "avatarKey" | "displayName" | "username">;
  theme: ThemeMode;
  size: number;
}) {
  const styles = themeStyles[theme];
  const avatar = avatarOptions.find((item) => item.key === member.avatarKey);
  const name = member.displayName || member.username;

  if (avatar) {
    return (
      <Image
        src={avatar.src}
        alt={name}
        width={size}
        height={size}
        className={`shrink-0 rounded-2xl object-cover ${styles.avatarBorder}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className={`grid shrink-0 place-items-center rounded-2xl text-lg font-semibold ${styles.fallbackAvatar}`}
      style={{ width: size, height: size }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function ProfileInfo({
  label,
  value,
  theme,
}: {
  label: string;
  value: string;
  theme: ThemeMode;
}) {
  const styles = themeStyles[theme];
  return (
    <div className={`rounded-2xl px-4 py-3 ${styles.valueBox}`}>
      <div className={`text-xs ${styles.valueLabel}`}>{label}</div>
      <div className={`mt-1 text-sm font-medium ${styles.valueText}`}>{value}</div>
    </div>
  );
}

export function toMemberProfile(member: TeamMemberSummary): MemberProfile {
  return {
    username: member.username,
    displayName: member.displayName,
    avatarKey: member.avatarKey,
    role: member.role,
    jobTitle: member.jobTitle,
    techStacks: member.techStacks,
    phone: member.phone,
  };
}
