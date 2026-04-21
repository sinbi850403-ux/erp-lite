export const navigationItems = [
  {
    to: '/',
    label: 'Overview',
    hint: 'Operations cockpit and migration status',
    title: 'Operations Overview',
    eyebrow: 'Dashboard',
  },
  {
    to: '/inventory',
    label: 'Inventory',
    hint: 'Table, summary, filters, low stock focus',
    title: 'Inventory Workspace',
    eyebrow: 'Inventory',
  },
  {
    to: '/inout',
    label: 'Inout',
    hint: 'Transactions, status board, recent flows',
    title: 'Inout Workspace',
    eyebrow: 'Transactions',
  },
  {
    to: '/auth',
    label: 'Auth',
    hint: 'Session, role, and sign-in controls',
    title: 'Authentication',
    eyebrow: 'Auth',
  },
];

export function getNavigationMeta(pathname: string) {
  const item =
    navigationItems.find((entry) => entry.to === pathname) ||
    navigationItems.find((entry) => entry.to !== '/' && pathname.startsWith(entry.to));

  return item || navigationItems[0];
}
