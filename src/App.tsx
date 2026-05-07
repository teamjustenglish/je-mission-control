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
import StudentShare from "./pages/StudentShare";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();


const AppRoutes = () => {
  const { user, role, loading, roleLoading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }

  // While we have a user but the role is still being fetched, show a loading
  // state instead of falling through to a login page.
  if (user && roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }

  return (
    <Routes>
      {/* /admin/login — admin login form, OR admin dashboard if already signed in as admin */}
      <Route path="/admin/login" element={
        user && role === 'admin' ? <Navigate to="/admin/dashboard" replace /> : <AdminLoginPage />
      } />

      {/* /admin/* — admin dashboard if signed in as admin, otherwise the admin login form (no redirect) */}
      <Route path="/admin/*" element={
        user && role === 'admin' ? <AdminDashboard /> : <AdminLoginPage />
      } />

      {/* / — mod dashboard if signed in as moderator, otherwise the mod login form */}
      <Route path="/" element={
        user && role === 'moderator' ? <ModDashboard /> : <LoginPage />
      } />

      {/* Anything else → / */}
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
