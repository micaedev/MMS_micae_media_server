import { Link, useLocation } from "react-router-dom";

const links = [
  { to: "/", label: "Ana sayfa", end: true },
  { to: "/setup", label: "Kurulum" },
  { to: "/watch", label: "İzleme" },
] as const;

export default function AppNav() {
  const { pathname } = useLocation();

  return (
    <nav className="app-nav" aria-label="Ana menü">
      {links.map(({ to, label, ...rest }) => {
        const end = "end" in rest && rest.end;
        const active = end ? pathname === to : pathname.startsWith(to);
        return (
          <Link
            key={to}
            to={to}
            className={active ? "nav-link nav-link-active" : "nav-link"}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
