import { Markdown } from '@lobehub/ui';
import { cssVar } from 'antd-style';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import urlJoin from 'url-join';

import { CodeBlock } from '@/components/reui/code-block/code-block';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { OFFICIAL_SITE } from '@/const/url';

import { useDetailContext } from '../../DetailProvider';

type BadgeStyle = 'flat' | 'flat-square' | 'plastic' | 'for-the-badge';
type BadgeTheme = 'dark' | 'light';

const GithubBadge = memo(() => {
  const { t } = useTranslation('discover');
  const { identifier = '' } = useDetailContext();
  const [selectedStyle, setSelectedStyle] = useState<BadgeStyle>('flat-square');
  const [selectedTheme, setSelectedTheme] = useState<BadgeTheme>('dark');

  const pageUrl = urlJoin(OFFICIAL_SITE, 'mcp', identifier);
  const badgeUrl = urlJoin(OFFICIAL_SITE, 'badge/mcp', identifier);
  const styledBadgeUrl =
    selectedStyle === 'flat-square' ? badgeUrl : `${badgeUrl}?style=${selectedStyle}`;

  const badgeFullUrl = urlJoin(OFFICIAL_SITE, 'badge/mcp-full', identifier);

  // Build the full badge URL with theme parameter
  const styledBadgeFullUrl =
    selectedTheme === 'dark' ? badgeFullUrl : `${badgeFullUrl}?theme=${selectedTheme}`;

  const badgeLite = `[![MCP Badge](${styledBadgeUrl})](${pageUrl})`;

  const badge = `[![MCP Badge](${styledBadgeFullUrl})](${pageUrl})`;

  const styleOptions = [
    { label: 'Flat Square', value: 'flat-square' },
    { label: 'Flat', value: 'flat' },
    { label: 'Plastic', value: 'plastic' },
    { label: 'For The Badge', value: 'for-the-badge' },
  ];

  const themeOptions = [
    { label: 'Dark', value: 'dark' },
    { label: 'Light', value: 'light' },
  ];

  return (
    <>
      <Markdown>{t('mcp.details.githubBadge.desc')}</Markdown>

      <Select value={selectedStyle} onValueChange={(v) => setSelectedStyle(v as BadgeStyle)}>
        <SelectTrigger>
          <Badge style={{ marginRight: 4 }} variant="secondary">
            style
          </Badge>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {styleOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <CodeBlock code={badgeLite} language={'markdown'} style={{ fontSize: 12 }} />
      {}
      <img
        alt="MCP Badge"
        height={selectedStyle === 'for-the-badge' ? 28 : 20}
        src={styledBadgeUrl}
      />
      <div className="flex flex-row items-center gap-2">
        <Separator className="flex-1" />
        <span style={{ color: cssVar.colorTextDescription, fontSize: 12 }}>OR</span>
        <Separator className="flex-1" />
      </div>
      <Select value={selectedTheme} onValueChange={(v) => setSelectedTheme(v as BadgeTheme)}>
        <SelectTrigger>
          <Badge style={{ marginRight: 4 }} variant="secondary">
            theme
          </Badge>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {themeOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <CodeBlock code={badge} language={'markdown'} style={{ fontSize: 12 }} />
      {}
      <img alt="MCP Badge" src={styledBadgeFullUrl} />
    </>
  );
});

export default GithubBadge;
