import ImageSearchRef from './ImageSearchRef';
import Link from './Link';
import LocalFile from './LocalFile';
import LocalFileLink from './LocalFileLink';
import Mention from './Mention';
import OrviloAgents from './OrviloAgents';
import OrviloArtifact from './OrviloArtifact';
import OrviloThinking from './OrviloThinking';
import Skill from './Skill';
import Task from './Task';
import Thinking from './Thinking';
import Tool from './Tool';
import { type MarkdownElement } from './type';
import UserFeedback from './UserFeedback';

export type { MarkdownElement } from './type';

export const markdownElements: MarkdownElement[] = [
  Thinking,
  OrviloArtifact,
  OrviloThinking,
  LocalFile,
  Mention,
  Skill,
  Tool,
  Task,
  UserFeedback,
  ImageSearchRef,
  OrviloAgents,
  LocalFileLink,
  Link,
];
