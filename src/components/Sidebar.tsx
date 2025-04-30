'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Define navigation items
const navItems = [
  { name: 'Dashboard', href: '/dashboard' },
  { name: 'Player Management', href: '/player-management' },
  { name: 'Food Order', href: '/food-order' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="w-64 bg-blue-600 text-white shadow-lg">
      <div className="p-5">
        <h1 className="text-2xl font-bold mb-6">Gamespace</h1>
        <nav>
          <ul className="space-y-2">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              
              return (
                <li key={item.name}>
                  <Link 
                    href={item.href}
                    className={`block py-2 px-4 rounded transition-colors ${
                      isActive 
                        ? 'bg-white text-blue-600 font-medium' 
                        : 'hover:bg-blue-500'
                    }`}
                  >
                    {item.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
      <div className="absolute bottom-0 left-0 w-64 p-5">
        <div className="flex items-center mb-2">
          <div className="w-8 h-8 bg-blue-300 rounded-full mr-2 flex items-center justify-center">
            <span className="text-blue-700 font-bold">A</span>
          </div>
          <div>
            <p className="font-medium">Admin</p>
            <p className="text-xs text-blue-200">Gaming Cafe</p>
          </div>
        </div>
      </div>
    </div>
  );
} 