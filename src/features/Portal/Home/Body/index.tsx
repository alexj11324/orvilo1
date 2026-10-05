import Files from './Files';
import Plugins from './Plugins';

const Home = () => {
  return (
    <div className="flex flex-col gap-3 h-[100%]">
      <Files />
      <Plugins />
    </div>
  );
};

export default Home;
