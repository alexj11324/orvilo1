import AmpAvatar from './Amp/components/Avatar';
import AmpColor from './Amp/components/Color';
import AmpMono from './Amp/components/Mono';
import { COLOR_PRIMARY as AmpPrimary, TITLE as AmpTitle } from './Amp/style';
import AppleAvatar from './Apple/components/Avatar';
import AppleMono from './Apple/components/Mono';
import { COLOR_PRIMARY as ApplePrimary, TITLE as AppleTitle } from './Apple/style';
import AwsAvatar from './Aws/components/Avatar';
import AwsColor from './Aws/components/Color';
import AwsMono from './Aws/components/Mono';
import { COLOR_PRIMARY as AwsPrimary, TITLE as AwsTitle } from './Aws/style';
import ClaudeCodeAvatar from './ClaudeCode/components/Avatar';
import ClaudeCodeColor from './ClaudeCode/components/Color';
import ClaudeCodeMono from './ClaudeCode/components/Mono';
import { COLOR_PRIMARY as ClaudeCodePrimary, TITLE as ClaudeCodeTitle } from './ClaudeCode/style';
import CodeBuddyAvatar from './CodeBuddy/components/Avatar';
import CodeBuddyColor from './CodeBuddy/components/Color';
import CodeBuddyMono from './CodeBuddy/components/Mono';
import { COLOR_PRIMARY as CodeBuddyPrimary, TITLE as CodeBuddyTitle } from './CodeBuddy/style';
import CodexAvatar from './Codex/components/Avatar';
import CodexColor from './Codex/components/Color';
import CodexMono from './Codex/components/Mono';
import { COLOR_PRIMARY as CodexPrimary, TITLE as CodexTitle } from './Codex/style';
import CursorAvatar from './Cursor/components/Avatar';
import CursorMono from './Cursor/components/Mono';
import { COLOR_PRIMARY as CursorPrimary, TITLE as CursorTitle } from './Cursor/style';
import DevinAvatar from './Devin/components/Avatar';
import DevinColor from './Devin/components/Color';
import DevinMono from './Devin/components/Mono';
import { COLOR_PRIMARY as DevinPrimary, TITLE as DevinTitle } from './Devin/style';
import ExaAvatar from './Exa/components/Avatar';
import ExaColor from './Exa/components/Color';
import ExaMono from './Exa/components/Mono';
import { COLOR_PRIMARY as ExaPrimary, TITLE as ExaTitle } from './Exa/style';
import GithubAvatar from './Github/components/Avatar';
import GithubMono from './Github/components/Mono';
import { COLOR_PRIMARY as GithubPrimary, TITLE as GithubTitle } from './Github/style';
import GoogleAvatar from './Google/components/Avatar';
import GoogleColor from './Google/components/Color';
import GoogleMono from './Google/components/Mono';
import { COLOR_PRIMARY as GooglePrimary, TITLE as GoogleTitle } from './Google/style';
import GrokAvatar from './Grok/components/Avatar';
import GrokMono from './Grok/components/Mono';
import { COLOR_PRIMARY as GrokPrimary, TITLE as GrokTitle } from './Grok/style';
import HermesAgentAvatar from './HermesAgent/components/Avatar';
import HermesAgentMono from './HermesAgent/components/Mono';
import {
  COLOR_PRIMARY as HermesAgentPrimary,
  TITLE as HermesAgentTitle,
} from './HermesAgent/style';
import KimiAvatar from './Kimi/components/Avatar';
import KimiColor from './Kimi/components/Color';
import KimiMono from './Kimi/components/Mono';
import { COLOR_PRIMARY as KimiPrimary, TITLE as KimiTitle } from './Kimi/style';
import MCPAvatar from './MCP/components/Avatar';
import MCPMono from './MCP/components/Mono';
import { COLOR_PRIMARY as MCPPrimary, TITLE as MCPTitle } from './MCP/style';
import MicrosoftAvatar from './Microsoft/components/Avatar';
import MicrosoftColor from './Microsoft/components/Color';
import MicrosoftMono from './Microsoft/components/Mono';
import { COLOR_PRIMARY as MicrosoftPrimary, TITLE as MicrosoftTitle } from './Microsoft/style';
import NotionAvatar from './Notion/components/Avatar';
import NotionMono from './Notion/components/Mono';
import { COLOR_PRIMARY as NotionPrimary, TITLE as NotionTitle } from './Notion/style';
import OllamaAvatar from './Ollama/components/Avatar';
import OllamaMono from './Ollama/components/Mono';
import { COLOR_PRIMARY as OllamaPrimary, TITLE as OllamaTitle } from './Ollama/style';
import OpenClawAvatar from './OpenClaw/components/Avatar';
import OpenClawColor from './OpenClaw/components/Color';
import OpenClawMono from './OpenClaw/components/Mono';
import { COLOR_PRIMARY as OpenClawPrimary, TITLE as OpenClawTitle } from './OpenClaw/style';
import OpenCodeAvatar from './OpenCode/components/Avatar';
import OpenCodeMono from './OpenCode/components/Mono';
import { COLOR_PRIMARY as OpenCodePrimary, TITLE as OpenCodeTitle } from './OpenCode/style';
import PiAvatar from './Pi/components/Avatar';
import PiMono from './Pi/components/Mono';
import { COLOR_PRIMARY as PiPrimary, TITLE as PiTitle } from './Pi/style';
import QoderAvatar from './Qoder/components/Avatar';
import QoderColor from './Qoder/components/Color';
import QoderMono from './Qoder/components/Mono';
import { COLOR_PRIMARY as QoderPrimary, TITLE as QoderTitle } from './Qoder/style';
import TraeAvatar from './Trae/components/Avatar';
import TraeColor from './Trae/components/Color';
import TraeMono from './Trae/components/Mono';
import { COLOR_PRIMARY as TraePrimary, TITLE as TraeTitle } from './Trae/style';
import UnslothAvatar from './Unsloth/components/Avatar';
import UnslothColor from './Unsloth/components/Color';
import UnslothMono from './Unsloth/components/Mono';
import { COLOR_PRIMARY as UnslothPrimary, TITLE as UnslothTitle } from './Unsloth/style';

