import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import LoginPage from "./pages/LoginPage";
import AdminLoginPage from "./pages/AdminLoginPage";
import ModDashboard from "./pages/ModDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const AppRoutes = () => {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }

  return (
    <Routes>
      {/* Admin routes */}
      <Route path="/admin/login" element={
        user && role === 'admin' ? <Navigate to="/admin/dashboard" replace /> : <AdminLoginPage />
      } />
      <Route path="/admin/*" element={
        !user ? <Navigate to="/admin/login" replace /> :
        role !== 'admin' ? <Navigate to="/" replace /> :
        <AdminDashboard />
      } />

      {/* Mod / root routes */}
      <Route path="/" element={
        !user ? <LoginPage /> :
        role === 'admin' ? <Navigate to="/admin/dashboard" replace /> :
        <ModDashboard />
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
