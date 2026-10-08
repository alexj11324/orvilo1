import { Slider } from '@orvilo/ui';

export const Single = () => (
  <div style={{ width: 280 }}>
    <Slider defaultValue={[40]} max={100} />
  </div>
);

export const Range = () => (
  <div style={{ width: 280 }}>
    <Slider defaultValue={[20, 70]} max={100} />
  </div>
);

export const Disabled = () => (
  <div style={{ width: 280 }}>
    <Slider disabled defaultValue={[60]} max={100} />
  </div>
);