export { getLobeIconCDN } from './features/getLobeIconCDN';
export type { IconAvatarProps, IconProps, IconType } from './types';
export const Amp = Object.assign(AmpMono, {
  Color: AmpColor,
  Avatar: AmpAvatar,
  colorPrimary: AmpPrimary,
  title: AmpTitle,
});
export const Apple = Object.assign(AppleMono, {
  Avatar: AppleAvatar,
  colorPrimary: ApplePrimary,
  title: AppleTitle,
});
export const Aws = Object.assign(AwsMono, {
  Color: AwsColor,
  Avatar: AwsAvatar,
  colorPrimary: AwsPrimary,
  title: AwsTitle,
});
export const ClaudeCode = Object.assign(ClaudeCodeMono, {
  Color: ClaudeCodeColor,
  Avatar: ClaudeCodeAvatar,
  colorPrimary: ClaudeCodePrimary,
  title: ClaudeCodeTitle,
});
export const CodeBuddy = Object.assign(CodeBuddyMono, {
  Color: CodeBuddyColor,
  Avatar: CodeBuddyAvatar,
  colorPrimary: CodeBuddyPrimary,
  title: CodeBuddyTitle,
});
export const Codex = Object.assign(CodexMono, {
  Color: CodexColor,
  Avatar: CodexAvatar,
  colorPrimary: CodexPrimary,
  title: CodexTitle,
});
export const Cursor = Object.assign(CursorMono, {
  Avatar: CursorAvatar,
  colorPrimary: CursorPrimary,
  title: CursorTitle,
});
export const Devin = Object.assign(DevinMono, {
  Color: DevinColor,
  Avatar: DevinAvatar,
  colorPrimary: DevinPrimary,
  title: DevinTitle,
});
export const Exa = Object.assign(ExaMono, {
  Color: ExaColor,
  Avatar: ExaAvatar,
  colorPrimary: ExaPrimary,
  title: ExaTitle,
});
export const Github = Object.assign(GithubMono, {
  Avatar: GithubAvatar,
  colorPrimary: GithubPrimary,
  title: GithubTitle,
});
export const Google = Object.assign(GoogleMono, {
  Color: GoogleColor,
  Avatar: GoogleAvatar,
  colorPrimary: GooglePrimary,
  title: GoogleTitle,
});
export const Grok = Object.assign(GrokMono, {
  Avatar: GrokAvatar,
  colorPrimary: GrokPrimary,
  title: GrokTitle,
});
export const HermesAgent = Object.assign(HermesAgentMono, {
  Avatar: HermesAgentAvatar,
  colorPrimary: HermesAgentPrimary,
  title: HermesAgentTitle,
});
export const Kimi = Object.assign(KimiMono, {
  Color: KimiColor,
  Avatar: KimiAvatar,
  colorPrimary: KimiPrimary,
  title: KimiTitle,
});
export const MCP = Object.assign(MCPMono, {
  Avatar: MCPAvatar,
  colorPrimary: MCPPrimary,
  title: MCPTitle,
});
export const Microsoft = Object.assign(MicrosoftMono, {
  Color: MicrosoftColor,
  Avatar: MicrosoftAvatar,
  colorPrimary: MicrosoftPrimary,
  title: MicrosoftTitle,
});
export const Notion = Object.assign(NotionMono, {
  Avatar: NotionAvatar,
  colorPrimary: NotionPrimary,
  title: NotionTitle,
});
export const Ollama = Object.assign(OllamaMono, {
  Avatar: OllamaAvatar,
  colorPrimary: OllamaPrimary,
  title: OllamaTitle,
});
export const OpenClaw = Object.assign(OpenClawMono, {
  Color: OpenClawColor,
  Avatar: OpenClawAvatar,
  colorPrimary: OpenClawPrimary,
  title: OpenClawTitle,
});
export const OpenCode = Object.assign(OpenCodeMono, {
  Avatar: OpenCodeAvatar,
  colorPrimary: OpenCodePrimary,
  title: OpenCodeTitle,
});
export const Pi = Object.assign(PiMono, {
  Avatar: PiAvatar,
  colorPrimary: PiPrimary,
  title: PiTitle,
});
export const Qoder = Object.assign(QoderMono, {
  Color: QoderColor,
  Avatar: QoderAvatar,
  colorPrimary: QoderPrimary,
  title: QoderTitle,
});
export const Trae = Object.assign(TraeMono, {
  Color: TraeColor,
  Avatar: TraeAvatar,
  colorPrimary: TraePrimary,
  title: TraeTitle,
});
export const Unsloth = Object.assign(UnslothMono, {
  Color: UnslothColor,
  Avatar: UnslothAvatar,
  colorPrimary: UnslothPrimary,
  title: UnslothTitle,
});
