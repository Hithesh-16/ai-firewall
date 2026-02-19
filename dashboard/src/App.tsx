import { Routes, Route, NavLink } from "react-router-dom";
import Overview from "./pages/Overview";
import Logs from "./pages/Logs";
import RiskScore from "./pages/RiskScore";
import Settings from "./pages/Settings";
import SecretTypes from "./pages/SecretTypes";
import Timeline from "./pages/Timeline";

const NAV = [
  { to: "/", label: "Overview" },
  { to: "/logs", label: "Request Log" },
  { to: "/risk", label: "Risk Score" },
  { to: "/secrets", label: "Secret Types" },
  { to: "/timeline", label: "Timeline" },
  { to: "/settings", label: "Policy Config" }
];

export default function App() {
  return (
    <div className="flex h-screen">
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

        <div className="p-4 border-t border-slate-800 text-[10px] text-slate-600">
          v0.2.0 · localhost:3000
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-slate-950 p-6">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/risk" element={<RiskScore />} />
          <Route path="/secrets" element={<SecretTypes />} />
          <Route path="/timeline" element={<Timeline />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
