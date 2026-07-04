"use client";

import { useEffect, useRef } from "react";
import { reportClientError } from "@/lib/client-observability";

type LoginOrbProps = {
  className?: string;
};

type OglModule = typeof import("ogl");

const vertex = `
  precision highp float;

  attribute vec2 position;
  attribute vec2 uv;

  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const fragment = `
  precision highp float;

  uniform float iTime;
  uniform vec3 iResolution;
  uniform float hue;
  uniform float hover;
  uniform float rot;
  uniform float hoverIntensity;
  uniform vec3 backgroundColor;

  varying vec2 vUv;

  vec3 rgb2yiq(vec3 c) {
    float y = dot(c, vec3(0.299, 0.587, 0.114));
    float i = dot(c, vec3(0.596, -0.274, -0.322));
    float q = dot(c, vec3(0.211, -0.523, 0.312));
    return vec3(y, i, q);
  }

  vec3 yiq2rgb(vec3 c) {
    float r = c.x + 0.956 * c.y + 0.621 * c.z;
    float g = c.x - 0.272 * c.y - 0.647 * c.z;
    float b = c.x - 1.106 * c.y + 1.703 * c.z;
    return vec3(r, g, b);
  }

  vec3 adjustHue(vec3 color, float hueDeg) {
    float hueRad = hueDeg * 3.14159265 / 180.0;
    vec3 yiq = rgb2yiq(color);
    float cosA = cos(hueRad);
    float sinA = sin(hueRad);
    float nextI = yiq.y * cosA - yiq.z * sinA;
    float nextQ = yiq.y * sinA + yiq.z * cosA;
    yiq.y = nextI;
    yiq.z = nextQ;
    return yiq2rgb(yiq);
  }

  vec3 hash33(vec3 p3) {
    p3 = fract(p3 * vec3(0.1031, 0.11369, 0.13787));
    p3 += dot(p3, p3.yxz + 19.19);
    return -1.0 + 2.0 * fract(vec3(
      p3.x + p3.y,
      p3.x + p3.z,
      p3.y + p3.z
    ) * p3.zyx);
  }

  float snoise3(vec3 p) {
    const float K1 = 0.333333333;
    const float K2 = 0.166666667;
    vec3 i = floor(p + (p.x + p.y + p.z) * K1);
    vec3 d0 = p - (i - (i.x + i.y + i.z) * K2);
    vec3 e = step(vec3(0.0), d0 - d0.yzx);
    vec3 i1 = e * (1.0 - e.zxy);
    vec3 i2 = 1.0 - e.zxy * (1.0 - e);
    vec3 d1 = d0 - (i1 - K2);
    vec3 d2 = d0 - (i2 - K1);
    vec3 d3 = d0 - 0.5;
    vec4 h = max(0.6 - vec4(
      dot(d0, d0),
      dot(d1, d1),
      dot(d2, d2),
      dot(d3, d3)
    ), 0.0);
    vec4 n = h * h * h * h * vec4(
      dot(d0, hash33(i)),
      dot(d1, hash33(i + i1)),
      dot(d2, hash33(i + i2)),
      dot(d3, hash33(i + 1.0))
    );
    return dot(vec4(31.316), n);
  }

  vec4 extractAlpha(vec3 colorIn) {
    float a = max(max(colorIn.r, colorIn.g), colorIn.b);
    return vec4(colorIn.rgb / (a + 1e-5), a);
  }

  const vec3 baseColor1 = vec3(0.133333, 0.827451, 0.933333);
  const vec3 baseColor2 = vec3(0.376471, 0.647059, 0.980392);
  const vec3 baseColor3 = vec3(0.031373, 0.184314, 0.286275);
  const float innerRadius = 0.6;
  const float noiseScale = 0.65;

  float light1(float intensity, float attenuation, float dist) {
    return intensity / (1.0 + dist * attenuation);
  }

  float light2(float intensity, float attenuation, float dist) {
    return intensity / (1.0 + dist * dist * attenuation);
  }

  vec4 draw(vec2 uv) {
    vec3 color1 = adjustHue(baseColor1, hue);
    vec3 color2 = adjustHue(baseColor2, hue);
    vec3 color3 = adjustHue(baseColor3, hue);

    float ang = atan(uv.y, uv.x);
    float len = length(uv);
    float invLen = len > 0.0 ? 1.0 / len : 0.0;
    float bgLuminance = dot(backgroundColor, vec3(0.299, 0.587, 0.114));

    float n0 = snoise3(vec3(uv * noiseScale, iTime * 0.5)) * 0.5 + 0.5;
    float r0 = mix(mix(innerRadius, 1.0, 0.4), mix(innerRadius, 1.0, 0.6), n0);
    float d0 = distance(uv, (r0 * invLen) * uv);
    float v0 = light1(1.0, 10.0, d0);

    v0 *= smoothstep(r0 * 1.05, r0, len);
    float innerFade = smoothstep(r0 * 0.8, r0 * 0.95, len);
    v0 *= mix(innerFade, 1.0, bgLuminance * 0.7);
    float cl = cos(ang + iTime * 2.0) * 0.5 + 0.5;

    float a = iTime * -1.0;
    vec2 pos = vec2(cos(a), sin(a)) * r0;
    float d = distance(uv, pos);
    float v1 = light2(1.5, 5.0, d);
    v1 *= light1(1.0, 50.0, d0);

    float v2 = smoothstep(1.0, mix(innerRadius, 1.0, n0 * 0.5), len);
    float v3 = smoothstep(innerRadius, mix(innerRadius, 1.0, 0.5), len);

    vec3 colBase = mix(color1, color2, cl);
    float fadeAmount = mix(1.0, 0.1, bgLuminance);

    vec3 darkCol = mix(color3, colBase, v0);
    darkCol = (darkCol + v1) * v2 * v3;
    darkCol = clamp(darkCol, 0.0, 1.0);

    vec3 lightCol = (colBase + v1) * mix(1.0, v2 * v3, fadeAmount);
    lightCol = mix(backgroundColor, lightCol, v0);
    lightCol = clamp(lightCol, 0.0, 1.0);

    vec3 finalCol = mix(darkCol, lightCol, bgLuminance);
    return extractAlpha(finalCol);
  }

  vec4 mainImage(vec2 fragCoord) {
    vec2 center = iResolution.xy * 0.5;
    float size = min(iResolution.x, iResolution.y);
    vec2 uv = (fragCoord - center) / size * 2.0;

    float angle = rot;
    float s = sin(angle);
    float c = cos(angle);
    uv = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y);

    uv.x += hover * hoverIntensity * 0.1 * sin(uv.y * 10.0 + iTime);
    uv.y += hover * hoverIntensity * 0.1 * sin(uv.x * 10.0 + iTime);

    return draw(uv);
  }

  void main() {
    vec2 fragCoord = vUv * iResolution.xy;
    vec4 col = mainImage(fragCoord);
    gl_FragColor = vec4(col.rgb * col.a, col.a);
  }
