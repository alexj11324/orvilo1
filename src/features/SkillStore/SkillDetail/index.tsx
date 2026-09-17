'use client';

import { createModal } from '@lobehub/ui/base-ui';
import { t } from 'i18next';

import { BuiltinAgentSkillDetailContent } from './BuiltinAgentSkillDetailContent';
import { BuiltinSkillDetailContent } from './BuiltinSkillDetailContent';
import { ComposioSkillDetailContent } from './ComposioSkillDetailContent';
import { OrviloSkillDetailContent } from './OrviloSkillDetailContent';

export interface CreateBuiltinAgentSkillDetailModalOptions {
  identifier: string;
}

export const createBuiltinAgentSkillDetailModal = ({
  identifier,
}: CreateBuiltinAgentSkillDetailModalOptions) =>
  createModal({
    content: <BuiltinAgentSkillDetailContent identifier={identifier} />,
    footer: null,
    title: t('dev.title.skillDetails', { ns: 'plugin' }),
    width: 800,
  });

export interface CreateBuiltinSkillDetailModalOptions {
  identifier: string;
}

export const createBuiltinSkillDetailModal = ({
  identifier,
}: CreateBuiltinSkillDetailModalOptions) =>
  createModal({
    content: <BuiltinSkillDetailContent identifier={identifier} />,
    footer: null,
    title: t('dev.title.skillDetails', { ns: 'plugin' }),
    width: 800,
  });

export interface CreateComposioSkillDetailModalOptions {
  identifier: string;
  serverName: string;
}

export const createComposioSkillDetailModal = ({
  identifier,
  serverName,
}: CreateComposioSkillDetailModalOptions) =>
  createModal({
    content: <ComposioSkillDetailContent identifier={identifier} serverName={serverName} />,
    footer: null,
    title: t('dev.title.skillDetails', { ns: 'plugin' }),
    width: 800,
  });

export interface CreateOrviloSkillDetailModalOptions {
  identifier: string;
}

export const createOrviloSkillDetailModal = ({ identifier }: CreateOrviloSkillDetailModalOptions) =>
  createModal({
    content: <OrviloSkillDetailContent identifier={identifier} />,
    footer: null,
    title: t('dev.title.skillDetails', { ns: 'plugin' }),
    width: 800,
  });
