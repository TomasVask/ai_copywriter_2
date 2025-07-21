import { Button } from '@/components/ui/button';
import { Menu, Settings, Plus, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { ChatSession } from '@/models/chatSession.model';
import { DownloadSelect } from './ui/download-select';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  chatHistory: ChatSession[];
  onSelectSession: (session: ChatSession) => void;
  onNewChat: () => void;
}

const Sidebar = ({
  isOpen,
  onToggle,
  chatHistory,
  onSelectSession,
  onNewChat,
}: SidebarProps) => {
  return (
    <>
      {/* Toggle Button */}
      <Button
        onClick={onToggle}
        variant="default"
        size="icon"
        className="fixed top-4 left-4 z-50  shadow-md hover:shadow-lg"
      >
        <Menu className="w-5 h-5" />
      </Button>

      {/* Sidebar */}
      <div
        className={`fixed left-0 top-0 h-full bg-white shadow-lg border-r transition-transform duration-300 z-40 ${isOpen ? 'translate-x-0' : '-translate-x-full'
          } w-80`}
      >
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold pl-18">Tekstų kūrimo asistentas</h2>
            <Link href="/settings">
              <Button variant="default" size="icon">
                <Settings className="w-4 h-4" />
              </Button>
            </Link>
          </div>

          <Button
            onClick={onNewChat}
            className="w-full mb-4"
            variant="outline"
          >
            <Plus className="w-4 h-4 mr-2" />
            Naujas pokalbis
          </Button>
        </div>

        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">Pokalbiai</h3>
          <div className="space-y-2">
            {chatHistory.length === 0 ? (
              <p className="text-sm text-gray-500">Kol kas pokalbių nėra</p>
            ) : (
              chatHistory.map((session) => (
                <div key={session.id} className="flex items-center space-x-2 group">
                  <Button
                    onClick={() => onSelectSession(session)}
                    variant="link"
                    className="w-full justify-start text-left h-auto py-1 pl-2"
                  >
                    <MessageSquare className="w-4 h-4 mr-2 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{session.title}</p>
                      <p className="text-xs text-gray-500">
                        {session.createdAt.toLocaleDateString()}
                      </p>
                    </div>
                  </Button>
                  <DownloadSelect session={session} />
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black opacity-50 z-30"
          onClick={onToggle}
        />
      )}
    </>
  );
};

export default Sidebar;