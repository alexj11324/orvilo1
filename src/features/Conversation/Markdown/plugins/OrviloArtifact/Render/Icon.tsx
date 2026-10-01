import { SiReact } from '@icons-pack/react-simple-icons';
import { cssVar } from 'antd-style';
import { CodeXml, GlobeIcon, ImageIcon, Loader2, OrigamiIcon } from 'lucide-react';
import { memo } from 'react';

interface ArtifactProps {
  type: string;
}

const SIZE = 28;
const ArtifactIcon = memo<ArtifactProps>(({ type }) => {
  if (!type)
    return (
      <Loader2 className="animate-spin" size={SIZE} style={{ color: cssVar.colorTextSecondary }} />
    );

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
