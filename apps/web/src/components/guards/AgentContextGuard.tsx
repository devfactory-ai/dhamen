import { Navigate } from 'react-router-dom';
import { useAgentContext } from '@/features/agent/stores/agent-context';
import { getUser } from '@/lib/auth';

const AGENT_ROLES = ['INSURER_AGENT', 'INSURER_ADMIN'];

export function AgentContextGuard({ children }: { children: React.ReactNode }) {
  const user = getUser();
  const isContextReady = useAgentContext((s) => s.isContextReady());

  // Non-agent roles are not affected by this guard
  if (!user || !AGENT_ROLES.includes(user.role)) {
    return <>{children}</>;
  }

  if (!isContextReady) {
    return <Navigate to="/select-context" replace />;
  }

  return <>{children}</>;
}
