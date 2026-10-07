import React from 'react';
import { Button } from './ui/button';

interface WelcomeScreenProps {
  onOpenSettings: (section?: "ollama" | "layer") => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onOpenSettings }) => {
  return (
    <div className="app-shell flex items-center">
      <div className="app-surface">
        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="app-panel rounded-[32px] px-6 py-8 sm:px-8 sm:py-10">
            <div className="mb-8 flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-100/90">
                Premium Workflow
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
                Unlocked Edition
              </span>
            </div>

            <div className="max-w-2xl space-y-4">
              <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Interview Coder, now cleaner across every screen size.
              </h1>
              <p className="max-w-xl text-sm leading-7 text-white/70 sm:text-base">
                Capture problem screenshots, process instantly, and review solutions and debugging
                in a layout optimized for any screen size.
              </p>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-white/45">Capture</p>
                <p className="mt-2 text-sm text-white/85">Screenshot queue stays clean even in compact viewports.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-white/45">Solve</p>
                <p className="mt-2 text-sm text-white/85">Solutions, thought process, and complexity follow a clear hierarchy.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-white/45">Debug</p>
                <p className="mt-2 text-sm text-white/85">Spacious debugging panel for in-depth analysis and code fixes.</p>
              </div>
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button
                className="h-12 rounded-2xl bg-white px-6 text-sm font-semibold text-slate-950 transition hover:bg-cyan-50"
                onClick={() => onOpenSettings("ollama")}
              >
                Open Settings
              </Button>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/65">
                Ensure local Ollama is active, then press <span className="text-white">Ctrl+H / Cmd+H</span> to capture your first problem.
              </div>
            </div>
          </div>

          <div className="app-panel rounded-[28px] p-6 sm:p-7">
            <div className="mb-5">
              <p className="app-section-title">Global Shortcuts</p>
              <p className="mt-2 text-sm text-white/60">
                Core shortcuts stay clearly visible and readily accessible.
              </p>
            </div>
            <div className="space-y-3">
              {[
                ["Toggle Visibility", "Ctrl+B / Cmd+B"],
                ["Focus App", "Ctrl+W / Cmd+W"],
                ["Take Screenshot", "Ctrl+H / Cmd+H"],
                ["Clear Text Input", "Ctrl+Backspace / Cmd+Backspace"],
                ["Delete All Screenshots", "Ctrl+Shift+L / Cmd+Shift+L"],
                ["Process Screenshots", "Ctrl+Enter / Cmd+Enter"],
                ["Terminate Processing", "Ctrl+. / Cmd+."],
                ["Reset View", "Ctrl+R / Cmd+R"],
                ["Quit App", "Ctrl+Q / Cmd+Q"]
              ].map(([label, shortcut]) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3"
                >
                  <span className="text-sm text-white/72">{label}</span>
                  <span className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/90">
                    {shortcut}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-5 text-center text-xs text-white/40">
              For Ollama, make sure the local server is running before getting started.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
