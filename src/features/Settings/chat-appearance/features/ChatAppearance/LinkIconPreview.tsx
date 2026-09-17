'use client';

import { createStaticStyles } from 'antd-style';
import { memo } from 'react';
import { Trans } from 'react-i18next';

import { OFFICIAL_SITE } from '@/const/url';
import { type OrviloLinkKind } from '@/features/Conversation/Markdown/plugins/Link/parse';
import LinkRender from '@/features/Conversation/Markdown/plugins/Link/Render';

const styles = createStaticStyles(({ css, cssVar }) => ({
  bubble: css`
    align-self: flex-start;

    padding-block: 10px;
    padding-inline: 14px;
    border-radius: 12px;

    font-size: 14px;
    line-height: 1.8;
    color: ${cssVar.colorText};

    background: ${cssVar.colorFillTertiary};
  `,
}));

interface SampleLinkProps {
  domain?: string;
  href: string;
  kind: OrviloLinkKind;
  label: string;
}

// Reuse the real message link renderer so the preview reflects the live
// `enableMessageLinkIcon` setting exactly as chat messages do.
const SampleLink = memo<SampleLinkProps>(({ kind, href, label, domain }) => (
  <LinkRender
    id={`link-icon-preview-${kind}`}
    node={{ properties: { linkDomain: domain, linkHref: href, linkKind: kind, linkLabel: label } }}
    tagName="orviloLink"
    type="element"
  >
    {null}
  </LinkRender>
));

const LinkIconPreview = memo(() => (
  <div className={styles.bubble}>
    <Trans
      i18nKey="settingChatAppearance.linkIcon.previewMessage"
      ns="setting"
      components={{
        repo: (
          <SampleLink
            href="https://github.com/alexj11324/orvilo1"
            kind="github"
            label="alexj11324/orvilo1"
          />
        ),
        site: (
          <SampleLink
            domain="orvilo.aspectlylabs.com"
            href={OFFICIAL_SITE}
            kind="generic"
            label="orvilo.aspectlylabs.com"
          />
        ),
      }}
    />
  </div>
));

LinkIconPreview.displayName = 'LinkIconPreview';

export default LinkIconPreview;
