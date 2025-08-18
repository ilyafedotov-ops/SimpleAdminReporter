import { GraphQueryDefinition } from '../types';

export const riskyUsersQuery: GraphQueryDefinition = {
  id: 'risky_users',
  name: 'Risky Users',
  description: 'Identify users flagged as risky',
  category: 'security',
  query: {
    endpoint: '/identityProtection/riskyUsers',
    select: ['id', 'userPrincipalName', 'riskLevel', 'riskState'],
    orderBy: 'riskLevel desc'
  }
};

export function enrichRiskData(users: any[]): any[] {
  return users;
}
