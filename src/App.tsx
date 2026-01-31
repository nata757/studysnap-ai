import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Routes, Route } from "react-router-dom";
import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { AuthGuard } from "@/components/auth/AuthGuard";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Search from "./pages/Search";
import Review from "./pages/Review";
import Profile from "./pages/Profile";
import AddMaterial from "./pages/AddMaterial";
import ReviewText from "./pages/ReviewText";
import MaterialDetails from "./pages/MaterialDetails";
import LectureDetail from "./pages/LectureDetail";
import Debug from "./pages/Debug";
import NotFound from "./pages/NotFound";
import "@/i18n";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route
            path="/"
            element={
              <AuthGuard>
                <Index />
              </AuthGuard>
            }
          />
          <Route
            path="/add-material"
            element={
              <AuthGuard>
                <AddMaterial />
              </AuthGuard>
            }
          />
          <Route
            path="/review-text"
            element={
              <AuthGuard>
                <ReviewText />
              </AuthGuard>
            }
          />
          <Route
            path="/material-details"
            element={
              <AuthGuard>
                <MaterialDetails />
              </AuthGuard>
            }
          />
          <Route
            path="/lecture/:id"
            element={
              <AuthGuard>
                <LectureDetail />
              </AuthGuard>
            }
          />
          <Route
            path="/search"
            element={
              <AuthGuard>
                <Search />
              </AuthGuard>
            }
          />
          <Route
            path="/review"
            element={
              <AuthGuard>
                <Review />
              </AuthGuard>
            }
          />
          <Route
            path="/profile"
            element={
              <AuthGuard>
                <Profile />
              </AuthGuard>
            }
          />
          <Route
            path="/debug"
            element={
              <AuthGuard>
                <Debug />
              </AuthGuard>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
