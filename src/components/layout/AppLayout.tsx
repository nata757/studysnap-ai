import { Header } from './Header';
import { BottomNav } from './BottomNav';

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
  showLogo?: boolean;
  showNav?: boolean;
}

export function AppLayout({ 
  children, 
  title, 
  showLogo = true, 
  showNav = true 
}: AppLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header title={title} showLogo={showLogo} />
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-20 pt-4">
        {children}
      </main>
      {showNav && <BottomNav />}
    </div>
  );
}
