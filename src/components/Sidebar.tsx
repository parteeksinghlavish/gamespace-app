'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  HomeIcon,
  UserGroupIcon,
  QueueListIcon,
  IdentificationIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  // Cog6ToothIcon, // Example for a settings icon if needed later
} from '@heroicons/react/24/outline'; // Using outline icons for a cleaner look

// Define navigation items with icons
const navItems = [
  { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
  { name: 'Player Management', href: '/player-management', icon: UserGroupIcon },
  { name: 'All Entries', href: '/all-entries', icon: QueueListIcon },
  { name: 'Customer Management', href: '/customer-management', icon: IdentificationIcon },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div 
      className={`flex flex-col justify-between min-h-screen bg-gray-800 text-gray-100 shadow-xl transition-all duration-300 ease-in-out ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      <div>
        <div className={`flex items-center justify-between p-4 ${isCollapsed ? 'py-4' : 'py-5 border-b border-gray-700'}`}>
          {!isCollapsed && <h1 className="text-2xl font-semibold whitespace-nowrap">Gamespace</h1>}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-2 rounded-md text-gray-400 hover:bg-gray-700 hover:text-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? (
              <ChevronDoubleRightIcon className="h-6 w-6" />
            ) : (
              <ChevronDoubleLeftIcon className="h-6 w-6" />
            )}
          </button>
        </div>
        <nav className="mt-6 px-2">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
              const Icon = item.icon;
              
              return (
                <li key={item.name} className="relative">
                  <Link
                    href={item.href}
                    className={`flex items-center py-2.5 px-3 rounded-md transition-colors duration-150 ease-in-out group ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                    } ${isCollapsed ? 'justify-center' : ''}`}
                  >
                    <Icon className={`h-6 w-6 ${!isCollapsed ? 'mr-3' : ''} flex-shrink-0`} />
                    {!isCollapsed && <span className="text-sm font-medium">{item.name}</span>}
                  </Link>
                  {isCollapsed && (
                    <span 
                      className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs font-medium text-white bg-gray-900 rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10 pointer-events-none"
                    >
                      {item.name}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
      
      <div className={`p-3 border-t border-gray-700 ${isCollapsed ? 'py-3' : 'py-4'}`}>
        <div className="flex items-center">
          <div 
            className={`flex items-center justify-center rounded-full bg-indigo-500 text-white font-semibold flex-shrink-0 ${
              isCollapsed ? 'w-10 h-10 text-lg' : 'w-10 h-10 text-base mr-3'
            }`}
          >
            A
          </div>
          {!isCollapsed && (
            <div className="overflow-hidden whitespace-nowrap">
              <p className="text-sm font-semibold text-gray-100">Admin User</p>
              <p className="text-xs text-gray-400">Gamespace Cafe</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 