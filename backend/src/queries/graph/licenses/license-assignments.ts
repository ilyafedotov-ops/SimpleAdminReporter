import { GraphQueryDefinition } from '../types';
export const licenseAssignmentsQuery: GraphQueryDefinition = {
  id: 'license_assignments',
  name: 'License Assignments',
  description: 'Report on license assignments',
  category: 'licenses',
  query: {
    endpoint: '/users',
    select: ['id', 'displayName', 'assignedLicenses', 'assignedPlans']
  },
  postProcess: { transform: 'enrichLicenseData' }
};
export function enrichLicenseData(users: any[]): any[] { return users; }
