import { SiReact } from '@icons-pack/react-simple-icons';
import { cssVar } from 'antd-style';
import { CodeXml, GlobeIcon, ImageIcon, OrigamiIcon } from 'lucide-react';
import { memo } from 'react';

import { Spinner } from '@/components/ui/spinner';

interface ArtifactProps {
  type: string;
}

const SIZE = 28;
const ArtifactIcon = memo<ArtifactProps>(({ type }) => {
  if (!type)
    return <Spinner className="text-muted-foreground" style={{ height: SIZE, width: SIZE }} />;

  switch (type) {
    case 'application/orvilo.artifacts.code': {
      return <CodeXml size={SIZE} style={{ color: cssVar.colorTextSecondary }} />;
    }

    case 'application/orvilo.artifacts.react': {
      return <SiReact size={SIZE} style={{ color: cssVar.colorTextSecondary }} />;
    }

    case 'image/svg+xml': {
      return <ImageIcon size={SIZE} style={{ color: cssVar.colorTextSecondary }} />;
    }
    case 'text/html': {
      return <GlobeIcon size={SIZE} style={{ color: cssVar.colorTextSecondary }} />;
    }
    default: {
      return <OrigamiIcon color={cssVar.purple} size={SIZE} strokeWidth={1.2} />;
    }
  }
});

export default ArtifactIcon;
