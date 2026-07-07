import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from '@/components/layout/Layout';
import Dashboard from '@/pages/Dashboard';
import Clients from '@/pages/Clients';
import Torrents from '@/pages/Torrents';
import AddTorrent from '@/pages/AddTorrent';
import Trackers from '@/pages/Trackers';
import Monitor from '@/pages/Monitor';
import Settings from '@/pages/Settings';
import ApiPlayground from '@/pages/ApiPlayground';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/torrents" element={<Torrents />} />
            <Route path="/torrents/add" element={<AddTorrent />} />
            <Route path="/trackers" element={<Trackers />} />
            <Route path="/monitor" element={<Monitor />} />
            <Route path="/api" element={<ApiPlayground />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Layout>
      </Router>
    </QueryClientProvider>
  );
}
