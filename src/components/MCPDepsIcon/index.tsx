'use client';

import {
  SiApachemaven,
  SiBlender,
  SiBun,
  SiDeno,
  SiDocker,
  SiGit,
  SiGo,
  SiHelm,
  SiKubernetes,
  SiNodedotjs,
  SiNpm,
  SiPipx,
  SiPnpm,
  SiPython,
  SiRust,
  SiYarn,
} from '@icons-pack/react-simple-icons';
import { createElement, memo } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import Java from './Java';
import PowerShell from './PowerShell';
import Terminal from './Terminal';
import UV from './UV';

const icons: any = {
  blender: SiBlender,
  bun: SiBun,
  bunx: SiBun,
  deno: SiDeno,
  docker: SiDocker,
  git: SiGit,
  go: SiGo,
  helm: SiHelm,
  java: Java,
  kubectl: SiKubernetes,
  make: Terminal,
  manual: Terminal,
  maven: SiApachemaven,
  nodejs: SiNodedotjs,
  npm: SiNpm,
  npx: SiNpm,
  odbc: Terminal,
  pandoc: Terminal,
  pipx: SiPipx,
  pnpm: SiPnpm,
  pnpx: SiPnpm,
  powershell: PowerShell,
  python: SiPython,
  rust: SiRust,
  sh: Terminal,
  uv: UV,
  uvx: UV,
  yarn: SiYarn,
};

const InstallationIcon = memo<{ size?: number; type: string }>(({ type, size = 20 }) => {
  const iconType = type.split(' ')[0];
  if (iconType === 'none') return;
  return (
    <Tooltip>
      <TooltipTrigger render={<span />}>
        {createElement(icons?.[iconType] || Terminal, {
          size,
          style: { color: cssVar.colorTextDescription },
          fill: cssVar.colorTextDescription,
        })}
      </TooltipTrigger>
      <TooltipContent>{iconType}</TooltipContent>
    </Tooltip>
  );
});

export default InstallationIcon;
