"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import type { UserRole } from "@/lib/auth-models";
import { canAccessAdmin } from "@/lib/role-permissions";

type GuideScope = "dashboard" | "shell" | "kanban" | "admin";
type GuideAction =
  | "goKanban"
  | "goDashboard"
  | "goAdmin"
  | "openMenu"
  | "closeMenu"
  | "openTaskCreate"
  | "openProjectCreate"
  | "openAdminUsers"
  | "openAdminTeams"
  | "openAdminBoards";

type GuideStep = {
  id: string;
  scope: GuideScope;
  selector: string;
  title: string;
  detail: string;
  cta: string;
  action?: GuideAction;
  onEnterAction?: GuideAction;
};

type GuideState = {
  stepId: string;
  completed: boolean;
  role: UserRole;
};

const managerSteps: GuideStep[] = [
  {
    id: "dashboard-enter-kanban",
    scope: "dashboard",
    selector: '[data-tour="dashboard-enter-kanban"]',
    title: "先进入看板",
    detail: "从这里进入当前看板。",
    cta: "进入看板",
    action: "goKanban",
  },
  {
    id: "shell-open-menu",
    scope: "shell",
    selector: '[data-tour="shell-menu"]',
    title: "打开个人菜单",
    detail: "后续常用入口都在这里。",
    cta: "打开菜单",
    action: "openMenu",
  },
  {
    id: "shell-board-switch",
    scope: "shell",
    selector: '[data-tour="menu-board-switch"]',
    title: "切换看板",
    detail: "这里可以在你有权限的看板之间切换。",
    cta: "下一步",
    onEnterAction: "openMenu",
  },
  {
    id: "shell-open-admin",
    scope: "shell",
    selector: '[data-tour="menu-admin"]',
    title: "进入后台管理",
    detail: "先把用户、团队和看板关系建起来。",
    cta: "进入后台",
    onEnterAction: "openMenu",
    action: "goAdmin",
  },
  {
    id: "admin-create-user",
    scope: "admin",
    selector: '[data-tour="admin-users-panel"]',
    title: "先创建用户",
    detail: "从这里创建团队成员、项目经理或开发经理账号。",
    cta: "下一步",
    onEnterAction: "openAdminUsers",
  },
  {
    id: "admin-create-team",
    scope: "admin",
    selector: '[data-tour="admin-team-form"]',
    title: "接着创建团队",
    detail: "团队是后续项目和看板关联的基础。",
    cta: "下一步",
    onEnterAction: "openAdminTeams",
  },
  {
    id: "admin-team-members",
    scope: "admin",
    selector: '[data-tour="admin-team-members"]',
    title: "给团队关联成员",
    detail: "把刚创建的用户拉进团队。",
    cta: "下一步",
    onEnterAction: "openAdminTeams",
  },
  {
    id: "admin-create-board",
    scope: "admin",
    selector: '[data-tour="admin-board-form"]',
    title: "再创建看板",
    detail: "看板会承载项目、任务和活动记录。",
    cta: "下一步",
    onEnterAction: "openAdminBoards",
  },
  {
    id: "admin-board-teams",
    scope: "admin",
    selector: '[data-tour="admin-board-teams"]',
    title: "把团队关联到看板",
    detail: "看板关联团队后，成员就能看到对应看板。",
    cta: "下一步",
    onEnterAction: "openAdminBoards",
  },
  {
    id: "admin-return-kanban",
    scope: "admin",
    selector: '[data-tour="admin-return-kanban"]',
    title: "回到看板",
    detail: "基础关系建好后，就可以开始建项目和任务。",
    cta: "返回看板",
    action: "goKanban",
  },
  {
    id: "kanban-create-project",
    scope: "kanban",
    selector: '[data-tour="kanban-create-project"]',
    title: "先创建项目",
    detail: "任务必须挂在项目下保存。",
    cta: "打开项目",
    action: "openProjectCreate",
    onEnterAction: "closeMenu",
  },
  {
    id: "kanban-project-team",
    scope: "kanban",
    selector: '[data-tour="kanban-project-team"]',
    title: "给项目选择团队",
    detail: "负责人和测试员会从项目团队成员中选择。",
    cta: "下一步",
    onEnterAction: "openProjectCreate",
  },
  {
    id: "kanban-project-save",
    scope: "kanban",
    selector: '[data-tour="kanban-project-save"]',
    title: "保存项目",
    detail: "保存后才能创建任务卡。",
    cta: "下一步",
    onEnterAction: "openProjectCreate",
  },
  {
    id: "kanban-create-task",
    scope: "kanban",
    selector: '[data-tour="kanban-create-task"]',
    title: "创建任务卡",
    detail: "新任务默认进入需求池。",
    cta: "打开任务窗",
    action: "openTaskCreate",
  },
  {
    id: "kanban-backlog",
    scope: "kanban",
    selector: '[data-tour="column-backlog"]',
    title: "任务会先进入需求池",
    detail: "这里适合收集和初步整理待办任务。",
    cta: "下一步",
  },
  {
    id: "kanban-design",
    scope: "kanban",
    selector: '[data-tour="column-design"]',
    title: "然后拖到设计中",
    detail: "后续就按实际阶段继续推进。",
    cta: "下一步",
  },
  {
    id: "kanban-go-dashboard",
    scope: "kanban",
    selector: '[data-tour="kanban-go-dashboard"]',
    title: "最后回到项目负载",
    detail: "从这里可以切回大屏继续看团队状态。",
    cta: "完成",
    action: "goDashboard",
  },
];

