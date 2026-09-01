"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Particles, initParticlesEngine } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import type { IParticlesProps } from "@tsparticles/react";
import { reportClientError } from "@/lib/client-observability";

type DashboardParticlesProps = {
  theme: "dark" | "light";
  className?: string;
};

type ParticleOptions = NonNullable<IParticlesProps["options"]>;

function buildParticleOptions(theme: DashboardParticlesProps["theme"]): ParticleOptions {
  const isLight = theme === "light";
  const particleColor = isLight ? "rgb(14, 116, 144)" : "rgb(125, 211, 252)";
  const linkColor = isLight ? "rgb(15, 118, 110)" : "rgb(103, 232, 249)";

  return {
    background: {
      color: {
        value: "transparent",
      },
    },
    detectRetina: false,
    fpsLimit: 30,
    fullScreen: {
      enable: false,
    },
    interactivity: {
      events: {
        onClick: {
          enable: false,
        },
        onHover: {
          enable: false,
        },
        resize: {
          enable: true,
        },
      },
    },
    pauseOnBlur: true,
    pauseOnOutsideViewport: true,
    particles: {
      color: {
        value: particleColor,
      },
      links: {
        color: linkColor,
        distance: isLight ? 128 : 140,
        enable: true,
        opacity: isLight ? 0.28 : 0.18,
        width: 1,
      },
      move: {
        direction: "none",
        enable: true,
        outModes: {
          default: "bounce",
        },
        random: false,
        speed: isLight ? 0.22 : 0.26,
        straight: false,
      },
      number: {
        density: {
          enable: true,
          height: 900,
          width: 1200,
        },
        value: isLight ? 72 : 84,
      },
      opacity: {
        value: isLight ? 0.52 : 0.5,
      },
      shape: {
        type: "circle",
      },
      size: {
        value: {
          min: 1.2,
          max: isLight ? 2.5 : 2.8,
        },
      },
    },
  };
}

export default function DashboardParticles({ theme, className = "" }: DashboardParticlesProps) {
  const [engineReady, setEngineReady] = useState(false);
  const options = useMemo(() => buildParticleOptions(theme), [theme]);
  const particleId = `dashboard-particles-v3-${theme}`;

  useEffect(() => {
    let cancelled = false;

    initParticlesEngine(async (engine) => {
      try {
        await loadSlim(engine);
      } catch (error) {
        reportClientError({
          source: "dashboard-particles",
          message: error instanceof Error ? error.message : "Failed to initialize dashboard particles",
          stack: error instanceof Error ? error.stack : undefined,
        });
        throw error;
      }
    })
      .then(() => {
        if (!cancelled) {
          setEngineReady(true);
        }
      })
      .catch((error) => {
        reportClientError({
          source: "dashboard-particles",
          message: error instanceof Error ? error.message : "Failed to initialize dashboard particles engine",
          stack: error instanceof Error ? error.stack : undefined,
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleParticlesLoaded = useCallback<NonNullable<IParticlesProps["particlesLoaded"]>>(async (container) => {
    if (!container) {
      reportClientError({
        source: "dashboard-particles",
        message: "Dashboard particles container was not created",
      });
      return;
    }

    const canvas = document.querySelector<HTMLCanvasElement>(`#${particleId} canvas`);
    if (!canvas || canvas.width <= 0 || canvas.height <= 0) {
      reportClientError({
        source: "dashboard-particles",
        message: "Dashboard particles canvas was not rendered",
      });
    }
  }, [particleId]);

  return (
    <div className={`dashboard-particles ${className}`} aria-hidden="true">
      {engineReady ? (
        <Particles
          key={particleId}
          id={particleId}
          options={options}
          particlesLoaded={handleParticlesLoaded}
          className="h-full w-full"
          style={{ height: "100%", width: "100%" }}
        />
      ) : null}
    </div>
  );
}
