import { Link, useLocation } from "wouter";
import { Brain, MessageSquare, Database, Settings } from "lucide-react";

interface NavigationProps {
  isCreator: boolean;
  hasAccess: boolean;
}

export function Navigation({ isCreator, hasAccess }: NavigationProps) {
  const [location] = useLocation();

  const links = [
    {
      href: "/",
      label: "Train",
      icon: Brain,
      gated: true,
    },
    {
      href: "/chat",
      label: "Chat",
      icon: MessageSquare,
      gated: true,
    },
    {
      href: "/corpus",
      label: "Corpus",
      icon: Database,
      gated: false,
    },
    ...(isCreator
      ? [
          {
            href: "/corpus/admin",
            label: "Admin",
            icon: Settings,
            gated: true,
          },
        ]
      : []),
  ];

  return (
    <nav className="bg-gray-900 border-b border-gray-800">
      <div className="max-w-6xl mx-auto flex gap-1 px-4 overflow-x-auto">
        {links.map(({ href, label, icon: Icon, gated }) => {
          const isActive = location === href;
          const isDisabled = gated && !hasAccess;

          return (
            <Link
              key={href}
              href={isDisabled ? "#" : href}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                isActive
                  ? "border-purple-500 text-purple-400"
                  : "border-transparent hover:text-gray-300 text-gray-500"
              } ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
              onClick={(e) => isDisabled && e.preventDefault()}
            >
              <Icon className="w-4 h-4" />
              {label}
              {gated && !hasAccess && (
                <span className="text-xs text-red-400">(Locked)</span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