`;

function hasWebGLSupport() {
  if (typeof document === "undefined") return false;
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2", { alpha: true, antialias: false })
    || canvas.getContext("webgl", { alpha: true, antialias: false })
    || canvas.getContext("experimental-webgl");
  return Boolean(gl);
}

export default function LoginOrb({ className = "" }: LoginOrbProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !hasWebGLSupport()) return;

    let disposed = false;
    let frameId = 0;
    let lastTime = performance.now();
    let rotation = -0.45;
    let paused = document.visibilityState === "hidden";
    let hoverTarget = 0;
    let renderer: InstanceType<OglModule["Renderer"]> | null = null;
    let canvas: HTMLCanvasElement | null = null;
    let removeResizeListener: (() => void) | null = null;

    function cleanup() {
      disposed = true;
      if (frameId) cancelAnimationFrame(frameId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (canvas) {
        canvas.removeEventListener("webglcontextlost", handleContextLost);
        canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      }
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("blur", handlePointerLeave);
      if (canvas?.parentElement) {
        canvas.parentElement.removeChild(canvas);
      }
      removeResizeListener?.();
      removeResizeListener = null;
      const gl = renderer?.gl;
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
      canvas = null;
      renderer = null;
    }

    function handleVisibilityChange() {
      paused = document.visibilityState === "hidden";
      if (paused) hoverTarget = 0;
      lastTime = performance.now();
    }

    function handlePointerMove(event: MouseEvent) {
      const current = containerRef.current;
      if (!current) {
        hoverTarget = 0;
        return;
      }

      const rect = current.getBoundingClientRect();
      const size = Math.min(rect.width, rect.height);
      if (size <= 0) {
        hoverTarget = 0;
        return;
      }

      const x = ((event.clientX - rect.left) - rect.width / 2) / size * 2;
      const y = ((event.clientY - rect.top) - rect.height / 2) / size * 2;
      hoverTarget = Math.sqrt(x * x + y * y) < 0.8 ? 1 : 0;
    }

    function handlePointerLeave() {
      hoverTarget = 0;
    }

    function handleContextLost(event: Event) {
      event.preventDefault();
      paused = true;
      reportClientError({
        source: "login-orb",
        message: "Login orb WebGL context lost",
      });
    }

    function handleContextRestored() {
      paused = false;
      lastTime = performance.now();
    }

    import("ogl")
      .then(({ Renderer, Program, Mesh, Triangle }) => {
        if (disposed || !containerRef.current) return;

        try {
          renderer = new Renderer({
            dpr: 1,
            depth: false,
            alpha: true,
            antialias: false,
            premultipliedAlpha: false,
            powerPreference: "low-power",
          });
          const gl = renderer.gl;
          canvas = gl.canvas;
          canvas.className = "login-orb-canvas";
          containerRef.current.appendChild(canvas);
          gl.clearColor(0, 0, 0, 0);

          const geometry = new Triangle(gl);
          const program = new Program(gl, {
            vertex,
            fragment,
            uniforms: {
              iTime: { value: 0 },
              iResolution: { value: new Float32Array([1, 1, 1]) },
              hue: { value: 0 },
              hover: { value: 0 },
              rot: { value: rotation },
              hoverIntensity: { value: 0.42 },
              backgroundColor: { value: new Float32Array([0.008, 0.031, 0.09]) },
            },
            transparent: true,
            depthTest: false,
          });

          const mesh = new Mesh(gl, { geometry, program });

          const resize = () => {
            if (!containerRef.current || !renderer) return;
            const width = Math.max(1, containerRef.current.clientWidth);
            const height = Math.max(1, containerRef.current.clientHeight);
            renderer.setSize(width, height);
            program.uniforms.iResolution.value = new Float32Array([gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height]);
          };

          const update = (time: number) => {
            if (disposed || !renderer) return;
            frameId = requestAnimationFrame(update);
            if (paused) return;

            const delta = Math.min(48, time - lastTime);
            lastTime = time;
            rotation += delta * 0.00009;
            program.uniforms.iTime.value = time * 0.00045;
            program.uniforms.hover.value += (hoverTarget - program.uniforms.hover.value) * 0.1;
            program.uniforms.rot.value = rotation;

            try {
              renderer.render({ scene: mesh });
            } catch (error) {
              reportClientError({
                source: "login-orb",
                message: error instanceof Error ? error.message : "Failed to render login orb",
                stack: error instanceof Error ? error.stack : undefined,
              });
              cleanup();
            }
          };

          canvas.addEventListener("webglcontextlost", handleContextLost);
          canvas.addEventListener("webglcontextrestored", handleContextRestored);
          document.addEventListener("visibilitychange", handleVisibilityChange);
          window.addEventListener("mousemove", handlePointerMove);
          window.addEventListener("blur", handlePointerLeave);
          window.addEventListener("resize", resize);
          removeResizeListener = () => window.removeEventListener("resize", resize);
          resize();
          frameId = requestAnimationFrame(update);
        } catch (error) {
          reportClientError({
            source: "login-orb",
            message: error instanceof Error ? error.message : "Failed to initialize login orb",
            stack: error instanceof Error ? error.stack : undefined,
          });
          cleanup();
        }
      })
      .catch((error: unknown) => {
        if (disposed) return;
        reportClientError({
          source: "login-orb",
          message: error instanceof Error ? error.message : "Failed to initialize login orb",
          stack: error instanceof Error ? error.stack : undefined,
        });
      });

    return cleanup;
  }, []);

  return <div ref={containerRef} className={`login-orb-container ${className}`} aria-hidden="true" />;
}
