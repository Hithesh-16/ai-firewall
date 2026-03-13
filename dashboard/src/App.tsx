import { Routes, Route, NavLink, Navigate, useLocation } from "react-router-dom";
import Overview from "./pages/Overview";
import Logs from "./pages/Logs";
import RiskScore from "./pages/RiskScore";
import Settings from "./pages/Settings";
import SecretTypes from "./pages/SecretTypes";
import Timeline from "./pages/Timeline";
import Providers from "./pages/Providers";
import Login from "./pages/Login";
import McpConfig from "./pages/McpConfig";
import Credits from "./pages/Credits";
import Usage from "./pages/Usage";

const NAV = [
  { to: "/", label: "Overview" },
  { to: "/providers", label: "Providers & Models" },
  { to: "/mcp", label: "MCP Servers" },
  { to: "/credits", label: "Credits" },
  { to: "/usage", label: "Usage Stats" },
  { to: "/logs", label: "Request Log" },
  { to: "/risk", label: "Risk Score" },
  { to: "/secrets", label: "Secret Types" },
  { to: "/timeline", label: "Timeline" },
  { to: "/settings", label: "Policy Config" }
];

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = localStorage.getItem("isAuthenticated") === "true";
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const location = useLocation();
  const isLoginPage = location.pathname === "/login";

  if (isLoginPage) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200">
      <aside className="w-56 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
        <div className="p-5 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <svg className="w-6 h-6 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
            <span className="font-semibold text-sm">AI Firewall</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">Security Dashboard</p>
        </div>

        <nav className="flex-1 py-3">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              className={({ isActive }) =>
                `block px-5 py-2.5 text-sm transition-colors ${
                  isActive
                    ? "text-white bg-slate-800 border-r-2 border-blue-400"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>

        <button 
          onClick={() => {
            localStorage.removeItem("isAuthenticated");
            window.location.href = "/login";
          }}
          className="p-4 border-t border-slate-800 text-[10px] text-slate-500 hover:text-red-400 hover:bg-red-400/5 text-left transition-colors flex items-center gap-2"
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Logout Session
        </button>
      </aside>

      <main className="flex-1 overflow-y-auto p-6">
        <Routes>
          <Route path="/" element={<ProtectedRoute><Overview /></ProtectedRoute>} />
          <Route path="/providers" element={<ProtectedRoute><Providers /></ProtectedRoute>} />
          <Route path="/mcp" element={<ProtectedRoute><McpConfig /></ProtectedRoute>} />
          <Route path="/credits" element={<ProtectedRoute><Credits /></ProtectedRoute>} />
          <Route path="/usage" element={<ProtectedRoute><Usage /></ProtectedRoute>} />
          <Route path="/logs" element={<ProtectedRoute><Logs /></ProtectedRoute>} />
          <Route path="/risk" element={<ProtectedRoute><RiskScore /></ProtectedRoute>} />
          <Route path="/secrets" element={<ProtectedRoute><SecretTypes /></ProtectedRoute>} />
          <Route path="/timeline" element={<ProtectedRoute><Timeline /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
