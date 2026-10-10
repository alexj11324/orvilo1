
import { ListTodo } from 'lucide-react';
import { type FC, type PropsWithChildren } from 'react';

const TaskAvatar: FC<PropsWithChildren> = ({ children }) => {
  return (
    <div className="flex flex-col" style={{ flex: 'none', height: 28, width: 28, position: 'relative' }}>
      {children}
      <div
        className="flex flex-col items-center justify-center"
        style={{
          flex: 'none',
          height: 16,
          border: '1px solid var(--border)',
          width: 16,
          borderRadius: 4,
          position: 'absolute',
          right: -4,
          top: -4,
        }}
      >
        <ListTodo color={'var(--ant-color-text-description)'} size={10} />
      </div>
    </div>
  );
};

export default TaskAvatar;