const memberSteps: GuideStep[] = [
  {
    id: "dashboard-enter-kanban",
    scope: "dashboard",
    selector: '[data-tour="dashboard-enter-kanban"]',
    title: "先进入看板",
    detail: "从这里进入你当前可访问的看板。",
    cta: "进入看板",
    action: "goKanban",
  },
  {
    id: "shell-open-menu",
    scope: "shell",
    selector: '[data-tour="shell-menu"]',
    title: "打开个人菜单",
    detail: "后续常用入口都在这里。",
    cta: "打开菜单",
    action: "openMenu",
  },
  {
    id: "shell-board-switch",
    scope: "shell",
    selector: '[data-tour="menu-board-switch"]',
    title: "切换看板",
    detail: "这里可以在你有权限的看板之间切换。",
    cta: "下一步",
    onEnterAction: "openMenu",
  },
  {
    id: "shell-profile",
    scope: "shell",
    selector: '[data-tour="menu-profile"]',
    title: "先看看个人设置",
    detail: "这里可以维护你的头像、技术栈、职位和密码。",
    cta: "下一步",
    onEnterAction: "openMenu",
  },
  {
    id: "kanban-create-task",
    scope: "kanban",
    selector: '[data-tour="kanban-create-task"]',
    title: "先创建任务卡",
    detail: "你可以从这里新增任务，任务会先进入需求池。",
    cta: "打开任务窗",
    action: "openTaskCreate",
    onEnterAction: "closeMenu",
  },
  {
    id: "kanban-backlog",
    scope: "kanban",
    selector: '[data-tour="column-backlog"]',
    title: "任务先进入需求池",
    detail: "这里适合接收和整理新任务。",
    cta: "下一步",
  },
  {
    id: "kanban-design",
    scope: "kanban",
    selector: '[data-tour="column-design"]',
    title: "再拖到设计中",
    detail: "后续就可以继续按流程推进。",
    cta: "下一步",
  },
  {
    id: "kanban-go-dashboard",
    scope: "kanban",
    selector: '[data-tour="kanban-go-dashboard"]',
    title: "可以回到项目负载",
    detail: "这里能快速查看当前团队状态。",
    cta: "完成",
    action: "goDashboard",
  },
];

function storageKey(username: string) {
  return `kanban:onboarding:v1:${username}`;
}

function stepsForRole(role: UserRole) {
  return canAccessAdmin(role) ? managerSteps : memberSteps;
}

function readGuideState(username: string): GuideState | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(storageKey(username));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GuideState;
  } catch {
    return null;
  }
}

function writeGuideState(username: string, state: GuideState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(username), JSON.stringify(state));
}

export default function OnboardingGuide({
  username,
  role,
  scope,
  actions,
  enabled = true,
}: {
  username: string;
  role: UserRole;
  scope: GuideScope;
  actions?: Partial<Record<GuideAction, () => void>>;
  enabled?: boolean;
}) {
  const steps = useMemo(() => stepsForRole(role), [role]);
  const [state, setState] = useState<GuideState | null>(null);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [viewport, setViewport] = useState({ width: 1440, height: 900 });
  const enteredStepRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const next = readGuideState(username);
    if (next) {
      setState(next);
      return;
    }
    if (scope !== "dashboard") return;
    const freshState = {
      stepId: steps[0].id,
      completed: false,
      role,
    } satisfies GuideState;
    writeGuideState(username, freshState);
    setState(freshState);
  }, [enabled, role, scope, steps, username]);

  const currentIndex = state ? steps.findIndex((step) => step.id === state.stepId) : -1;
  const step = currentIndex >= 0 ? steps[currentIndex] : null;

  useEffect(() => {
    if (!step || step.scope !== scope) return;
    if (enteredStepRef.current === step.id) return;
    enteredStepRef.current = step.id;
    if (step.onEnterAction) {
      const actionKey = step.onEnterAction;
      window.requestAnimationFrame(() => {
        actions?.[actionKey]?.();
      });
    }
  }, [actions, scope, step]);

  useEffect(() => {
    if (!step || step.scope !== scope) {
      setTargetRect(null);
      return;
    }

    const selector = step.selector;
    function updateRect() {
      const node = document.querySelector(selector);
      if (!(node instanceof HTMLElement)) {
        setTargetRect(null);
        return;
      }
      setTargetRect(node.getBoundingClientRect());
    }

    updateRect();
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    const timer = window.setInterval(updateRect, 280);
    return () => {
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
      window.clearInterval(timer);
    };
  }, [scope, step]);

  useEffect(() => {
    function updateViewport() {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    }
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  if (!enabled || !state || state.completed || !step || step.scope !== scope || !targetRect) {
    return null;
  }

  const activeStep = step;
  const currentState = state;

  const highlightStyle = {
    top: Math.max(targetRect.top - 8, 12),
    left: Math.max(targetRect.left - 8, 12),
    width: Math.max(targetRect.width + 16, 72),
    height: Math.max(targetRect.height + 16, 52),
  };

  const cardTop = targetRect.bottom + 18;
  const cardLeft = Math.min(
    Math.max(targetRect.left, 20),
    viewport.width - 360
  );
  const cardStyle = {
    top: Math.min(cardTop, viewport.height - 220),
    left: cardLeft,
  };

  function completeGuide() {
    const nextState: GuideState = {
      stepId: currentState.stepId,
      completed: true,
      role: currentState.role,
    };
    writeGuideState(username, nextState);
    setState(nextState);
  }

  function advance() {
    const nextStep = steps[currentIndex + 1];
    if (!nextStep) {
      completeGuide();
      return;
    }
    const nextState: GuideState = {
      stepId: nextStep.id,
      completed: currentState.completed,
      role: currentState.role,
    };
    writeGuideState(username, nextState);
    setState(nextState);
  }

  function handlePrimary() {
    if (activeStep.action === "goKanban" || activeStep.action === "goDashboard" || activeStep.action === "goAdmin") {
      advance();
      actions?.[activeStep.action]?.();
      return;
    }
    if (activeStep.action) {
      actions?.[activeStep.action]?.();
    }
    advance();
  }

  function skip() {
    completeGuide();
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[180]">
      <div className="absolute inset-0 bg-slate-950/56" />
      <div
        className="absolute rounded-[28px] border border-cyan-200 shadow-[0_0_0_1px_rgba(103,232,249,0.34),0_0_0_9999px_rgba(2,6,23,0.5),0_0_42px_rgba(34,211,238,0.34)] transition-all"
        style={highlightStyle}
      />
      <section
        className="pointer-events-auto absolute w-[min(340px,calc(100vw-40px))] rounded-[28px] border border-cyan-200/55 bg-slate-950 p-4 text-white shadow-[0_24px_60px_rgba(8,47,73,0.54)]"
        style={cardStyle}
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-cyan-400/14 text-cyan-200">
            <Sparkles size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200/80">
                  {currentIndex + 1}/{steps.length}
                </p>
                <h3 className="mt-1 text-base font-semibold text-white">{activeStep.title}</h3>
              </div>
              <button
                type="button"
                onClick={skip}
                className="grid h-8 w-8 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-300">{activeStep.detail}</p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={skip}
            className="rounded-2xl border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
          >
            跳过
          </button>
          <button
            type="button"
            onClick={handlePrimary}
            className="rounded-2xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
          >
            {activeStep.cta}
          </button>
        </div>
      </section>
    </div>
  );
}
